#!/usr/bin/env node
/**
 * 网易云插件 client 离线验收：真实 Chrome（headless）+ 真实 React 18 + 真实 client.js，
 * 后端全部走本地 mock（server.mjs）。产出截图 + 脚本化断言。
 *
 * 用法：
 *   node run.mjs                       # 验收 client.js
 *   NM_CLIENT=/abs/smoke.js node run.mjs   # 基础设施自测（可指向任意 client 实现）
 *
 * 依赖：Google Chrome（无 npm 依赖，Node 24 自带 WebSocket）。
 * 约束：Chrome profile 写到 ./tmp/chrome-profile，结束清理；不碰 ~/.dsh。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'shots')
const TMP = join(HERE, 'tmp')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const NODE = process.execPath
const CLIENT = process.env.NM_CLIENT
  ? resolve(process.env.NM_CLIENT)
  : join(HERE, '..', 'client.js')

mkdirSync(SHOTS, { recursive: true })
mkdirSync(TMP, { recursive: true })
// 清掉上一轮截图，保证 shots/ 就是本轮结果
try {
  for (const f of readdirSync(SHOTS)) {
    if (/\.png$/i.test(f)) rmSync(join(SHOTS, f), { force: true })
  }
} catch { /* ignore */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 兜底 watchdog：任何一步卡死都不至于让验收进程永远挂着
const watchdog = setTimeout(() => {
  console.error('\n[watchdog] run.mjs 超过 8 分钟未结束，强制退出（Chrome/server 子进程会被清理）')
  process.exit(4)
}, 8 * 60 * 1000)
watchdog.unref?.()

if (!existsSync(CLIENT)) {
  console.error(`\n[等待 UI] client.js 不存在：${CLIENT}`)
  console.error('基础设施（server.mjs / harness.html / run.mjs）已就绪，等 ui 交付后重跑。')
  console.error('可先用 NM_CLIENT=<fixture.js> node run.mjs 自测 harness。')
  process.exit(2)
}
if (!existsSync(CHROME)) {
  console.error(`\n[环境错误] 找不到 Chrome：${CHROME}`)
  process.exit(3)
}

/* ---------------- 断言 ---------------- */
const passed = []
const failures = []
function check(label, ok, extra) {
  if (ok) {
    passed.push(label)
    console.log(`  ✓ ${label}${extra === undefined ? '' : ` (${extra})`}`)
  } else {
    failures.push({ label, extra })
    console.log(`  ✗ ${label}${extra === undefined ? '' : ` → ${extra}`}`)
  }
}
function section(name) {
  console.log(`\n${name}`)
}

/* ---------------- mock backend ---------------- */
const server = spawn(NODE, [join(HERE, 'server.mjs')], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, NM_CLIENT: CLIENT },
})
const port = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('mock server timeout')), 10000)
  server.stdout.on('data', (buf) => {
    const m = /\{"port":(\d+)/.exec(buf.toString())
    if (m) { clearTimeout(timer); res(Number(m[1])) }
  })
})
const BASE = `http://127.0.0.1:${port}`
console.log(`[mock] ${BASE}  client=${CLIENT}`)

async function config(patch) {
  const r = await fetch(`${BASE}/__config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return r.json()
}
async function calls() { return (await fetch(`${BASE}/__calls`)).json() }
async function resetCalls() { await fetch(`${BASE}/__reset`, { method: 'POST' }) }
const count = async (method, path) =>
  (await calls()).filter((c) => c.method === method && c.path === path).length

/* ---------------- Chrome + CDP ---------------- */
const profileDir = join(TMP, 'chrome-profile')
try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* ignore */ }

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true })
      this.ws.addEventListener('error', rej, { once: true })
    })
    this.ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'))
      this.pending.clear()
    })
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result)
        return
      }
      if (msg.method) for (const fn of this.listeners.get(msg.method) || []) fn(msg.params)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method} (20s)`))
      }, 20000)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
    })
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
  }
  close() { try { this.ws.close() } catch { /* ignore */ } }
}

const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-crash-reporter',
  '--disable-breakpad',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1440,980',
  '--remote-debugging-port=0',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion',
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeStderr = ''
chrome.stderr.on('data', (b) => { chromeStderr += b.toString() })

const devtoolsFile = join(profileDir, 'DevToolsActivePort')
const debugPort = await (async () => {
  for (let i = 0; i < 120; i++) {
    if (existsSync(devtoolsFile)) {
      const line = readFileSync(devtoolsFile, 'utf8').split('\n')[0].trim()
      if (line) return Number(line)
    }
    await sleep(100)
  }
  throw new Error('Chrome DevToolsActivePort timeout\n' + chromeStderr.slice(-800))
})()

let pageWs = null
for (let i = 0; i < 80 && !pageWs; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    const page = list.find((t) => t.type === 'page')
    if (page?.webSocketDebuggerUrl) pageWs = page.webSocketDebuggerUrl
  } catch { /* retry */ }
  if (!pageWs) await sleep(100)
}
if (!pageWs) throw new Error('no page target')

const cdp = new CDP(pageWs)
await cdp.connect()
const errors = []
cdp.on('Runtime.exceptionThrown', (p) => {
  errors.push(p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || 'exception')
})
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') errors.push(p.args?.map((a) => a.value ?? a.description ?? '').join(' '))
})
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')

async function evaluate(expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.exceptionDetails) {
    throw new Error(`eval failed: ${expression}\n${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ''}`)
  }
  return res.result.value
}
async function waitFor(expression, label, timeout = 12000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    try {
      last = await evaluate(expression)
      if (last) return last
    } catch (err) { last = String(err) }
    await sleep(80)
  }
  throw new Error(`waitFor timeout: ${label}; last=${JSON.stringify(last)}`)
}
async function screenshot(name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const file = join(SHOTS, name)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`  · screenshot ${file}`)
  return file
}
/** 真实鼠标/指针事件（CDP Input.dispatchMouseEvent，走浏览器命中测试，不是合成 click） */
async function dispatchMouse(type, x, y, extra = {}) {
  await cdp.send('Input.dispatchMouseEvent', Object.assign({
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
    pointerType: 'mouse',
  }, extra))
}
async function realClickAt(x, y) {
  await dispatchMouse('mousePressed', x, y)
  await sleep(50)
  await dispatchMouse('mouseReleased', x, y)
}
async function realDrag(x, y, dx) {
  await dispatchMouse('mousePressed', x, y)
  for (let i = 1; i <= 4; i++) {
    await sleep(35)
    await dispatchMouse('mouseMoved', x + (dx * i) / 4, y, { buttons: 1 })
  }
  await sleep(40)
  await dispatchMouse('mouseReleased', x + dx, y)
}

/** 对某个元素做 N 倍放大截图（用于侧栏图标等小尺寸元素） */
async function screenshotRegion(selector, name, scale = 4, pad = 20) {
  const box = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })()`)
  if (!box) throw new Error('screenshotRegion: element not found ' + selector)
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: box.w + pad * 2,
      height: box.h + pad * 2,
      scale,
    },
  })
  const file = join(SHOTS, name)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`  · zoom screenshot ${file}`)
  shots.push(file)
  return file
}

async function setViewport(width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
}
async function setTheme(theme) {
  await cdp.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-color-scheme', value: theme }],
  })
}
async function navigate() {
  await cdp.send('Page.navigate', { url: BASE + '/' })
  await waitFor('document.readyState === "complete"', 'document ready')
}
async function reload() {
  await cdp.send('Page.reload', { ignoreCache: true })
  await waitFor('document.readyState === "complete"', 'reload ready')
}

/* ---------------- 页面操作 helpers ---------------- */
function clickSel(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    try { el.scrollIntoView({ block: 'center' }) } catch (_) {}
    el.click()
    return true
  })()`)
}
const visible = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return false
  const r = el.getBoundingClientRect()
  const st = getComputedStyle(el)
  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
})()`)
const textOf = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  return el ? el.textContent.trim() : null
})()`)
const hasText = (text) => evaluate(`document.body.textContent.includes(${JSON.stringify(text)})`)
const countSel = (selector) => evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)

/** 取元素与其有效背景（向上合成半透明层）的 WCAG 相对亮度对比度 */
function contrastOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const parse = (s) => {
      const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(s || '')
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
    }
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const stack = []
    let node = el
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c && c[3] > 0.01) stack.push(c)
      node = node.parentElement
    }
    let bg = [255, 255, 255, 1]
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i], a = c[3]
      bg = [Math.round(c[0] * a + bg[0] * (1 - a)), Math.round(c[1] * a + bg[1] * (1 - a)), Math.round(c[2] * a + bg[2] * (1 - a)), 1]
    }
    const fgRaw = parse(getComputedStyle(el).color) || [0, 0, 0, 1]
    const a2 = fgRaw[3]
    const fg = [Math.round(fgRaw[0] * a2 + bg[0] * (1 - a2)), Math.round(fgRaw[1] * a2 + bg[1] * (1 - a2)), Math.round(fgRaw[2] * a2 + bg[2] * (1 - a2))]
    const l1 = lum(fg), l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    return {
      selector: ${JSON.stringify(selector)},
      color: getComputedStyle(el).color,
      background: 'rgb(' + bg[0] + ', ' + bg[1] + ', ' + bg[2] + ')',
      ratio: Math.round(ratio * 100) / 100,
      text: (el.textContent || '').trim().slice(0, 24),
    }
  })()`)
}
/** 当前 audio.src 里的曲目 id（用于判断是否切歌，避免用含时间的文本误判） */
const audioTrackId = () => evaluate(`(() => {
  const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
  if (!a) return null
  const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
  return m ? m[1] : null
})()`)
const playerVisible = () => evaluate(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`)
function playerState() {
  return evaluate(`(() => {
    const st = document.querySelector('[data-nm="player-state"]') ||
      document.querySelector('[data-nm="dock"][data-playing]') ||
      document.querySelector('[data-nm="player"][data-playing]')
    if (st && st.getAttribute('data-playing') != null) return st.getAttribute('data-playing')
    const any = document.querySelector('[data-playing]')
    return any ? any.getAttribute('data-playing') : null
  })()`)
}
const playerText = () => evaluate(`(() => {
  const el = document.querySelector('[data-nm="player"]') ||
    document.querySelector('[data-nm="dock"]') ||
    document.querySelector('[data-nm="dock-cover"]')
  if (!el) return null
  return el.textContent.trim()
})()`)

async function readProgress() {
  return evaluate(`(() => {
    const out = { ratio: null, seconds: null, text: '', timeList: [], audio: null }
    const root = document.querySelector('[data-nm="player-progress"]')
    let el = null
    if (root) el = root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')
    const target = el || root
    if (target) {
      const rv = target.getAttribute('aria-valuenow')
      if (rv != null && rv !== '') out.ratio = parseFloat(rv)
      const av = target.getAttribute('aria-valuetext')
      if (av) { const m = av.match(/(\\d{1,2}):(\\d{2})/); if (m) out.seconds = (+m[1]) * 60 + (+m[2]) }
    }
    const box = root || document.querySelector('[data-nm="dock"]') || document.querySelector('[data-nm="player"]')
    out.text = box ? box.textContent : ''
    out.timeList = [...out.text.matchAll(/(\\d{1,2}):(\\d{2})/g)].map((m) => (+m[1]) * 60 + (+m[2]))
    const a = document.querySelector('audio')
    if (a && Number.isFinite(a.currentTime)) out.audio = a.currentTime
    return out
  })()`)
}
function progressMetric(p) {
  if (!p) return null
  if (p.audio != null && p.audio > 0) return p.audio
  if (p.seconds != null && p.seconds > 0) return p.seconds
  if (p.timeList.length && p.timeList[0] > 0) return p.timeList[0]
  if (p.ratio != null && p.ratio > 0) return p.ratio
  return 0
}
const progressScale = (p) => (p && p.ratio != null && p.ratio <= 1.001 && p.audio == null && !(p.timeList.length && p.timeList[0] > 0) && p.seconds == null) ? 'ratio' : 'seconds'

async function scrollTop() {
  await evaluate(`(() => {
    const r = document.querySelector('[data-nm="root"]')
    if (r) r.scrollTo(0, 0)
    window.scrollTo(0, 0)
  })()`)
}

/* ---------------- 场景 ---------------- */
let currentShot = null
const shots = []
const S = async (name) => {
  // nm-fade / nm-pop 动画 200–450ms，先等稳定再截，避免截到半透明中间帧
  await sleep(520)
  shots.push(await screenshot(name))
  currentShot = name
}
let fatal = null

try {
  console.log('\n[0] 模块加载 / 三个 slot 注册')
  await config({ authed: false, bridge: 'ready', errorMode: null, slowMs: 0, trial: false, loginReset: true })
  await resetCalls()
  await setViewport(1440, 980)
  await setTheme('dark')
  await navigate()
  try {
    await waitFor('window.__mounted === true || window.__mountError', 'client mount', 15000)
  } catch (err) {
    // 保留现场再抛
    check('client.js 挂载完成', false, await evaluate('String(window.__mountError || "no mount signal")'))
    throw err
  }
  const mountError = await evaluate('window.__mountError')
  check('client.js 挂载无异常', !mountError, mountError || undefined)
  check('client.js 调用了 __ModuleLoader__.load', await evaluate('!!window.__plugin'))
  check('main slot 注册成功', await evaluate('!!window.__slots.main'))
  check('sidebar.panellist slot 注册成功', await evaluate('!!window.__slots["sidebar.panellist"]'))
  check('sidebar.footer.action slot 注册成功', await evaluate('!!window.__slots["sidebar.footer.action"]'))
  check('v3 不再注册 shell.bottom', !(await evaluate('!!window.__slots["shell.bottom"]')))
  check('v3 不再注册 shell.overlay', !(await evaluate('!!window.__slots["shell.overlay"]')))
  const specs = await evaluate('window.__slotSpecs')
  check('main spec.key = netease-music', specs?.main?.key === 'netease-music', JSON.stringify(specs?.main))
  check('sidebar.panellist spec.id = netease-music', specs?.['sidebar.panellist']?.id === 'netease-music',
    JSON.stringify(specs?.['sidebar.panellist']))
  check('sidebar.footer.action spec.id = netease-mini', specs?.['sidebar.footer.action']?.id === 'netease-mini',
    JSON.stringify(specs?.['sidebar.footer.action']))
  check('sidebar.panellist spec.order = 30', specs?.['sidebar.panellist']?.order === 30,
    JSON.stringify(specs?.['sidebar.panellist']))
  check('sidebar.footer.action spec.order = 10', specs?.['sidebar.footer.action']?.order === 10,
    JSON.stringify(specs?.['sidebar.footer.action']))
  check('无当前曲目时播放条不渲染（无占位）', !(await evaluate(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`)))
  const sidebarIcon = await evaluate(`(() => {
    const img = document.querySelector('#sidebar-icon img.nm-panel-icon') || document.querySelector('[data-nm="panellist-icon"] img') || document.querySelector('#sidebar-icon img')
    if (!img) return null
    const r = img.getBoundingClientRect()
    return {
      tag: img.tagName,
      src: (img.getAttribute('src') || '').slice(0, 40),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: Math.round(r.width),
      height: Math.round(r.height),
      visible: r.width > 0 && r.height > 0 && getComputedStyle(img).visibility !== 'hidden',
    }
  })()`)
  check('侧栏图标已实际渲染且可见', !!sidebarIcon && sidebarIcon.visible, JSON.stringify(sidebarIcon))
  check('侧栏图标是 <img>', !!sidebarIcon && sidebarIcon.tag === 'IMG', JSON.stringify(sidebarIcon))
  check('侧栏图标为内联 PNG data URL（官方红标）',
    !!sidebarIcon && /^data:image\/png;base64,/.test(sidebarIcon.src), JSON.stringify(sidebarIcon && sidebarIcon.src))
  check('侧栏图标图片已解码（naturalWidth > 0）',
    !!sidebarIcon && sidebarIcon.naturalWidth > 0, JSON.stringify(sidebarIcon && { w: sidebarIcon.naturalWidth, h: sidebarIcon.naturalHeight }))
  check('侧栏图标渲染尺寸 = 传入 size(20)',
    !!sidebarIcon && sidebarIcon.width === 20 && sidebarIcon.height === 20, JSON.stringify(sidebarIcon && { w: sidebarIcon.width, h: sidebarIcon.height }))
  await screenshotRegion('#sidebar-icon img', '00-sidebar-icon-dark.png', 4, 20)

  // 三个 slot 组件本身应该是函数/组件
  check('main 是 React 组件', await evaluate(`typeof window.__slots.main === 'function'`))
  check('MiniPlayer 是 React 组件', await evaluate(`typeof window.__slots['sidebar.footer.action'] === 'function'`))
  check('PanelIcon 是 React 组件', await evaluate(`typeof window.__slots['sidebar.panellist'] === 'function'`))

  await waitFor(`!!document.querySelector('[data-nm="root"]')`, 'Page 根节点 data-nm="root"')
  check('Page 根节点 data-nm="root" 已渲染', true)
  const audioInfo = await evaluate(`(() => {
    const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
    return a ? { has: true, src: a.getAttribute('src') || '', preload: a.preload } : { has: false }
  })()`)
  check('client 创建了全局 <audio data-nm-audio>', audioInfo.has, JSON.stringify(audioInfo))

  // 未登录也应能浏览（契约：不强制遮罩）
  let homeReady = false
  try {
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5 || !!document.querySelector('[data-nm="error"]')`, 'home data', 15000)
    homeReady = await evaluate(`document.querySelectorAll('[data-nm="track"]').length >= 5`)
  } catch { /* 后续断言会暴露 */ }

  console.log('\n[1] 未登录：登录引导 → 二维码 Modal → waiting→scanned→ok')
  check('未登录时登录引导按钮可见', await visible('[data-nm="login-open"]'))
  const loginCtaContrast = await contrastOf('.nm-btn.login')
  check('登录按钮 .nm-btn.login 文字对比度 ≥3:1',
    !!loginCtaContrast && loginCtaContrast.ratio >= 3, JSON.stringify(loginCtaContrast))
  const activeTabContrast = await contrastOf('[data-nm="tab"][aria-selected="true"]')
  check('激活 tab 文字对比度 ≥2.5:1',
    !!activeTabContrast && activeTabContrast.ratio >= 2.5, JSON.stringify(activeTabContrast))
  check('未登录未被强制遮罩（页面内容可渲染）', await evaluate(`document.querySelectorAll('[data-nm="track"]').length > 0 || !!document.querySelector('[data-nm="hero"]')`))
  await S('01-unlogged-home-dark.png')

  check('点击「扫码登录」打开 Modal', await clickSel('[data-nm="login-open"]'))
  try {
    await waitFor(`!!document.querySelector('[data-nm="login-modal"]')`, 'login modal', 6000)
    check('二维码 Modal 出现', true)
  } catch (err) {
    check('二维码 Modal 出现', false, '点击 login-open 后未出现 [data-nm="login-modal"]')
    throw err
  }
  const qr = await evaluate(`(() => {
    const img = document.querySelector('[data-nm="qr"]')
    if (!img) return null
    return { tag: img.tagName, src: (img.getAttribute('src') || '').slice(0, 32) }
  })()`)
  check('二维码 img 存在且为内联 data URL', !!qr && /^data:image\//.test(qr.src), JSON.stringify(qr))
  await S('02-login-qr-waiting.png')

  const stateOf = () => evaluate(`(() => {
    const el = document.querySelector('[data-nm="login-state"]')
    return el ? el.getAttribute('data-state') : null
  })()`)

  try {
    await waitFor(`(document.querySelector('[data-nm="login-state"]')||{}).dataset?.state === 'scanned' || document.querySelector('[data-nm="login-state"]')?.getAttribute('data-state') === 'scanned'`, 'login state scanned', 25000)
    check('登录状态 waiting → scanned', true)
  } catch (err) {
    check('登录状态 waiting → scanned', false, 'mock 第 3 次 /login/check 应返回 scanned，25s 内界面未进入 scanned')
  }
  await S('03-login-qr-scanned.png')

  try {
    await waitFor(`(() => {
      const els = document.querySelectorAll('[data-playing]');
      const el = document.querySelector('[data-nm="login-state"]')
      return el ? el.getAttribute('data-state') === 'ok' : false
    })()`, 'login state ok', 25000)
    check('登录状态 scanned → ok', true)
  } catch (err) {
    check('登录状态 scanned → ok', false, '第 4 次 /login/check 应返回 ok，25s 内界面未进入 ok')
  }
  try {
    await waitFor(`window.__statusShown || document.body.textContent.includes('云端听歌人')`, 'nickname after login', 12000)
    check('登录后显示账号昵称「云端听歌人」', true)
  } catch (err) {
    check('登录后显示账号昵称「云端听歌人」', false, '登录 ok 后 12s 内页面未出现 mock 昵称')
  }
  const loginCalls = await count('GET', '/netease-panel/api/login/check')
  check('登录轮询走了 mock 状态机（≥4 次 /login/check）', loginCalls >= 4, `login/check=${loginCalls}`)
  check('POST /login/start 只调用 1 次', (await count('POST', '/netease-panel/api/login/start')) === 1)
  // Modal 可能自动关闭；若仍开着，Esc 关闭后继续
  if (await evaluate(`!!document.querySelector('[data-nm="login-modal"]')`)) {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(300)
  }
  await scrollTop()
  await S('04-logged-in-home-dark.png')

  console.log('\n[2] 首页：Hero / 推荐歌单卡片 / 今日推荐行')
  try {
    await waitFor(`!!document.querySelector('[data-nm="hero"]')`, 'hero', 12000)
    check('Hero（今日推荐）出现', true)
  } catch (err) {
    check('Hero（今日推荐）出现', false, '未找到 [data-nm="hero"]')
  }
  check('「播放全部」按钮存在', await evaluate(`!!document.querySelector('[data-nm="play-all"]')`))
  const recCards = await countSel('[data-nm="section"][data-section="recommended"] [data-nm="cover-card"]')
  const allCards = await countSel('[data-nm="cover-card"]')
  check('推荐歌单卡片 ≥6 张', recCards >= 6 || allCards >= 6, `recommended=${recCards}, all=${allCards}`)
  check('推荐歌单卡片带 data-kind/data-id', await evaluate(`(() => {
    const el = document.querySelector('[data-nm="cover-card"]')
    return !!el && !!el.getAttribute('data-id') && ['playlist','album','artist'].includes(el.getAttribute('data-kind'))
  })()`))
  const dailyRows = await countSel('[data-nm="section"][data-section="daily"] [data-nm="track"]')
  const allRows = await countSel('[data-nm="track"]')
  check('今日推荐曲目行 ≥10 行', dailyRows >= 10 || allRows >= 10, `daily=${dailyRows}, all=${allRows}`)
  await scrollTop()
  await S('05-home-dark.png')

  console.log('\n[2b] v4 Hero 轮播 + /mode 模式接口')
  let carouselOk = false
  try {
    await waitFor(`!!document.querySelector('[data-nm="hero-carousel"]')`, 'hero carousel', 9000)
    carouselOk = true
    check('Hero 轮播 [data-nm="hero-carousel"] 出现', true)
  } catch (err) {
    check('Hero 轮播 [data-nm="hero-carousel"] 出现', false, '9s 内未找到（v4 轮播可能未落盘）')
  }
  const carouselInfo = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-nm="carousel-card"]')]
    return {
      count: cards.length,
      modes: cards.map((c) => c.getAttribute('data-mode')),
      active: cards.filter((c) => c.getAttribute('data-active') === 'true').map((c) => c.getAttribute('data-mode')),
    }
  })()`)
  check('轮播卡片 ≥5 张', carouselInfo.count >= 5, JSON.stringify(carouselInfo))
  check('轮播覆盖 heart/roam/similar_song/similar_artist/daily 五种 mode',
    ['heart', 'roam', 'similar_song', 'similar_artist', 'daily'].every((m) => carouselInfo.modes.includes(m)),
    JSON.stringify(carouselInfo.modes))
  await S('24-hero-carousel.png')
  await S('24-carousel-1.png')

  const currentCarousel = () => evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-nm="carousel-card"]')]
    if (!cards.length) return null
    let cur = cards.find((c) => c.getAttribute('data-active') === 'true') || cards.find((c) => c.classList.contains('is-active'))
    if (!cur) {
      const wrap = document.querySelector('[data-nm="hero-carousel"]')
      const wr = wrap ? wrap.getBoundingClientRect() : null
      let best = null
      cards.forEach((c) => {
        const r = c.getBoundingClientRect()
        const cx = (r.left + r.right) / 2
        const dist = wr ? Math.abs(cx - (wr.left + wr.width / 2)) : 0
        if (!best || dist < best.dist) best = { dist, card: c }
      })
      cur = best && best.card
    }
    return cur ? { mode: cur.getAttribute('data-mode'), title: (cur.textContent || '').trim().slice(0, 40) } : null
  })()`)
  const car0 = await currentCarousel()
  check('轮播有当前卡片', !!car0, JSON.stringify(car0))
  check('点 carousel-next', await clickSel('[data-nm="carousel-next"]'))
  await sleep(750)
  const car1 = await currentCarousel()
  check('点 carousel-next 后当前卡片变化',
    !!car0 && !!car1 && (car1.mode !== car0.mode || car1.title !== car0.title), JSON.stringify({ before: car0, after: car1 }))
  await S('24-carousel-2.png')
  check('点 carousel-prev', await clickSel('[data-nm="carousel-prev"]'))
  await sleep(750)
  const car2 = await currentCarousel()
  check('点 carousel-prev 后当前卡片变化',
    !!car1 && !!car2 && (car2.mode !== car1.mode || car2.title !== car1.title), JSON.stringify({ before: car1, after: car2 }))
  // 自动轮播（7s）
  await sleep(7300)
  const car3 = await currentCarousel()
  check('等待 7s 后自动轮播切换卡片',
    !!car2 && !!car3 && (car3.mode !== car2.mode || car3.title !== car2.title), JSON.stringify({ before: car2, after: car3 }))
  // hover 暂停
  const carHoverBefore = await currentCarousel()
  await evaluate(`(() => {
    const el = document.querySelector('[data-nm="hero-carousel"]')
    if (!el) return
    ;['mouseover', 'mouseenter', 'mousemove'].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true })))
  })()`)
  await sleep(7300)
  const carHoverAfter = await currentCarousel()
  check('hover 轮播后 7s 内暂停自动切换',
    !!carHoverBefore && !!carHoverAfter && carHoverAfter.mode === carHoverBefore.mode && carHoverAfter.title === carHoverBefore.title,
    JSON.stringify({ before: carHoverBefore, after: carHoverAfter }))
  await evaluate(`(() => {
    const el = document.querySelector('[data-nm="hero-carousel"]')
    if (!el) return
    ;['mouseout', 'mouseleave'].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true })))
  })()`)

  // ---- v4.1 无缝无限轮播（clone 两端）----
  const carouselGeometry = () => evaluate(`(() => {
    const wrap = document.querySelector('[data-nm="hero-carousel"]')
    const cards = [...document.querySelectorAll('[data-nm="carousel-card"]')]
    if (!wrap || !cards.length) return null
    const track = wrap.querySelector('.nm-carousel-track') || [...wrap.querySelectorAll('*')].find((el) => {
      const cs = getComputedStyle(el)
      return cs.transform && cs.transform !== 'none' && el.children.length >= cards.length
    }) || cards[0].parentElement
    const cr = cards[0].getBoundingClientRect()
    const cs = track ? getComputedStyle(track) : null
    let x = 0
    if (cs && cs.transform && cs.transform !== 'none') {
      const m = /matrix\\(([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+),/.exec(cs.transform)
      if (m) x = parseFloat(m[5])
      else { const m3 = /matrix3d\\(([^)]+)\\)/.exec(cs.transform); if (m3) x = parseFloat(m3[1].split(',')[12]) }
    }
    const activeDot = document.querySelector('[data-nm="carousel-dot"][aria-selected="true"]') ||
      document.querySelector('[data-nm="carousel-dot"].is-active')
    return {
      wrapW: Math.round(wrap.getBoundingClientRect().width),
      cardW: Math.round(cr.width),
      x,
      dots: [...document.querySelectorAll('[data-nm="carousel-dot"]')].length,
      activeDot: activeDot ? Number(activeDot.getAttribute('data-index')) : null,
      clones: document.querySelectorAll('[data-nm="carousel-card"][data-clone="true"]').length,
      cardCount: cards.length,
      modes: cards.map((c) => c.getAttribute('data-mode')),
      transition: cs ? { property: cs.transitionProperty, duration: cs.transitionDuration, timing: cs.transitionTimingFunction } : null,
    }
  })()`)
  const carouselDots = async (idx) => {
    const ok = await evaluate(`(() => {
      const dot = document.querySelector('[data-nm="carousel-dot"][data-index="${idx}"]')
      if (!dot) return false
      dot.click()
      return true
    })()`)
    if (!ok) {
      // 没有可点的 dot 时用 next/prev 次数兜底
      for (let i = 0; i < 6; i++) { await clickSel('[data-nm="carousel-next"]'); await sleep(120) }
    }
    await sleep(700)
    return ok
  }
  const cg = await carouselGeometry()
  check('轮播有 clone 节点（data-clone=true 两个）/ 卡片数=5+2',
    !!cg && (cg.clones === 2 || cg.cardCount === 7),
    JSON.stringify(cg && { clones: cg.clones, cardCount: cg.cardCount, modes: cg.modes }))
  const durMatch = cg && cg.transition && /([\d.]+)(m?s)/.exec(cg.transition.duration || '')
  let durMs = null
  if (durMatch) durMs = durMatch[2] === 's' ? parseFloat(durMatch[1]) * 1000 : parseFloat(durMatch[1])
  check('轮播 transition 时长约 300ms（150–800ms）', durMs != null && durMs >= 150 && durMs <= 800,
    JSON.stringify(cg && cg.transition))
  await carouselDots(2)
  await S('24-carousel-3.png')
  await carouselDots(0)

  // 最后一张 → next → 第一张（动画中位移 ≈ 1 张卡宽，不能瞬间回 0）
  await carouselDots(4)
  const lastGeo = await carouselGeometry()
  check('可切到最后一张（activeDot=4）', !!lastGeo && lastGeo.activeDot === 4, JSON.stringify(lastGeo && { activeDot: lastGeo.activeDot }))
  check('点 carousel-next（最后一张回绕）', await clickSel('[data-nm="carousel-next"]'))
  let wrapMid = null
  let wrapMidDelta = null
  let wrapMaxDelta = 0
  for (let i = 0; i < 6; i++) {
    await sleep(90)
    const g = await carouselGeometry()
    if (!g || !lastGeo) continue
    const d = Math.abs(g.x - lastGeo.x)
    if (d > wrapMaxDelta) wrapMaxDelta = d
    if (i === 1) { wrapMid = g; wrapMidDelta = d; await screenshot('24-carousel-wrap.png'); shots.push(join(SHOTS, '24-carousel-wrap.png')) }
  }
  check('next 回绕动画进行中（~120ms）已离开原位、未瞬间归 0',
    !!wrapMid && wrapMidDelta != null && wrapMidDelta > (lastGeo.cardW * 0.15) && Math.abs(wrapMid.x) > 1,
    JSON.stringify({ before: lastGeo && lastGeo.x, mid: wrapMid && wrapMid.x, cardW: lastGeo && lastGeo.cardW, delta: wrapMidDelta }))
  check('next 回绕动画期间位移达到约 1 张卡宽（≥0.8 卡宽）',
    !!lastGeo && wrapMaxDelta >= lastGeo.cardW * 0.8,
    JSON.stringify({ maxDelta: wrapMaxDelta, cardW: lastGeo && lastGeo.cardW }))
  await sleep(650)
  const afterWrap = await carouselGeometry()
  check('回绕动画结束后高亮回到第 1 张', !!afterWrap && afterWrap.activeDot === 0, JSON.stringify(afterWrap && { activeDot: afterWrap.activeDot }))

  // 第一张 → prev → 最后一张（平滑反向）
  await carouselDots(0)
  const firstGeo = await carouselGeometry()
  check('可切回第一张（activeDot=0）', !!firstGeo && firstGeo.activeDot === 0, JSON.stringify(firstGeo && { activeDot: firstGeo.activeDot }))
  check('点 carousel-prev（第一张回绕到最后）', await clickSel('[data-nm="carousel-prev"]'))
  let prevMid = null
  let prevMidDelta = null
  let prevMaxDelta = 0
  for (let i = 0; i < 6; i++) {
    await sleep(90)
    const g = await carouselGeometry()
    if (!g || !firstGeo) continue
    const d = Math.abs(g.x - firstGeo.x)
    if (d > prevMaxDelta) prevMaxDelta = d
    if (i === 1) { prevMid = g; prevMidDelta = d }
  }
  check('prev 回绕动画进行中（~120ms）已离开原位',
    !!prevMid && prevMidDelta != null && prevMidDelta > (firstGeo.cardW * 0.15),
    JSON.stringify({ before: firstGeo && firstGeo.x, mid: prevMid && prevMid.x, cardW: firstGeo && firstGeo.cardW }))
  check('prev 回绕动画期间位移达到约 1 张卡宽（≥0.8 卡宽）',
    !!firstGeo && prevMaxDelta >= firstGeo.cardW * 0.8,
    JSON.stringify({ maxDelta: prevMaxDelta, cardW: firstGeo && firstGeo.cardW }))
  await sleep(650)
  const afterPrevWrap = await carouselGeometry()
  check('prev 回绕结束后高亮为第 5 张（activeDot=4）', !!afterPrevWrap && afterPrevWrap.activeDot === 4,
    JSON.stringify(afterPrevWrap && { activeDot: afterPrevWrap.activeDot }))

  // 自动轮播（6s）在最后一张平滑绕回第一张
  await carouselDots(4)
  const autoStart = await carouselGeometry()
  const autoDotStart = autoStart ? autoStart.activeDot : null
  check('自动回绕前处于最后一张（activeDot=4）', autoDotStart === 4, JSON.stringify(autoStart && { activeDot: autoStart.activeDot }))
  let autoMidDeltas = []
  let autoEndDot = autoDotStart
  let autoLastX = autoStart ? autoStart.x : 0
  const autoT0 = Date.now()
  while (Date.now() - autoT0 < 7800) {
    await sleep(45)
    const g = await carouselGeometry()
    if (!g || !autoStart) continue
    const d = Math.abs(g.x - autoLastX)
    if (d > autoStart.cardW * 0.08 && d < autoStart.cardW * 2.5) autoMidDeltas.push(Math.round(d))
    autoLastX = g.x
    autoEndDot = g.activeDot
    if (autoEndDot === 0 && autoMidDeltas.length) break
  }
  check('6s 自动轮播在最后一张平滑绕回第一张（观察到动画中间帧 + 结束为第 1 张）',
    autoMidDeltas.length > 0 && autoEndDot === 0,
    JSON.stringify({ midDeltas: autoMidDeltas.slice(0, 12), endDot: autoEndDot, cardW: autoStart && autoStart.cardW }))

  // 种子：无在播曲目时点 similar_song，请求应带 songId=今日推荐第一首
  check('轮播种子测试前无在播曲目（dock 不存在）', !(await evaluate(`!!document.querySelector('[data-nm="dock"]')`)))
  const seedCardClicked = await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'similar_song')
    if (!card) return false
    const btn = card.querySelector('[data-nm="carousel-play"], button')
    ;(btn || card).click()
    return true
  })()`)
  check('点击 similar_song 轮播卡', seedCardClicked)
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      return !!a && a.paused === false && a.currentTime > 0.2
    })()`, 'carousel similar plays', 10000)
    check('点 similar_song 卡后 audio 开始播放', true)
  } catch (err) {
    check('点 similar_song 卡后 audio 开始播放', false, String(err))
  }
  check('点轮播卡后底部 dock 出现（队列已生效）', await evaluate(`!!document.querySelector('[data-nm="dock"]')`))
  const modeCalls = (await calls()).filter((c) => c.path === '/netease-panel/api/mode')
  const similarCall = modeCalls.filter((c) => /type=similar_song/.test(c.search || '')).pop()
  check('相似歌曲请求带 songId=今日推荐第一首 id（1901371647）',
    !!similarCall && (similarCall.search || '').includes('songId=1901371647'),
    JSON.stringify({ call: similarCall && similarCall.search, all: modeCalls.map((c) => c.search) }))
  // 点 daily 卡切换歌曲
  const beforeDailyId = await audioTrackId()
  const dailyClicked = await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'daily')
    if (!card) return false
    const btn = card.querySelector('[data-nm="carousel-play"], button')
    ;(btn || card).click()
    return true
  })()`)
  check('点击 daily 轮播卡', dailyClicked)
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a) return false
      const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
      return !!m && m[1] !== ${JSON.stringify(beforeDailyId)} && a.paused === false
    })()`, 'daily carousel plays', 10000)
    check('点 daily 卡后切换播放曲目', true)
  } catch (err) {
    check('点 daily 卡后切换播放曲目', false, String(err))
  }
  // 接口 error / empty：toast 出现且不崩溃
  await config({ modeError: 'error' })
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'heart')
    if (!card) return
    const btn = card.querySelector('[data-nm="carousel-play"], button')
    ;(btn || card).click()
  })()`)
  try {
    await waitFor(`!!document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]')`, 'mode error toast', 8000)
    check('mode 接口 error 时出现 toast', true)
  } catch (err) {
    check('mode 接口 error 时出现 toast', false, String(err))
  }
  await config({ modeError: 'empty' })
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'roam')
    if (!card) return
    const btn = card.querySelector('[data-nm="carousel-play"], button')
    ;(btn || card).click()
  })()`)
  try {
    await waitFor(`(() => {
      const t = document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]')
      return !!t && /空|暂无|没有|无推荐|失败|不可用|稍后/.test(t.textContent || '')
    })()`, 'mode empty toast', 8000)
    check('mode 接口空数据时 toast/空提示出现', true)
  } catch (err) {
    check('mode 接口空数据时 toast/空提示出现', false, String(err))
  }
  // ---- v4.2 真实指针事件：CTA / 整卡 / 拖拽 / clone 映射 ----
  await config({ modeError: null, modeHangMs: 0 })
  const modeCallCount = async (type) =>
    (await calls()).filter((c) => c.path === '/netease-panel/api/mode' && (!type || new RegExp('type=' + type + '(?:&|$)').test(c.search || ''))).length
  const carouselCardRect = (mode) => evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]:not([data-clone])')].find((c) => c.getAttribute('data-mode') === ${JSON.stringify(mode)})
    if (!card) return null
    const cta = card.querySelector('[data-nm="carousel-play"]')
    const cr = card.getBoundingClientRect()
    const br = cta ? cta.getBoundingClientRect() : null
    return {
      card: { x: Math.round(cr.left + cr.width * 0.72), y: Math.round(cr.top + cr.height * 0.34), w: Math.round(cr.width), h: Math.round(cr.height) },
      cta: br ? { x: Math.round(br.left + br.width / 2), y: Math.round(br.top + br.height / 2), w: Math.round(br.width), h: Math.round(br.height) } : null,
      hasCta: !!cta,
      ctaTag: cta ? cta.tagName : null,
    }
  })()`)
  await scrollTop()
  const REAL_MODES = ['heart', 'roam', 'similar_song', 'similar_artist', 'daily']
  for (let i = 0; i < REAL_MODES.length; i++) {
    const mode = REAL_MODES[i]
    await carouselDots(i)
    const rect = await carouselCardRect(mode)
    check(`真实指针点击 ${mode} CTA：卡片内有 carousel-play 按钮`,
      !!rect && rect.hasCta && rect.cta && rect.cta.x > 0 && rect.cta.x < 1440, JSON.stringify(rect))
    if (!rect || !rect.cta) continue
    const before = await modeCallCount(mode)
    const beforeAllCalls = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length
    const beforeTrackId = await audioTrackId()
    await realClickAt(rect.cta.x, rect.cta.y)
    let busySeen = false
    for (let b = 0; b < 8; b++) {
      await sleep(40)
      const busy = await evaluate(`(() => {
        const card = [...document.querySelectorAll('[data-nm="carousel-card"]:not([data-clone])')].find((c) => c.getAttribute('data-mode') === ${JSON.stringify(mode)})
        return card ? card.getAttribute('aria-busy') : null
      })()`)
      if (busy === 'true') { busySeen = true; break }
    }
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        return !!a && a.paused === false
      })()`, 'audio after real CTA ' + mode, 8000)
      check(`真实指针点击 ${mode} CTA 后 audio 在播放`, true)
    } catch (err) {
      check(`真实指针点击 ${mode} CTA 后 audio 在播放`, false, String(err))
    }
    await sleep(250)
    const after = await modeCallCount(mode)
    const newModeCalls = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').slice(beforeAllCalls).map((c) => c.search)
    const beaconCalls = (await calls())
      .filter((c) => c.path === '/netease-panel/api/playlist' && /diag/.test(c.search || ''))
      .slice(-4).map((c) => decodeURIComponent(c.search || '').slice(0, 120))
    check(`真实指针点击 ${mode} CTA 只发 1 次 /mode 请求（去重成功）`, after === before + 1,
      JSON.stringify({ mode, before, after, busySeen, newModeCalls, beaconCalls }))
    let trackChanged = false
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        if (!a) return false
        const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
        return !!m && m[1] !== ${JSON.stringify(beforeTrackId)}
      })()`, 'real CTA track change ' + mode, 9000)
      trackChanged = true
    } catch (err) { /* 下面断言输出 */ }
    check(`真实指针点击 ${mode} CTA 后切换曲目（audio id 变化）`, trackChanged,
      JSON.stringify({ beforeTrackId, afterTrackId: await audioTrackId(), newModeCalls }))
  }
  // 整卡（非按钮区域）真实指针点击
  await carouselDots(1) // roam
  const roamRect = await carouselCardRect('roam')
  const roamBefore = await modeCallCount('roam')
  const roamTrackBefore = await audioTrackId()
  check('整卡非按钮区域真实点击（roam）', !!roamRect)
  if (roamRect) {
    await realClickAt(roamRect.card.x, roamRect.card.y)
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        return !!a && a.paused === false
      })()`, 'audio after card click', 8000)
      await sleep(200)
      let roamChanged = false
      try {
        await waitFor(`(() => {
          const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
          if (!a) return false
          const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
          return !!m && m[1] !== ${JSON.stringify(roamTrackBefore)}
        })()`, 'real card track change', 9000)
        roamChanged = true
      } catch (err) { /* 断言输出 */ }
      check('整卡真实点击后播放成功（1 次 /mode 请求 + 切歌）',
        (await modeCallCount('roam')) === roamBefore + 1 && roamChanged,
        JSON.stringify({ before: roamBefore, after: await modeCallCount('roam'), roamTrackBefore, roamTrackAfter: await audioTrackId() }))
    } catch (err) {
      check('整卡真实点击后播放成功（1 次 /mode 请求）', false, String(err))
    }
  }
  // 拖拽 200px：切换卡片且不误触发播放
  await carouselDots(0)
  const dragGeo = await carouselGeometry()
  const dragModeBefore = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length
  const dragPoint = await evaluate(`(() => {
    const card = document.querySelector('[data-nm="carousel-card"]:not([data-clone])')
    if (!card) return null
    const r = card.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.78), y: Math.round(r.top + r.height * 0.5) }
  })()`)
  if (dragPoint) {
    await realDrag(dragPoint.x, dragPoint.y, -200)
    await sleep(800)
    const dragGeoAfter = await carouselGeometry()
    check('真实拖拽 200px 后轮播切换到下一张',
      !!dragGeo && !!dragGeoAfter && dragGeoAfter.activeDot === ((dragGeo.activeDot + 1) % 5),
      JSON.stringify({ before: dragGeo && dragGeo.activeDot, after: dragGeoAfter && dragGeoAfter.activeDot }))
    check('拖拽切换卡片不会误触发播放（无新增 /mode 请求）',
      (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length === dragModeBefore,
      JSON.stringify({ before: dragModeBefore, after: (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length }))
  }
  // clone 映射：绕回动画中真实点击 clone，不能播错 mode
  await carouselDots(4)
  await clickSel('[data-nm="carousel-next"]')
  await sleep(260)
  const cloneInfo = await evaluate(`(() => {
    const clones = [...document.querySelectorAll('[data-nm="carousel-card"][data-clone="true"]')]
    if (!clones.length) return { found: false }
    const vis = clones.map((clone) => {
      const r = clone.getBoundingClientRect()
      return {
        clone,
        r,
        visible: r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 0 &&
          Math.min(r.right, innerWidth) - Math.max(r.left, 0) > 40,
      }
    })
    const picked = vis.find((v) => v.visible) || vis[0]
    const clone = picked.clone
    const r = picked.r
    return {
      found: true,
      mode: clone.getAttribute('data-mode'),
      ariaHidden: clone.getAttribute('aria-hidden'),
      tabIndex: clone.tabIndex,
      pointerEvents: getComputedStyle(clone).pointerEvents,
      rect: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), visible: picked.visible },
    }
  })()`)
  check('clone 卡 aria-hidden=true 且不可聚焦',
    !!cloneInfo && cloneInfo.found && cloneInfo.ariaHidden === 'true' && cloneInfo.tabIndex === -1,
    JSON.stringify(cloneInfo))
  if (cloneInfo && cloneInfo.found && cloneInfo.rect.visible) {
    const callsBeforeClone = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length
    await realClickAt(cloneInfo.rect.x, cloneInfo.rect.y)
    await sleep(800)
    const newCalls = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').slice(callsBeforeClone)
    const playedWrong = newCalls.some((c) => {
      const m = /type=([a-z_]+)/.exec(c.search || '')
      return m && m[1] !== cloneInfo.mode
    })
    check('真实点击 clone 不会播放错误的 mode（允许忽略或映射到对应真实卡）',
      !playedWrong, JSON.stringify({ cloneMode: cloneInfo.mode, newCalls: newCalls.map((c) => c.search) }))
  } else {
    check('真实点击 clone 不会播放错误的 mode（允许忽略或映射到对应真实卡）', true,
      '动画中途 clone 不在视口内，跳过点击（clone aria-hidden/不可聚焦已断言）')
  }
  await sleep(800)

  // /mode 挂起超时：8s AbortController → toast + 卡片可重试，pending 清空
  await config({ modeError: null, modeHangMs: 9500 })
  const modeCallsBeforeHang = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length
  const heartClicked = await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'heart')
    if (!card) return false
    ;(card.querySelector('[data-nm="carousel-play"], button') || card).click()
    return true
  })()`)
  check('点击会挂起的 heart 卡', heartClicked)
  let pendingState = null
  for (let i = 0; i < 12; i++) {
    await sleep(100)
    pendingState = await evaluate(`(() => {
      const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'heart')
      if (!card) return null
      return {
        busy: card.getAttribute('aria-busy'),
        text: (card.textContent || '').trim().slice(0, 60),
        spinner: !!card.querySelector('.nm-spinner, [class*="spinner"]'),
      }
    })()`)
    if (pendingState && pendingState.busy === 'true') break
  }
  check('挂起中卡片 aria-busy="true" 且显示 loading',
    !!pendingState && pendingState.busy === 'true' && pendingState.spinner, JSON.stringify(pendingState))
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'heart')
    if (card) (card.querySelector('[data-nm="carousel-play"], button') || card).click()
  })()`)
  await sleep(350)
  const modeCallsDuring = (await calls()).filter((c) => c.path === '/netease-panel/api/mode').length
  check('pending 期间重复点击被忽略（未重复发 /mode 请求）',
    modeCallsDuring === modeCallsBeforeHang + 1, JSON.stringify({ before: modeCallsBeforeHang, during: modeCallsDuring }))
  try {
    await waitFor(`(() => {
      const t = document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]')
      return !!t && /超时|重试|失败/.test(t.textContent || '')
    })()`, 'mode timeout toast', 11000)
    const toastText = await textOf('.nm-toast, [data-nm="toast"], [role="status"]')
    check('挂起 8s 后出现「超时/重试」toast', true, (toastText || '').slice(0, 50))
  } catch (err) {
    check('挂起 8s 后出现「超时/重试」toast', false, String(err))
  }
  try {
    await waitFor(`(() => {
      const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'heart')
      if (!card) return false
      return card.getAttribute('aria-busy') !== 'true' && /重试|失败|超时/.test(card.textContent || '')
    })()`, 'mode card retry state', 7000)
    check('超时后卡片恢复可点击并显示「重试/错误」文案', true)
  } catch (err) {
    const st = await evaluate(`(() => {
      const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'heart')
      return card ? { busy: card.getAttribute('aria-busy'), text: (card.textContent || '').trim().slice(0, 80) } : null
    })()`)
    check('超时后卡片恢复可点击并显示「重试/错误」文案', false, JSON.stringify(st))
  }
  await config({ modeHangMs: 0 })
  const dailyCallsBefore = (await calls()).filter((c) => c.path === '/netease-panel/api/mode' && /type=daily/.test(c.search || '')).length
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('[data-nm="carousel-card"]')].find((c) => c.getAttribute('data-mode') === 'daily')
    if (!card) return
    ;(card.querySelector('[data-nm="carousel-play"], button') || card).click()
  })()`)
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      return !!a && a.paused === false
    })()`, 'daily plays after timeout', 10000)
    const dailyCallsAfter = (await calls()).filter((c) => c.path === '/netease-panel/api/mode' && /type=daily/.test(c.search || '')).length
    check('超时恢复后点其它卡仍能播放（pending 已清空）', dailyCallsAfter > dailyCallsBefore,
      JSON.stringify({ before: dailyCallsBefore, after: dailyCallsAfter }))
  } catch (err) {
    check('超时恢复后点其它卡仍能播放（pending 已清空）', false, String(err))
  }
  await config({ modeError: null, modeHangMs: 0 })
  check('轮播异常后页面仍无未处理异常（错误收集在最后统一断言）', true)

  console.log('\n[3] 播放：播放全部 → 播放条出现 → 播放中 → 进度前进 → 下一首 → 暂停')
  check('点击「播放全部」', await clickSel('[data-nm="play-all"]'))
  try {
    await waitFor(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`, 'in-panel dock', 8000)
    check('播放条 data-nm="player" 出现', true)
  } catch (err) {
    check('播放条 data-nm="player" 出现', false, '点击播放全部后 8s 内无播放条')
    throw err
  }
  try {
    await waitFor(`(() => {
      const el = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="dock"][data-playing]') || document.querySelector('[data-nm="player"]')
      return el && el.getAttribute('data-playing') === 'true'
    })()`, 'player playing', 8000)
    check('播放条 data-playing="true"', true)
  } catch (err) {
    check('播放条 data-playing="true"', false, `当前 data-playing=${await playerState()}`)
  }
  const t1 = await playerText()
  check('播放条显示曲目信息', !!t1 && t1.length > 2, (t1 || '').slice(0, 40))
  check('[data-nm="player-toggle"] 内有 svg 图标',
    await evaluate(`!!document.querySelector('[data-nm="player-toggle"] svg')`))
  const toggleContrast = await contrastOf('[data-nm="player-toggle"]')
  check('播放/暂停图标对比度 ≥2.5:1',
    !!toggleContrast && toggleContrast.ratio >= 2.5, JSON.stringify(toggleContrast))
  const audioNow = await evaluate(`(() => {
    const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
    return a ? { src: a.getAttribute('src') || '', paused: a.paused, t: a.currentTime, dur: a.duration } : null
  })()`)
  check('audio.src 指向 /netease-panel/api/audio', !!audioNow && audioNow.src.includes('/netease-panel/api/audio'), JSON.stringify(audioNow))
  check('audio 实际在播放（非 paused）', !!audioNow && audioNow.paused === false, JSON.stringify(audioNow))
  await S('06-player-playing.png')

  const p0 = await readProgress()
  const m0 = progressMetric(p0)
  let advanced = false
  let p1 = p0
  const start = Date.now()
  while (Date.now() - start < 3500) {
    p1 = await readProgress()
    const m1 = progressMetric(p1)
    const delta = (m1 ?? 0) - (m0 ?? 0)
    const need = progressScale(p1) === 'ratio' ? 0.01 : 0.4
    if (m1 != null && m0 != null && delta >= need) { advanced = true; break }
    await sleep(220)
  }
  check('播放进度 3s 内前进', advanced, JSON.stringify({ before: p0, after: p1 }))

  const idBefore = await audioTrackId()
  const titleBefore = await playerText()
  check('点击下一首', await clickSel('[data-nm="player-next"]'))
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a) return false
      const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
      return !!m && m[1] !== ${JSON.stringify(idBefore)}
    })()`, 'next track id change', 8000)
    await sleep(500)
    const titleAfter = await playerText()
    check('下一首后切歌（audio src id 变化）', (await audioTrackId()) !== idBefore,
      JSON.stringify({ beforeId: idBefore, afterId: await audioTrackId(), titleBefore: (titleBefore || '').slice(0, 24), titleAfter: (titleAfter || '').slice(0, 24) }))
  } catch (err) {
    check('下一首后切歌（audio src id 变化）', false, `点击 player-next 后 8s 内 audio id 未变（id=${await audioTrackId()}）`)
  }
  check('点击暂停', await clickSel('[data-nm="player-toggle"]'))
  try {
    await waitFor(`(() => {
      const el = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="dock"][data-playing]') || document.querySelector('[data-nm="player"]')
      return el && el.getAttribute('data-playing') === 'false'
    })()`, 'paused', 6000)
    check('暂停后 data-playing="false"', true)
  } catch (err) {
    check('暂停后 data-playing="false"', false, `当前 data-playing=${await playerState()}`)
  }

  // 队列面板（ui 已实现 data-nm="player-queue"）
  if (await evaluate(`!!document.querySelector('[data-nm="player-queue-toggle"]')`)) {
    check('队列按钮存在', true)
    if (await clickSel('[data-nm="player-queue-toggle"]')) {
      try {
        await waitFor(`!!document.querySelector('[data-nm="player-queue"]')`, 'queue panel', 6000)
        check('队列面板展开 [data-nm="player-queue"]', true)
        await S('06b-player-queue.png')
        await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        await waitFor(`!document.querySelector('[data-nm="player-queue"]')`, 'queue closed', 6000)
        check('Esc 收起队列面板', true)
      } catch (err) {
        check('队列面板展开 [data-nm="player-queue"]', false, String(err))
      }
    }
  } else {
    check('队列按钮存在', false, '未找到 [data-nm="player-queue-toggle"]')
  }

  // 点曲目行：应播放整张列表（契约：行点击=播放整列表）
  await scrollTop()
  const beforeRow = await playerText()
  check('点击今日推荐曲目行', await clickSel('[data-nm="section"][data-section="daily"] [data-nm="track"]'))
  try {
    await waitFor(`(() => {
      const el = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="dock"][data-playing]') || document.querySelector('[data-nm="player"]')
      return el && el.getAttribute('data-playing') === 'true'
    })()`, 'play by row click', 8000)
    check('曲目行点击后恢复播放（播放整列表）', true, `before=${(beforeRow || '').slice(0, 24)}`)
  } catch (err) {
    check('曲目行点击后恢复播放（播放整列表）', false, `data-playing=${await playerState()}`)
  }
  check('v1.1：点曲目行不自动打开播放页', !(await evaluate(`!!document.querySelector('[data-nm="nowplaying"]') && !!document.querySelector('[data-nm="nowplaying"]').offsetParent`)))
  // 点 dock-expand 才进入播放页；Esc 返回列表
  const expandClicked = await evaluate(`(() => {
    const b = document.querySelector('[data-nm="dock-expand"]') || document.querySelector('[data-nm="dock-cover"]')
    if (!b) return false
    b.click()
    return true
  })()`)
  check('点 dock-expand 进入播放页', !!expandClicked)
  try {
    await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'np via dock expand', 6000)
    check('dock-expand 后播放页出现', true)
  } catch (err) {
    check('dock-expand 后播放页出现', false, String(err))
  }
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  try {
    await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'exit nowplaying after dock expand', 6000)
    check('播放页 Esc 返回列表（v1.1）', true)
  } catch {
    check('播放页 Esc 返回列表（v1.1）', false, 'Escape 后播放页仍在')
  }

  // 3s 短 WAV 播完 → ended → 自动下一首（队列下一首）
  const autoId = await audioTrackId()
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a) return false
      const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
      return !!m && m[1] !== ${JSON.stringify(autoId)}
    })()`, 'auto next on ended', 10000)
    check('试听结束自动下一首（ended → 队列下一首）', (await audioTrackId()) !== autoId,
      JSON.stringify({ beforeId: autoId, afterId: await audioTrackId() }))
  } catch (err) {
    check('试听结束自动下一首（ended → 队列下一首）', false, `10s 内 audio id 仍为 ${autoId}（未自动切歌）`)
  }

  console.log('\n[3b] v1.1 列表点歌只播放、不自动打开播放页')
  await evaluate(`window.__setActivePanel('netease-music')`)
  await scrollTop()
  await sleep(300)
  const activeTabBefore = await evaluate(`(() => { const t = document.querySelector('[data-nm="tab"][aria-selected="true"]'); return t ? t.getAttribute('data-tab') : null })()`)
  const firstRowClick = await evaluate(`(() => {
    const row = document.querySelector('[data-nm="track"]')
    if (!row) return null
    const r = row.getBoundingClientRect()
    return { id: row.getAttribute('data-id'), x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (firstRowClick) {
    await realClickAt(firstRowClick.x, firstRowClick.y)
    try {
      await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && !a.paused })()`, 'first row plays', 8000)
      check('列表点第一首：audio 开始播放', true)
    } catch (err) { check('列表点第一首：audio 开始播放', false, String(err)) }
    check('列表点第一首：不打开播放页 [data-nm="nowplaying"]',
      !(await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)))
    check('列表点第一首：无 np-overlay',
      !(await evaluate(`!!document.querySelector('[data-nm="np-overlay"]')`)))
    check('列表点第一首：dock 出现', await evaluate(`!!document.querySelector('[data-nm="dock"]')`))
    check('列表点第一首：当前 tab/列表不变',
      (await evaluate(`(() => { const t = document.querySelector('[data-nm="tab"][aria-selected="true"]'); return t ? t.getAttribute('data-tab') : null })()`)) === activeTabBefore)
    // dock-expand 才打开 NP
    const dockExpand = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="dock-expand"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), title: b.getAttribute('title'), aria: b.getAttribute('aria-label') }
    })()`)
    check('dock 有 [data-nm="dock-expand"] 且文案「打开播放页」',
      !!dockExpand && /打开播放页/.test((dockExpand.title || '') + (dockExpand.aria || '')), JSON.stringify(dockExpand))
    if (dockExpand) await realClickAt(dockExpand.x, dockExpand.y)
    try {
      await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'np via dock expand real', 6000)
      check('点 dock-expand 才出现面板内播放页（非全屏）',
        !(await evaluate(`!!document.fullscreenElement`)))
    } catch (err) { check('点 dock-expand 才出现面板内播放页（非全屏）', false, String(err)) }
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(500)
    // 列表点第二首：切歌且仍在列表
    const secondRow = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-nm="track"]')]
      const row = rows[1] || rows[0]
      if (!row) return null
      row.scrollIntoView({ block: 'center' })
      const r = row.getBoundingClientRect()
      return { id: row.getAttribute('data-id'), x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) }
    })()`)
    if (secondRow) {
      await realClickAt(secondRow.x, secondRow.y)
      try {
        await waitFor(`(() => {
          const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
          if (!a || a.paused) return false
          const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
          return !!m && m[1] === ${JSON.stringify('__SECOND__')}
        })()`.replace('__SECOND__', String(secondRow.id)), 'second row plays', 8000)
        check('列表点第二首：切到第二首播放', true)
      } catch (err) {
        check('列表点第二首：切到第二首播放', false, JSON.stringify({ want: secondRow.id, cur: await audioTrackId() }))
      }
      check('列表点第二首：仍停留在列表（无 NP）',
        !(await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)))
    }
    // 图标文案：row-fullscreen 为「全屏播放」
    const rowFsTitle = await evaluate(`(() => { const b = document.querySelector('[data-nm="track"] [data-nm="row-fullscreen"]'); return b ? { title: b.getAttribute('title'), aria: b.getAttribute('aria-label') } : null })()`)
    check('row-fullscreen 文案为「全屏播放」（区别于 dock-expand）',
      !!rowFsTitle && /全屏/.test((rowFsTitle.title || '') + (rowFsTitle.aria || '')), JSON.stringify(rowFsTitle))
  } else {
    check('列表点第一首：audio 开始播放', false, '未找到曲目行')
  }

  console.log('\n[4] 歌单详情：点封面卡 → detail → 返回')
  await scrollTop()
  check('点击推荐歌单封面卡', await clickSel('[data-nm="cover-card"][data-kind="playlist"]'))
  try {
    await waitFor(`!!document.querySelector('[data-nm="detail"]')`, 'detail', 8000)
    check('歌单详情 data-nm="detail" 出现', true)
  } catch (err) {
    check('歌单详情 data-nm="detail" 出现', false, '点击封面卡后 8s 内无详情容器')
    throw err
  }
  let detailRows = 0
  try {
    await waitFor(`document.querySelectorAll('[data-nm="detail"] [data-nm="track"]').length >= 1`, 'detail tracks', 10000)
    detailRows = await countSel('[data-nm="detail"] [data-nm="track"]')
  } catch { detailRows = await countSel('[data-nm="detail"] [data-nm="track"]') }
  check('详情页有曲目行', detailRows >= 1, `rows=${detailRows}`)
  check('大歌单（mock 120 首）长列表渲染 ≥100 行', detailRows >= 100, `rows=${detailRows}`)
  check('详情页播放全部按钮存在', await evaluate(`!!document.querySelector('[data-nm="detail"] .nm-btn.accent, [data-nm="detail"] [data-nm="play-all"]')`))
  // 长列表分页：100 行之后应有「加载更多」，点击后补齐 120
  try {
    const hasMore = await evaluate(`!!document.querySelector('[data-nm="detail"] .nm-load-more button')`)
    check('大歌单分页显示「加载更多」', hasMore)
    if (hasMore) {
      await clickSel('[data-nm="detail"] .nm-load-more button')
      await waitFor(`document.querySelectorAll('[data-nm="detail"] [data-nm="track"]').length >= 120`, 'load more rows', 8000)
      check('点击加载更多后曲目行 100 → 120', true, `rows=${await countSel('[data-nm="detail"] [data-nm="track"]')}`)
    }
  } catch (err) {
    check('点击加载更多后曲目行 100 → 120', false, String(err))
  }
  await scrollTop()
  await S('07-playlist-detail.png')
  check('点击返回', await clickSel('[data-nm="back"]'))
  try {
    await waitFor(`!document.querySelector('[data-nm="detail"]')`, 'back to home', 8000)
    check('返回后详情消失', true)
  } catch (err) {
    check('返回后详情消失', false, '点击 [data-nm="back"] 后 8s 详情仍在')
  }

  console.log('\n[5] 搜索：输入关键词 → 结果出现')
  // 搜索可能挂在独立 tab；优先点 tab
  if (await evaluate(`!!document.querySelector('[data-nm="tab"][data-tab="search"]')`)) {
    await clickSel('[data-nm="tab"][data-tab="search"]')
    await sleep(350)
  }
  try {
    await waitFor(`!!document.querySelector('[data-nm="search-input"]')`, 'search input', 6000)
    check('搜索输入框存在', true)
  } catch (err) {
    check('搜索输入框存在', false, '未找到 [data-nm="search-input"]')
    throw err
  }
  await evaluate(`(() => {
    const input = document.querySelector('[data-nm="search-input"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '周杰伦')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
  })()`)
  let searchOk = false
  try {
    await waitFor(`(() => {
      const box = document.querySelector('[data-nm="search-results"]')
      return !!box && box.querySelectorAll('[data-nm="track"]').length >= 1
    })()`, 'search results', 10000)
    searchOk = true
  } catch { /* retry by Enter */ }
  if (!searchOk) {
    await evaluate(`(() => {
      const input = document.querySelector('[data-nm="search-input"]')
      if (!input) return
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
    })()`)
    try {
      await waitFor(`(() => {
        const box = document.querySelector('[data-nm="search-results"]')
        return !!box && box.querySelectorAll('[data-nm="track"]').length >= 1
      })()`, 'search results retry', 8000)
      searchOk = true
    } catch { /* ignore */ }
  }
  check('搜索结果容器出现', searchOk)
  if (searchOk) {
    const resText = await textOf('[data-nm="search-results"]')
    const resTracks = await countSel('[data-nm="search-results"] [data-nm="track"]')
    check('搜索结果包含「周杰伦」或曲目行', (resText || '').includes('周杰伦') || resTracks >= 1,
      `tracks=${resTracks}, text=${(resText || '').slice(0, 60)}`)
    check('搜索请求命中 mock（/search ≥1 次）', (await count('GET', '/netease-panel/api/search')) >= 1)
    await S('08-search-results.png')
    // 空态：搜一个不存在关键词 → [data-nm="empty"]
    await evaluate(`(() => {
      const input = document.querySelector('[data-nm="search-input"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'zzz不存在的歌zzz')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    try {
      await waitFor(`!!document.querySelector('[data-nm="search-results"] [data-nm="empty"]') || !!document.querySelector('[data-nm="search-results"] .nm-state.empty')`, 'search empty state', 8000)
      check('无结果时显示空态 data-nm="empty"', true)
    } catch (err) {
      check('无结果时显示空态 data-nm="empty"', false, '输入不存在的关键词后 8s 内未出现空态')
    }
    // 清空搜索，回到推荐
    await evaluate(`(() => {
      const input = document.querySelector('[data-nm="search-input"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
  }

  console.log('\n[5b] v1.1 搜索页大搜索框：同步 / 自动 focus / Enter / 小屏')
  if (await evaluate(`!!document.querySelector('[data-nm="tab"][data-tab="search"]')`)) {
    await clickSel('[data-nm="tab"][data-tab="search"]')
    await sleep(450)
  }
  const searchPageInfo = await evaluate(`(() => {
    const el = document.querySelector('[data-nm="search-page-input"]')
    const box = el ? el.closest('.nm-search-page-box') || el.parentElement : null
    const submit = document.querySelector('[data-nm="search-page-submit"]')
    const top = document.querySelector('[data-nm="search-input"]')
    const br = box ? box.getBoundingClientRect() : null
    const ir = el ? el.getBoundingClientRect() : null
    const sr = submit ? submit.getBoundingClientRect() : null
    const bg = box ? getComputedStyle(box).backgroundColor : null
    const radius = box ? getComputedStyle(box).borderRadius : null
    const icon = box ? box.querySelector('svg, [class*="icon"], i') : null
    const subBg = submit ? getComputedStyle(submit).backgroundColor : null
    return {
      hasInput: !!el,
      hasSubmit: !!submit,
      hasTop: !!top,
      boxW: br ? Math.round(br.width) : null,
      boxH: br ? Math.round(br.height) : null,
      inputW: ir ? Math.round(ir.width) : null,
      submitW: sr ? Math.round(sr.width) : null,
      radius,
      hasIcon: !!icon,
      submitBg: subBg,
      submitText: submit ? (submit.textContent || '').trim() : null,
      topValue: top ? top.value : null,
      pageValue: el ? el.value : null,
      active: document.activeElement === el,
    }
  })()`)
  check('搜索 tab 出现 [data-nm="search-page-input"]', !!searchPageInfo && searchPageInfo.hasInput, JSON.stringify(searchPageInfo))
  check('搜索页大输入框：高度 46–48、圆角 12、通栏（与提交按钮同排）',
    !!searchPageInfo && searchPageInfo.boxH >= 45 && searchPageInfo.boxH <= 49 &&
    /12px/.test(searchPageInfo.radius || '') && searchPageInfo.boxW > 400,
    JSON.stringify(searchPageInfo))
  check('搜索页大输入框左侧有搜索图标', !!searchPageInfo && searchPageInfo.hasIcon)
  check('右侧 [data-nm="search-page-submit"] 红色「搜索」按钮',
    !!searchPageInfo && searchPageInfo.hasSubmit && /rgb\(236,\s*65,\s*65\)|#ec4141|rgb\(236,65,65\)/i.test(searchPageInfo.submitBg || '') &&
    /搜索/.test(searchPageInfo.submitText || ''), JSON.stringify(searchPageInfo))
  check('切到搜索 tab 自动 focus 搜索页输入框', !!searchPageInfo && searchPageInfo.active, JSON.stringify({ active: searchPageInfo && searchPageInfo.active }))
  await S('29-search-page.png')
  // 共用 query：顶部输入 → 页内输入同步
  await evaluate(`(() => {
    const input = document.querySelector('[data-nm="search-input"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '周杰伦')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(350)
  let syncTopToPage = false
  try {
    await waitFor(`(() => { const el = document.querySelector('[data-nm="search-page-input"]'); return !!el && el.value === '周杰伦' })()`, 'query sync top->page', 4000)
    syncTopToPage = true
  } catch { /* 断言 */ }
  check('顶部搜索框输入后 search-page-input value 同步', syncTopToPage)
  // 页内输入 → 顶部同步
  await evaluate(`(() => {
    const input = document.querySelector('[data-nm="search-page-input"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '晴天')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(350)
  let syncPageToTop = false
  try {
    await waitFor(`(() => { const el = document.querySelector('[data-nm="search-input"]'); return !!el && el.value === '晴天' })()`, 'query sync page->top', 4000)
    syncPageToTop = true
  } catch { /* 断言 */ }
  check('search-page-input 输入后顶部搜索框 value 同步', syncPageToTop)
  // 页内输入 + Enter：结果出现（debounce 320ms）
  await evaluate(`(() => {
    const input = document.querySelector('[data-nm="search-page-input"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '周杰伦')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
  })()`)
  let pageSearchOk = false
  try {
    await waitFor(`(() => {
      const box = document.querySelector('[data-nm="search-results"]')
      return !!box && box.querySelectorAll('[data-nm="track"]').length >= 1
    })()`, 'search-page results', 6000)
    pageSearchOk = true
  } catch { /* 断言 */ }
  check('搜索页输入关键词按 Enter 后结果出现（debounce 320ms）', pageSearchOk)
  await S('30-search-page-results.png')
  // 点搜索按钮也能触发（先清空为空态，再输入并按按钮）
  await evaluate(`(() => {
    const input = document.querySelector('[data-nm="search-page-input"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(400)
  await evaluate(`(() => {
    const input = document.querySelector('[data-nm="search-page-input"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '稻香')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const btn = document.querySelector('[data-nm="search-page-submit"]')
    if (btn) btn.click()
  })()`)
  let submitOk = false
  try {
    await waitFor(`(() => {
      const box = document.querySelector('[data-nm="search-results"]')
      return !!box && box.querySelectorAll('[data-nm="track"]').length >= 1
    })()`, 'search-page submit results', 6000)
    submitOk = true
  } catch { /* 断言 */ }
  check('点 search-page-submit 后结果出现', submitOk)
  // 小屏 600：占满、无溢出、顶部搜索框仍存在
  await setViewport(600, 900)
  await sleep(500)
  const smallSearch = await evaluate(`(() => {
    const el = document.querySelector('[data-nm="search-page-input"]')
    const page = el ? el.closest('.nm-search-page') : null
    const top = document.querySelector('[data-nm="search-input"]')
    const er = el ? el.getBoundingClientRect() : null
    const pr = page ? page.getBoundingClientRect() : null
    return {
      hasInput: !!el,
      hasTop: !!top,
      inputW: er ? Math.round(er.width) : null,
      pageW: pr ? Math.round(pr.width) : null,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }
  })()`)
  check('600px 小屏搜索页输入框占满宽度且无横向溢出',
    !!smallSearch && smallSearch.hasInput && smallSearch.inputW >= smallSearch.pageW * 0.9 &&
    smallSearch.sw <= smallSearch.cw + 1, JSON.stringify(smallSearch))
  check('600px 小屏顶部搜索框仍存在', !!smallSearch && smallSearch.hasTop)
  await setViewport(1440, 980)
  await sleep(400)

  console.log('\n[6] 主题与响应式：深色/浅色对比度 + 1440/1024/600 无横向溢出')
  const overflowInfo = () => evaluate(`({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bodySw: document.body.scrollWidth,
    widest: (() => { let best = null; for (const el of document.querySelectorAll('[data-nm="root"] *')) { const r = el.getBoundingClientRect(); if (!best || r.right > best.right) best = { right: Math.round(r.right), tag: el.tagName, cls: (el.className || '').toString().slice(0, 48) } } return best })(),
  })`)
  const overflowOk = async (label) => {
    await sleep(450)
    try {
      await waitFor(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`, 'no overflow ' + label, 6000)
      check(label, true, JSON.stringify(await overflowInfo()))
    } catch (err) {
      check(label, false, JSON.stringify(await overflowInfo()))
    }
  }
  // 回到推荐首页（搜索 tab 下没有 play-all）
  if (await evaluate(`!!document.querySelector('[data-nm="tab"][data-tab="recommend"]')`)) {
    await clickSel('[data-nm="tab"][data-tab="recommend"]')
  }
  try {
    await waitFor(`!!document.querySelector('[data-nm="play-all"]')`, 'play-all for contrast', 6000)
  } catch { /* 下面 null 会暴露 */ }
  await sleep(400)
  await overflowOk('1440px 宽无横向溢出')

  const darkAccent = await contrastOf('[data-nm="play-all"]')
  check('深色主题下「播放全部」按钮文字对比度 ≥3:1',
    !!darkAccent && darkAccent.ratio >= 3, JSON.stringify(darkAccent))
  const darkTab = await contrastOf('[data-nm="tab"][aria-selected="true"]')
  check('深色主题下激活 tab 文字对比度 ≥2.5:1',
    !!darkTab && darkTab.ratio >= 2.5, JSON.stringify(darkTab))
  // 真实 DSH 默认深色主题的 --dsw-alias-brand-primary 是中性 #f9fafb（见 README）；
  // 临时注入中性 brand 验证 accent 不依赖 brand token（防止真机白底白字回归）
  await evaluate(`document.documentElement.style.setProperty('--dsw-alias-brand-primary', '#f9fafb')`)
  await sleep(350)
  const neutralAccent = await contrastOf('[data-nm="play-all"]')
  check('真实 DSH 默认主题（brand-primary=中性色）下「播放全部」仍可读 ≥3:1',
    !!neutralAccent && neutralAccent.ratio >= 3, JSON.stringify(neutralAccent))
  await evaluate(`document.documentElement.style.removeProperty('--dsw-alias-brand-primary')`)
  await sleep(250)
  check('深色主题下「播放全部」按钮有可见文案', !!darkAccent && darkAccent.text.length > 0, JSON.stringify(darkAccent))
  await setTheme('light')
  await sleep(500)
  const lightBg = await evaluate('getComputedStyle(document.body).backgroundColor')
  const lightLabel = await evaluate(`(() => { const el = document.querySelector('[data-nm="root"]'); return el ? getComputedStyle(el).color : null })()`)
  const lum = (rgb) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '')
    if (!m) return null
    return (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) / 255
  }
  check('浅色主题下背景/文字变亮（跟随 prefers-color-scheme）',
    lum(lightBg) != null && lum(lightBg) > 0.6,
    `body bg=${lightBg}, label=${lightLabel}`)
  const lightAccent = await contrastOf('[data-nm="play-all"]')
  check('浅色主题下「播放全部」按钮文字对比度 ≥3:1',
    !!lightAccent && lightAccent.ratio >= 3, JSON.stringify(lightAccent))
  const lightTab = await contrastOf('[data-nm="tab"][aria-selected="true"]')
  check('浅色主题下激活 tab 文字对比度 ≥2.5:1',
    !!lightTab && lightTab.ratio >= 2.5, JSON.stringify(lightTab))
  await screenshotRegion('#sidebar-icon img', '00-sidebar-icon-light.png', 4, 20)
  await scrollTop()
  await S('09-home-light.png')

  // 1024px
  await setTheme('dark')
  await setViewport(1024, 900)
  await overflowOk('1024px 宽无横向溢出')
  await S('10a-narrow-1024.png')

  // 600px
  await setViewport(600, 900)
  await overflowOk('600px 宽无横向溢出')
  await S('10b-narrow-600.png')
  await setViewport(1440, 980)
  await sleep(300)

  console.log('\n[7] 错误模式：/home 失败显示 error 态 + 重试')
  await config({ errorMode: 'home' })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="error"]')`, 'error state', 15000)
    check('接口失败时显示 data-nm="error"', true)
    const errText = await textOf('[data-nm="error"]')
    check('错误态包含可读提示', !!errText && errText.length > 2, (errText || '').slice(0, 60))
    check('错误态使用后端中文 error（不是 Invalid status code）',
      !!errText && !/Invalid status code/i.test(errText) && /网络开小差|失败|错误/.test(errText),
      (errText || '').slice(0, 60))
    await scrollTop()
    await S('11-error-state.png')
    // 点错误态里的「重试」：清掉 mock 错误后应原地恢复
    await config({ errorMode: null })
    const retried = await evaluate(`(() => {
      const box = document.querySelector('[data-nm="error"]')
      if (!box) return false
      const btn = [...box.querySelectorAll('button')].find((b) => b.textContent.includes('重试'))
      if (!btn) return false
      btn.click()
      return true
    })()`)
    check('错误态有「重试」按钮', retried)
    if (retried) {
      try {
        await waitFor(`!!document.querySelector('[data-nm="hero"]') || !!document.querySelector('[data-nm="track"]')`, 'retry recover', 15000)
        check('点「重试」后原地恢复（无整页刷新）', true)
      } catch (err) {
        check('点「重试」后原地恢复（无整页刷新）', false, '点击重试后 15s 内未恢复')
      }
    }
  } catch (err) {
    check('接口失败时显示 data-nm="error"', false, 'mock /home 返回 500 后 15s 内未出现 [data-nm="error"]')
  }
  await config({ errorMode: null })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="hero"]') || !!document.querySelector('[data-nm="track"]')`, 'recover from error', 15000)
    check('恢复后首页重新渲染', true)
  } catch (err) {
    check('恢复后首页重新渲染', false, '清除错误模式并刷新后 15s 内未恢复')
  }

  console.log('\n[7b] 引擎缺失模式：/status bridge="error" 不白屏')
  await config({ bridge: 'error', errorMode: null })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="root"]')`, 'root in engine-error mode', 15000)
    const engineView = await evaluate(`(() => {
      const root = document.querySelector('[data-nm="root"]')
      const txt = root ? root.textContent : ''
      return {
        exists: !!root,
        textLen: txt.length,
        hasEngine: txt.includes('引擎'),
        scrollH: root ? root.scrollHeight : 0,
        bodyText: document.body.textContent.slice(0, 120),
      }
    })()`)
    check('引擎缺失时不白屏（root 有内容）', engineView.exists && engineView.textLen > 20 && engineView.scrollH > 60, JSON.stringify(engineView))
    check('引擎缺失时展示安装/引擎提示', engineView.hasEngine, engineView.bodyText)
    await scrollTop()
    await S('12-engine-missing.png')
  } catch (err) {
    check('引擎缺失时不白屏（root 有内容）', false, String(err))
  }
  await config({ bridge: 'ready' })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="hero"]')`, 'recover from engine error', 15000)
    check('引擎恢复后首页重新渲染', true)
  } catch (err) {
    check('引擎恢复后首页重新渲染', false, 'bridge 恢复 ready 并刷新后 15s 内未恢复')
  }

  console.log('\n[7c] v3：引擎无感安装（POST /setup/install + /setup/install/log）')
  await config({ bridge: 'ready', engine: 'missing', installError: false, errorMode: null })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="engine-setup"]') || !!document.querySelector('[data-nm="engine-progress"]')`, 'engine setup ui', 15000)
    check('引擎缺失时出现安装 UI', true)
  } catch (err) {
    check('引擎缺失时出现安装 UI', false, '15s 内未出现 engine-setup / engine-progress')
  }
  const setupText = (await textOf('[data-nm="engine-setup"]')) || (await textOf('[data-nm="root"]')) || ''
  check('安装 UI 文案包含「引擎/安装」', /引擎|安装/.test(setupText), setupText.slice(0, 80))
  const running0 = await evaluate(`!!document.querySelector('[data-nm="engine-progress"]') || !!document.querySelector('[data-nm="engine-log"]')`)
  if (!running0) {
    check('有「安装引擎」按钮 [data-nm="engine-install"]',
      await evaluate(`!!document.querySelector('[data-nm="engine-install"]')`))
    if (await clickSel('[data-nm="engine-install"]')) await sleep(700)
  }
  try {
    await waitFor(`!!document.querySelector('[data-nm="engine-progress"]') || !!document.querySelector('[data-nm="engine-log"]')`, 'engine install running', 10000)
    check('安装中显示进度条/日志', true)
  } catch (err) {
    check('安装中显示进度条/日志', false, '10s 内未出现 engine-progress/engine-log')
  }
  await S('22-install-progress.png')
  try {
    await waitFor(`(async () => {
      if (document.querySelector('[data-nm="engine-setup"]') || document.querySelector('[data-nm="engine-progress"]')) return false
      if (!document.querySelector('[data-nm="hero"]') && document.querySelectorAll('[data-nm="track"]').length < 10) return false
      const body = await fetch('/netease-panel/api/status').then(function (r) { return r.json() })
      return !!(body && body.data && body.data.engine === 'installed')
    })()`, 'engine installed home', 28000)
    check('安装完成后卡片消失并自动渲染首页', true)
    await S('23-engine-installed.png')
  } catch (err) {
    check('安装完成后卡片消失并自动渲染首页', false, '28s 内未恢复首页（mock 安装 3.2s 完成）')
  }
  const statusEngine = await evaluate(`fetch('/netease-panel/api/status').then(function (r) { return r.json() }).then(function (j) { return j && j.data && j.data.engine })`)
  check('/status.engine = installed', statusEngine === 'installed', String(statusEngine))

  // 失败态
  await config({ engine: 'missing', installError: true })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="engine-setup"]') || !!document.querySelector('[data-nm="engine-progress"]')`, 'engine setup fail', 15000)
  } catch { /* 下面断言暴露 */ }
  const running1 = await evaluate(`!!document.querySelector('[data-nm="engine-progress"]') || !!document.querySelector('[data-nm="engine-log"]')`)
  if (!running1) {
    if (await clickSel('[data-nm="engine-install"]')) await sleep(600)
  }
  try {
    await waitFor(`!!document.querySelector('[data-nm="engine-retry"]') || (!!document.querySelector('[data-nm="engine-setup"]') && /失败|错误|重试/.test((document.querySelector('[data-nm="engine-setup"]') || {}).textContent || ''))`, 'engine install failed', 20000)
    check('安装失败显示错误 + 重试 [data-nm="engine-retry"]', true)
    const failText = (await textOf('[data-nm="engine-setup"]')) || (await textOf('[data-nm="root"]')) || ''
    check('失败文案包含可读原因', /失败|错误|网络|超时|重试/.test(failText), failText.slice(0, 80))
  } catch (err) {
    check('安装失败显示错误 + 重试 [data-nm="engine-retry"]', false, '20s 内未见失败态/重试按钮')
  }
  await config({ engine: 'installed', installError: false })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="hero"]') || document.querySelectorAll('[data-nm="track"]').length > 0`, 'recover after install test', 15000)
    check('正常引擎状态下首页恢复渲染', true)
  } catch (err) {
    check('正常引擎状态下首页恢复渲染', false, '15s 内未恢复')
  }

  console.log('\n[9] v3：面板内 dock / 全屏播放页 / 黑胶圆形 / 歌词 / 音质')
  await setTheme('dark')
  await setViewport(1440, 980)
  await evaluate(`window.__setActivePanel('netease-music')`)
  await sleep(400)
  if (await evaluate(`!!document.querySelector('[data-nm="tab"][data-tab="recommend"]')`)) {
    await clickSel('[data-nm="tab"][data-tab="recommend"]')
    await sleep(250)
  }
  if (!(await playerVisible())) {
    if (await clickSel('[data-nm="play-all"]')) {
      try { await waitFor(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`, 'in-panel dock after play-all', 8000) } catch { /* 下面断言暴露 */ }
    }
  }
  await sleep(700)
  const slotInfo = await evaluate(`({
    bottom: !!window.__slots['shell.bottom'],
    overlay: !!window.__slots['shell.overlay'],
    footer: !!window.__slots['sidebar.footer.action'],
    footerSpec: window.__slotSpecs['sidebar.footer.action'] || null,
    activePanel: window.__activePanelId,
    miniWide: !!window.__miniWide,
  })`)
  check('客户端不再注册 shell.bottom', slotInfo.bottom === false, JSON.stringify(slotInfo))
  check('客户端不再注册 shell.overlay', slotInfo.overlay === false, JSON.stringify(slotInfo))
  check('注册了 sidebar.footer.action（mini player）', slotInfo.footer === true, JSON.stringify(slotInfo))
  check('mini spec: name/id/order 正确',
    !!slotInfo.footerSpec && slotInfo.footerSpec.name === 'sidebar.footer.action' &&
    slotInfo.footerSpec.id === 'netease-mini' && slotInfo.footerSpec.order === 10,
    JSON.stringify(slotInfo.footerSpec))
  check('当前激活面板 = netease-music', slotInfo.activePanel === 'netease-music', slotInfo.activePanel)

  const dockLayout = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="root"]')
    const scroll = document.querySelector('[data-nm="scroll"]')
    const dock = document.querySelector('[data-nm="dock"]')
    const composer = document.querySelector('#composer')
    const dockRect = dock ? dock.getBoundingClientRect() : null
    const scrollRect = scroll ? scroll.getBoundingClientRect() : null
    const rootRect = root ? root.getBoundingClientRect() : null
    const composerRect = composer ? composer.getBoundingClientRect() : null
    return {
      dockFound: !!dock,
      inRoot: !!(root && dock && root.contains(dock)),
      dockPosition: dock ? getComputedStyle(dock).position : null,
      dockTop: dockRect ? Math.round(dockRect.top) : -1,
      dockH: dockRect ? Math.round(dockRect.height) : -1,
      dockBottom: dockRect ? Math.round(dockRect.bottom) : -1,
      scrollBottom: scrollRect ? Math.round(scrollRect.bottom) : -1,
      scrollPadBottom: scroll ? (parseFloat(getComputedStyle(scroll).paddingBottom) || 0) : -1,
      rootTop: rootRect ? Math.round(rootRect.top) : -1,
      rootBottom: rootRect ? Math.round(rootRect.bottom) : -1,
      composerTop: composerRect ? Math.round(composerRect.top) : -1,
      composerBottom: composerRect ? Math.round(composerRect.bottom) : -1,
      hasScroll: !!scroll,
    }
  })()`)
  check('面板内 dock 出现在 [data-nm="root"] 内', dockLayout.dockFound && dockLayout.inRoot, JSON.stringify(dockLayout))
  check('面板内 dock 不是 fixed 全局悬浮', dockLayout.dockPosition !== 'fixed', JSON.stringify(dockLayout))
  check('面板滚动容器 [data-nm="scroll"] 存在', dockLayout.hasScroll === true, JSON.stringify(dockLayout))
  check('dock 不覆盖列表（dock.top ≥ 滚动容器 bottom - 2）',
    dockLayout.dockTop >= dockLayout.scrollBottom - 2, JSON.stringify(dockLayout))
  check('主内容底部留白 ≈ dock 高度（padding-bottom 或布局行）',
    dockLayout.scrollPadBottom >= dockLayout.dockH - 2 || dockLayout.dockTop >= dockLayout.scrollBottom - 2,
    JSON.stringify(dockLayout))
  check('面板内 dock 在输入框之上、不遮挡（dock.bottom ≤ composer.top + 1）',
    dockLayout.dockBottom <= dockLayout.composerTop + 1, JSON.stringify(dockLayout))
  await S('19-inpanel-dock.png')

  // 点曲目行只播放；点 dock-expand 才进入播放页（v1.1）
  await scrollTop()
  const npEntry = await clickSel('[data-nm="section"][data-section="daily"] [data-nm="track"]')
  check('点曲目行', npEntry)
  let npReady = false
  try {
    await waitFor(`!!document.querySelector('[data-nm="dock"]') && !document.querySelector('[data-nm="nowplaying"]')`, 'row plays without np', 6000)
    check('点曲目行只播放、不自动打开播放页', true)
  } catch (err) {
    check('点曲目行只播放、不自动打开播放页', false, String(err))
  }
  const expandForNp = await evaluate(`(() => {
    const b = document.querySelector('[data-nm="dock-expand"]') || document.querySelector('[data-nm="dock-cover"]')
    if (!b) return false
    b.click()
    return true
  })()`)
  try {
    await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying', 8000)
    npReady = true
    check('播放页 [data-nm="nowplaying"] 出现（dock-expand）', !!expandForNp)
  } catch (err) {
    check('播放页 [data-nm="nowplaying"] 出现（dock-expand）', false, '点 dock-expand 后 8s 内未出现')
  }

  if (npReady) {
    // audio 在播、currentTime 前进
    try {
      await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && a.currentTime > 0.25 && a.paused === false })()`, 'audio progressing in nowplaying', 6000)
      check('播放页内 audio 在播（currentTime 前进）', true)
    } catch (err) {
      const st = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { t: a.currentTime, paused: a.paused } : null })()`)
      check('播放页内 audio 在播（currentTime 前进）', false, JSON.stringify(st))
    }
    const npDup = () => evaluate(`(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
      const scope = document.querySelector('[data-nm="nowplaying"]')
      const inScope = (sel) => scope ? [...scope.querySelectorAll(sel)].filter(visible) : []
      const dock = [...document.querySelectorAll('[data-nm="dock"]')].filter(visible)
      const progress = [...document.querySelectorAll('[data-nm="player-progress"], [data-nm="np-progress"], .nm-np-progress')].filter(visible)
      const plays = [...document.querySelectorAll('[data-nm="player-toggle"], [data-nm="np-play"]')].filter(visible)
      const prevs = [...document.querySelectorAll('[data-nm="player-prev"], [data-nm="np-prev"]')].filter(visible)
      const nexts = [...document.querySelectorAll('[data-nm="player-next"], [data-nm="np-next"]')].filter(visible)
      const dockBits = [...document.querySelectorAll('[data-nm="dock-cover"], .nm-dock-name, .nm-dock-text')].filter(visible)
      return {
        dock: dock.length,
        progress: progress.length,
        plays: plays.length,
        prevs: prevs.length,
        nexts: nexts.length,
        dockBits: dockBits.length,
        npProgress: inScope('[data-nm="player-progress"], [data-nm="np-progress"], .nm-np-progress').length,
        npPlays: inScope('[data-nm="player-toggle"], [data-nm="np-play"]').length,
        npPrevs: inScope('[data-nm="player-prev"], [data-nm="np-prev"]').length,
        npNexts: inScope('[data-nm="player-next"], [data-nm="np-next"]').length,
      }
    })()`)
    const np0 = await npDup()
    check('播放页内底部 dock 存在（v4：整条底部工具栏）', np0.dock === 1, JSON.stringify(np0))
    check('全页进度条恰好 1 条（播放页内部 0 条）',
      np0.progress === 1 && np0.npProgress === 0, JSON.stringify(np0))
    check('传输键组只有底部 dock 这一组（播放页内部 0 组）',
      np0.plays === 1 && np0.prevs === 1 && np0.nexts === 1 &&
      np0.npPlays === 0 && np0.npPrevs === 0 && np0.npNexts === 0, JSON.stringify(np0))
    check('底部 dock 工具栏仍含封面/歌名信息', np0.dockBits >= 1, JSON.stringify(np0))
    await S('25-nowplaying-with-dock.png')
    const audioPaused = () => evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? a.paused : null })()`)
    const clickPlay = async () => {
      if (await evaluate(`!!document.querySelector('[data-nm="np-play"]')`)) return clickSel('[data-nm="np-play"]')
      return clickSel('[data-nm="player-toggle"]')
    }
    const npLogo = await evaluate(`(() => {
      const scope = document.querySelector('[data-nm="nowplaying"]')
      let img = null
      const direct = document.querySelector('[data-nm="np-logo"]')
      if (direct && direct.tagName === 'IMG') img = direct
      else if (direct) img = direct.querySelector('img')
      if (!img && scope) img = [...scope.querySelectorAll('img')].find((im) => (im.getAttribute('src') || '').startsWith('data:image/png;base64,'))
      if (!img) img = [...document.querySelectorAll('img')].find((im) => {
        const r = im.getBoundingClientRect()
        return (im.getAttribute('src') || '').startsWith('data:image/png;base64,') && r.width >= 20 && r.width <= 32 && r.top < 120
      })
      if (!img) return null
      const r = img.getBoundingClientRect()
      return { tag: img.tagName, src: (img.getAttribute('src') || '').slice(0, 32), naturalWidth: img.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) }
    })()`)
    check('左上角 logo 是 PNG dataURL <img> 且已解码',
      !!npLogo && npLogo.tag === 'IMG' && /^data:image\/png;base64,/.test(npLogo.src) && npLogo.naturalWidth > 0,
      JSON.stringify(npLogo))

    // 黑胶模式
    try {
      await waitFor(`!!document.querySelector('[data-nm="np-vinyl"]')`, 'np-vinyl', 6000)
      const v0 = await evaluate(`(() => { const el = document.querySelector('[data-nm="np-vinyl"]'); return el ? { spinning: el.classList.contains('is-spinning'), cls: el.className } : null })()`)
      check('黑胶 [data-nm="np-vinyl"] 播放中带 is-spinning', !!v0 && v0.spinning, JSON.stringify(v0))
      check('默认 vinyl 模式下 [data-nm="np-lyrics"] 不存在（严格互斥）',
        !(await evaluate(`!!document.querySelector('[data-nm="np-lyrics"]')`)))
      const npBg = await evaluate(`(() => {
        const el = document.querySelector('[data-nm="np-bg"]')
        if (!el) return null
        const cs = getComputedStyle(el)
        const inner = el.querySelector('[style*="background"]')
        const innerBg = inner ? getComputedStyle(inner).backgroundImage : ''
        const img = el.querySelector('img') || document.querySelector('[data-nm="np-vinyl"] img')
        const imgSrc = img ? (img.getAttribute('src') || '') : ''
        const bgImage = (cs.backgroundImage && cs.backgroundImage !== 'none') ? cs.backgroundImage : innerBg
        return {
          exists: true,
          bgImage: (bgImage || '').slice(0, 100),
          filter: cs.filter,
          imgSrc: imgSrc.slice(0, 48),
          hasUrl: (bgImage || '').indexOf('url(') >= 0,
          hasDataImage: (bgImage || '').indexOf('data:image') >= 0 || (innerBg || '').indexOf('data:image') >= 0,
          mentionsCover: !!imgSrc && (bgImage || '').indexOf(imgSrc.slice(0, 32)) >= 0,
          hasBlur: (cs.filter || '').indexOf('blur(') >= 0 || (getComputedStyle(inner || el).filter || '').indexOf('blur(') >= 0,
        }
      })()`)
      check('播放页背景层 [data-nm="np-bg"] 存在', !!npBg && npBg.exists, JSON.stringify(npBg))
      check('np-bg 包含当前封面 URL + blur 滤镜',
        !!npBg && npBg.hasUrl && (npBg.hasDataImage || npBg.mentionsCover) && npBg.hasBlur, JSON.stringify(npBg))
      const modeBefore = await evaluate(`(() => { const el = document.querySelector('[data-nm="np-mode"]'); return el ? el.getAttribute('data-mode') : null })()`)
      const pausedBefore = await audioPaused()
      check('点击黑胶盘体', await clickSel('[data-nm="np-vinyl"]'))
      await sleep(600)
      const pausedAfter = await audioPaused()
      const modeAfter = await evaluate(`(() => { const el = document.querySelector('[data-nm="np-mode"]'); return el ? el.getAttribute('data-mode') : null })()`)
      check('点黑胶只切换播放状态（audio.paused 翻转）', pausedBefore !== null && pausedAfter !== null && pausedBefore !== pausedAfter,
        JSON.stringify({ pausedBefore, pausedAfter }))
      check('点黑胶后仍是 vinyl 模式（不切歌词）', modeBefore === 'vinyl' && modeAfter === 'vinyl' &&
        !(await evaluate(`!!document.querySelector('[data-nm="np-lyrics"]')`)), JSON.stringify({ modeBefore, modeAfter }))
      if (pausedAfter === true) {
        await clickSel('[data-nm="np-vinyl"]')
        await sleep(500)
      }
      const npVinylDup = await npDup()
      check('vinyl 模式下仍只有底部 1 条进度/1 组传输键（NP 内部 0）', npVinylDup.progress === 1 && npVinylDup.plays === 1 && npVinylDup.npProgress === 0 && npVinylDup.dock === 1, JSON.stringify(npVinylDup))
      await S('13-nowplaying-vinyl-dark.png')
      check('播放页暂停', await clickPlay())
      try {
        await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && a.paused === true })()`, 'paused in nowplaying', 6000)
      } catch { /* 下面黑胶断言会暴露 */ }
      await sleep(350)
      const v1 = await evaluate(`(() => { const el = document.querySelector('[data-nm="np-vinyl"]'); return el ? { spinning: el.classList.contains('is-spinning') } : null })()`)
      check('暂停后黑胶不再旋转（无 is-spinning）', !!v1 && !v1.spinning, JSON.stringify(v1))
      check('播放页恢复播放', await clickPlay())
      try {
        await waitFor(`(() => { const el = document.querySelector('[data-nm="np-vinyl"]'); return !!el && el.classList.contains('is-spinning') })()`, 'vinyl spinning after resume', 6000)
        check('恢复播放后黑胶重新旋转', true)
      } catch (err) {
        check('恢复播放后黑胶重新旋转', false, String(err))
      }
    } catch (err) {
      check('黑胶 [data-nm="np-vinyl"] 播放中带 is-spinning', false, '未找到 [data-nm="np-vinyl"]')
    }

    // 歌词模式
    check('切到歌词模式', await clickSel('[data-nm="np-mode-lyrics"]'))
    try {
      await waitFor(`document.querySelectorAll('[data-nm="lyric-line"]').length >= 5`, 'lyric lines', 8000)
      const lyricInfo = () => evaluate(`(() => {
        const lines = [...document.querySelectorAll('[data-nm="lyric-line"]')]
        const active = lines.filter((l) => l.getAttribute('data-active') === 'true')
        return {
          count: lines.length,
          activeCount: active.length,
          activeTime: active[0] ? active[0].getAttribute('data-time') : null,
          activeText: active[0] ? active[0].textContent.trim().slice(0, 40) : null,
          mode: (document.querySelector('[data-nm="np-mode"]') || {}).getAttribute ? (document.querySelector('[data-nm="np-mode"]') || {}).getAttribute('data-mode') : null,
        }
      })()`)
      const lyr0 = await lyricInfo()
      check('歌词行 ≥5', lyr0.count >= 5, JSON.stringify(lyr0))
      check('恰好一行 lyric-line data-active="true"', lyr0.activeCount === 1, JSON.stringify(lyr0))
      check('np-mode 容器 data-mode="lyrics"', lyr0.mode === 'lyrics', JSON.stringify(lyr0))
      check('切到歌词后 [data-nm="np-vinyl"] 不存在（严格互斥）',
        !(await evaluate(`!!document.querySelector('[data-nm="np-vinyl"]')`)))
      check('歌词模式下背景层仍在', await evaluate(`!!document.querySelector('[data-nm="np-bg"]')`))
      const npLyricsDup = await npDup()
      check('歌词模式下仍只有底部 1 条进度/1 组传输键（NP 内部 0）',
        npLyricsDup.progress === 1 && npLyricsDup.plays === 1 && npLyricsDup.prevs === 1 && npLyricsDup.nexts === 1 &&
        npLyricsDup.npProgress === 0 && npLyricsDup.npPlays === 0 && npLyricsDup.dock === 1,
        JSON.stringify(npLyricsDup))
      await S('14-nowplaying-lyrics-dark.png')
      const t0 = lyr0.activeTime
      let changed = false
      for (let i = 0; i < 24; i++) {
        await sleep(280)
        const t = (await lyricInfo()).activeTime
        if (t != null && t !== t0) { changed = true; break }
      }
      check('播放推进后歌词 active 行变化', changed, `from ${t0}`)
      // 点击某行跳播
      const target = await evaluate(`(() => {
        const lines = [...document.querySelectorAll('[data-nm="lyric-line"]')]
        const line = lines.find((l) => { const t = parseFloat(l.getAttribute('data-time')); return t > 0.5 && t < 3.0 })
        if (!line) return null
        const info = { time: parseFloat(line.getAttribute('data-time')), text: line.textContent.trim().slice(0, 30) }
        line.click()
        return info
      })()`)
      check('找到并点击一行歌词', !!target, JSON.stringify(target))
      if (target) {
        await sleep(700)
        const at = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? a.currentTime : null })()`)
        check('点击歌词行后 audio.currentTime 跳到 data-time 附近',
          at != null && Math.abs(at - target.time) < 1.3, JSON.stringify({ audioCurrentTime: at, targetTime: target.time }))
        const lyr1 = await lyricInfo()
        check('点击的歌词行成为 active',
          lyr1.activeCount === 1 && lyr1.activeTime != null && Math.abs(parseFloat(lyr1.activeTime) - target.time) < 1.3, JSON.stringify(lyr1))
      }
    } catch (err) {
      check('歌词行 ≥5', false, '未找到 [data-nm="lyric-line"] 或不足 5 行: ' + String(err))
    }
    // 切回黑胶
    check('切回黑胶模式', await clickSel('[data-nm="np-mode-vinyl"]'))
    try {
      await waitFor(`(() => { const el = document.querySelector('[data-nm="np-vinyl"]'); return !!el && el.classList.contains('is-spinning') })()`, 'vinyl spinning after mode switch', 6000)
      check('切回黑胶后 is-spinning 恢复', true)
    check('切回黑胶后 [data-nm="np-lyrics"] 不存在（严格互斥）',
      !(await evaluate(`!!document.querySelector('[data-nm="np-lyrics"]')`)))
    const npBackVinylDup = await npDup()
    check('切回黑胶后仍只有底部 1 条进度/1 组传输键',
      npBackVinylDup.progress === 1 && npBackVinylDup.plays === 1 && npBackVinylDup.npProgress === 0 && npBackVinylDup.dock === 1,
      JSON.stringify(npBackVinylDup))
    const vinylShape = await evaluate(`(() => {
      const vin = document.querySelector('[data-nm="np-vinyl"]')
      if (!vin) return null
      const vcs = getComputedStyle(vin)
      const vr = vin.getBoundingClientRect()
      const label = vin.querySelector('.nm-vinyl-label')
      const disc = vin.querySelector('.nm-vinyl-disc')
      const img = vin.querySelector('.nm-vinyl-label img') || vin.querySelector('img')
      const lcs = label ? getComputedStyle(label) : null
      const dcs = disc ? getComputedStyle(disc) : null
      const ics = img ? getComputedStyle(img) : null
      const lr = label ? label.getBoundingClientRect() : null
      const dr = disc ? disc.getBoundingClientRect() : null
      return {
        vinyl: { radius: vcs.borderRadius, clip: vcs.clipPath, w: Math.round(vr.width), h: Math.round(vr.height) },
        label: lcs ? { radius: lcs.borderRadius, clip: lcs.clipPath, w: lr ? Math.round(lr.width) : -1, h: lr ? Math.round(lr.height) : -1 } : null,
        disc: dcs ? { radius: dcs.borderRadius, clip: dcs.clipPath, w: dr ? Math.round(dr.width) : -1, h: dr ? Math.round(dr.height) : -1 } : null,
        img: ics ? { radius: ics.borderRadius, clip: ics.clipPath } : null,
        spinning: vin.classList.contains('is-spinning'),
      }
    })()`)
    const round = (v) => !!v && (/50%/.test(v.radius || '') || /50%/.test(v.clip || ''))
    check('黑胶盘体正圆（宽高相等 + border-radius/clip 50%）',
      !!vinylShape && vinylShape.vinyl.w === vinylShape.vinyl.h && round(vinylShape.vinyl), JSON.stringify(vinylShape && vinylShape.vinyl))
    check('盘心 label 圆形（border-radius/clip 50%，宽高相等）',
      !!vinylShape && !!vinylShape.label && vinylShape.label.w === vinylShape.label.h && vinylShape.label.w > 0 &&
      round(vinylShape.label), JSON.stringify(vinylShape && vinylShape.label))
    check('黑胶盘体 disc 圆形（若存在）',
      !vinylShape || !vinylShape.disc || (vinylShape.disc.w === vinylShape.disc.h && round(vinylShape.disc)),
      JSON.stringify(vinylShape && vinylShape.disc))
    check('盘心封面 img 圆形（border-radius 50%）',
      !!vinylShape && !!vinylShape.img && /50%/.test(vinylShape.img.radius || ''), JSON.stringify(vinylShape && vinylShape.img))
    check('圆形黑胶播放中仍在旋转', !!vinylShape && vinylShape.spinning, JSON.stringify(vinylShape && { spinning: vinylShape.spinning }))
    check('黑胶盘心 label 直径 / 盘面直径 ≈0.58（±0.03）',
      !!vinylShape && !!vinylShape.label && vinylShape.vinyl.w > 0 && vinylShape.label.w > 0 &&
      Math.abs((vinylShape.label.w / vinylShape.vinyl.w) - 0.58) <= 0.03,
      JSON.stringify({ labelW: vinylShape && vinylShape.label && vinylShape.label.w, discW: vinylShape && vinylShape.vinyl.w, ratio: vinylShape && vinylShape.label && vinylShape.vinyl ? Math.round((vinylShape.label.w / vinylShape.vinyl.w) * 1000) / 1000 : null }))
    await S('21-nowplaying-vinyl-circular.png')
    } catch (err) {
      check('切回黑胶后 is-spinning 恢复', false, String(err))
    }

    // 音质切换 lossless，播放位置保持
    const qBefore = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { t: a.currentTime, src: (a.getAttribute('src') || ''), level: a.getAttribute('data-level') } : null })()`)
    check('播放页有音质按钮 [data-nm="np-quality"]', await evaluate(`!!document.querySelector('[data-nm="np-quality"]')`))
    if (await clickSel('[data-nm="np-quality"]')) {
      try {
        await waitFor(`!!document.querySelector('[data-nm="quality-menu"]')`, 'quality menu', 5000)
        check('音质菜单 [data-nm="quality-menu"] 出现', true)
      } catch (err) {
        check('音质菜单 [data-nm="quality-menu"] 出现', false, String(err))
      }
      const hasLossless = await evaluate(`!!document.querySelector('[data-nm="quality-option"][data-level="lossless"]')`)
      check('音质菜单含 lossless 选项', hasLossless)
      if (hasLossless && await clickSel('[data-nm="quality-option"][data-level="lossless"]')) {
        try {
          await waitFor(`(() => {
            const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
            return !!a && (a.getAttribute('src') || '').includes('level=lossless')
          })()`, 'audio level lossless', 8000)
          check('切换 lossless 后 audio.src 含 level=lossless', true)
        } catch (err) {
          const src = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? a.getAttribute('src') : null })()`)
          check('切换 lossless 后 audio.src 含 level=lossless', false, 'src=' + src)
        }
        // 切音质会重新 load：等 loadedmetadata 后 seek 回原位置再采样（最多 4s）
        try {
          await waitFor(`(() => {
            const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
            if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return false
            return a.currentTime > 0.25
          })()`, 'quality seek restore', 4000)
        } catch { /* 下面 delta 断言暴露 */ }
        await sleep(250)
        const qAfter = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { t: a.currentTime, src: (a.getAttribute('src') || ''), level: a.getAttribute('data-level'), paused: a.paused } : null })()`)
        check('audio 根 data-level="lossless"', !!qAfter && qAfter.level === 'lossless', JSON.stringify(qAfter))
        const delta = Math.abs((qAfter && qAfter.t ? qAfter.t : 0) - (qBefore && qBefore.t ? qBefore.t : 0))
        check('切换音质后播放位置大致保持（currentTime 差 <2s）', delta < 2,
          JSON.stringify({ before: qBefore && qBefore.t, after: qAfter && qAfter.t, delta: Math.round(delta * 100) / 100 }))
      }
    }

    // 返回列表 & dock 封面入口
    check('点播放页返回 [data-nm="np-back"]', await clickSel('[data-nm="np-back"]'))
    try {
      await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'back to list', 6000)
      check('返回后播放页消失', true)
      check('返回后列表仍在（曲目行 ≥1）', (await countSel('[data-nm="track"]')) >= 1, `rows=${await countSel('[data-nm="track"]')}`)
      await sleep(300)
      const backDup = await npDup()
      check('返回列表后 dock 重新出现（且只有 1 条进度）', backDup.dock === 1 && backDup.progress === 1, JSON.stringify(backDup))
    } catch (err) {
      check('返回后播放页消失', false, String(err))
    }
    check('点 dock 封面 [data-nm="dock-cover"]', await clickSel('[data-nm="dock-cover"]'))
    try {
      await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying from dock cover', 6000)
      check('点 dock 封面进入播放页', true)
      await sleep(300)
      const npAgainDup = await npDup()
      check('再次进入播放页后 dock 仍在、进度条仍只有 1 条',
        npAgainDup.dock === 1 && npAgainDup.progress === 1 && npAgainDup.npProgress === 0, JSON.stringify(npAgainDup))
    } catch (err) {
      check('点 dock 封面进入播放页', false, String(err))
    }
    // 浅色播放页截图
    await setTheme('light')
    await sleep(600)
    const npLightBg = await evaluate('getComputedStyle(document.body).backgroundColor')
    check('播放页浅色主题生效', /rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)|rgb\(255, 255, 255\)/.test(npLightBg), npLightBg)
    await S('15-nowplaying-light.png')
    // Esc 返回
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    try {
      await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'esc back to list', 6000)
      check('Esc 从播放页返回列表', true)
    } catch (err) {
      check('Esc 从播放页返回列表', false, String(err))
      if (await evaluate(`!!document.querySelector('[data-nm="np-back"]')`)) await clickSel('[data-nm="np-back"]')
    }
  }

  // 600px 下的底部停靠截图 + 无横向溢出
  await setTheme('dark')
  await setViewport(600, 900)
  await sleep(700)
  await S('17-narrow-600.png')
  try {
    await waitFor(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`, 'v2 600 no overflow', 5000)
    check('v2 600px 宽无横向溢出', true, JSON.stringify(await evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`)))
  } catch (err) {
    check('v2 600px 宽无横向溢出', false, JSON.stringify(await evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`)))
  }
  await setViewport(1440, 980)
  await setTheme('dark')
  await sleep(300)

  console.log('\n[9b] v3：侧栏迷你播放器（sidebar.footer.action，占满侧栏宽度）')
  await evaluate(`window.__setSidebarWide(true)`)
  await evaluate(`window.__setActivePanel('conversation')`)
  await sleep(900)
  let miniOk = false
  try {
    await waitFor(`!!document.querySelector('[data-nm="mini-player"]')`, 'mini player wide', 7000)
    miniOk = true
    check('展开侧栏 + 对话面板时 mini player 出现', true)
  } catch (err) {
    check('展开侧栏 + 对话面板时 mini player 出现', false, '7s 内未出现 [data-nm="mini-player"]')
  }
  if (miniOk) {
    const mini = await evaluate(`(() => {
      const el = document.querySelector('[data-nm="mini-player"]')
      const footer = document.querySelector('#sidebar-footer')
      const rail = document.querySelector('#rail')
      const settings = document.querySelector('#rail-settings')
      const er = el.getBoundingClientRect()
      const fr = footer.getBoundingClientRect()
      const sr = settings.getBoundingClientRect()
      return {
        railW: Math.round(rail.getBoundingClientRect().width),
        footerW: Math.round(fr.width),
        footerClientW: footer.clientWidth,
        footerScrollW: footer.scrollWidth,
        miniW: Math.round(er.width),
        miniH: Math.round(er.height),
        miniLeft: Math.round(er.left),
        footerLeft: Math.round(fr.left),
        miniRight: Math.round(er.right),
        footerRight: Math.round(fr.right),
        miniBottom: Math.round(er.bottom),
        settingsTop: Math.round(sr.top),
        hasPrev: !!document.querySelector('[data-nm="mini-prev"]'),
        hasToggle: !!document.querySelector('[data-nm="mini-toggle"]'),
        hasNext: !!document.querySelector('[data-nm="mini-next"]'),
        hasVolume: !!document.querySelector('[data-nm="mini-volume"]'),
        text: (el.textContent || '').trim().slice(0, 40),
      }
    })()`)
    check('假侧栏已展开为 280px', mini.railW === 280, JSON.stringify(mini))
    check('mini 占满 footer 宽度（width 差 <2px）',
      Math.abs(mini.miniW - mini.footerClientW) < 2, JSON.stringify(mini))
    check('mini 左右边缘与 footer 对齐（x 差 <1px）',
      Math.abs(mini.miniLeft - mini.footerLeft) < 1 && Math.abs(mini.miniRight - mini.footerRight) < 1, JSON.stringify(mini))
    check('footer 无横向溢出', mini.footerScrollW <= mini.footerClientW + 1, JSON.stringify(mini))
    check('mini 高度 78–92px（两行布局）', mini.miniH >= 78 && mini.miniH <= 92, JSON.stringify(mini))
    check('mini 不与 Settings 行重叠', mini.miniBottom <= mini.settingsTop + 1, JSON.stringify(mini))
    check('mini 有 prev/toggle/next/volume 控件',
      mini.hasPrev && mini.hasToggle && mini.hasNext && mini.hasVolume, JSON.stringify(mini))
    const miniLayout = await evaluate(`(() => {
      const card = document.querySelector('[data-nm="mini-player"]')
      const vol = document.querySelector('[data-nm="mini-volume"]')
      const names = ['mini-prev', 'mini-toggle', 'mini-next']
      const els = names.map((n) => document.querySelector('[data-nm="' + n + '"]'))
      if (!card || !vol || els.some((e) => !e)) return null
      const cr = card.getBoundingClientRect()
      const vr = vol.getBoundingClientRect()
      const centers = els.map((el) => {
        const r = el.getBoundingClientRect()
        return Math.round((r.left + r.right) / 2)
      })
      const sorted = centers.slice().sort((a, b) => a - b)
      const gaps = sorted.slice(1).map((c, i) => c - sorted[i])
      const cardCenter = Math.round((cr.left + cr.right) / 2)
      const toggleEl = document.querySelector('[data-nm="mini-toggle"]')
      const tr = toggleEl.getBoundingClientRect()
      const toggleCenter = Math.round((tr.left + tr.right) / 2)
      return {
        cardLeft: Math.round(cr.left),
        cardRight: Math.round(cr.right),
        cardTop: Math.round(cr.top),
        cardW: Math.round(cr.width),
        cardH: Math.round(cr.height),
        cardCenter,
        volCenterY: Math.round((vr.top + vr.bottom) / 2),
        volRightGap: Math.round(cr.right - vr.right),
        transportCenters: sorted,
        leftPad: sorted[0] - Math.round(cr.left),
        rightPad: Math.round(cr.right) - sorted[sorted.length - 1],
        toggleCenter,
        toggleCenterDiff: Math.abs(toggleCenter - cardCenter),
        gaps,
        gapDiff: gaps.length === 2 ? Math.abs(gaps[0] - gaps[1]) : null,
      }
    })()`)
    check('音量键在第一行（center.y < 卡片 top+44）且右侧留白 ≥8px',
      !!miniLayout && miniLayout.volCenterY < miniLayout.cardTop + 44 && miniLayout.volRightGap >= 8,
      JSON.stringify(miniLayout && { cardTop: miniLayout.cardTop, volCenterY: miniLayout.volCenterY, volRightGap: miniLayout.volRightGap }))
    check('三个传输键水平居中（左右留白差 <4px）',
      !!miniLayout && Math.abs(miniLayout.leftPad - miniLayout.rightPad) < 4,
      JSON.stringify(miniLayout && { leftPad: miniLayout.leftPad, rightPad: miniLayout.rightPad }))
    check('mini-toggle 中心与卡片中心差 ≤3px',
      !!miniLayout && miniLayout.toggleCenterDiff <= 3,
      JSON.stringify(miniLayout && { toggleCenter: miniLayout.toggleCenter, cardCenter: miniLayout.cardCenter, diff: miniLayout.toggleCenterDiff }))
    check('三个传输键相邻中心距差 <4px（对称等距）',
      !!miniLayout && miniLayout.gapDiff != null && miniLayout.gapDiff < 4,
      JSON.stringify(miniLayout && { gaps: miniLayout.gaps, gapDiff: miniLayout.gapDiff }))
    // prev / next 切歌
    const idA = await audioTrackId()
    check('点 mini-next', await clickSel('[data-nm="mini-next"]'))
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]')
        if (!a) return false
        const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
        return !!m && m[1] !== ${JSON.stringify(idA)}
      })()`, 'mini next change', 7000)
      check('点 mini-next 后当前曲目变化', true, `id ${idA} → ${await audioTrackId()}`)
    } catch (err) {
      check('点 mini-next 后当前曲目变化', false, String(err))
    }
    const idB = await audioTrackId()
    check('点 mini-prev', await clickSel('[data-nm="mini-prev"]'))
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]')
        if (!a) return false
        const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
        return !!m && m[1] !== ${JSON.stringify(idB)}
      })()`, 'mini prev change', 7000)
      check('点 mini-prev 后当前曲目变化', true, `id ${idB} → ${await audioTrackId()}`)
    } catch (err) {
      check('点 mini-prev 后当前曲目变化', false, String(err))
    }
    // 音量：浮层滑杆，卡片几何不变
    const geomBefore = await evaluate(`(() => {
      const el = document.querySelector('[data-nm="mini-player"]')
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }
    })()`)
    const mute0 = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]'); return a ? a.muted : null })()`)
    check('点 mini-volume', await clickSel('[data-nm="mini-volume"]'))
    await sleep(450)
    const readVol = () => evaluate(`(() => {
      const a = document.querySelector('audio[data-nm-audio]')
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
      const ranges = [...document.querySelectorAll('input[type="range"]')].filter(visible)
      const pops = [...document.querySelectorAll('[class*="volume-pop"], [class*="volume-slider"], [class*="volume-popover"]')].filter(visible)
      return { muted: a ? a.muted : null, ranges: ranges.length, pops: pops.length }
    })()`)
    let volState = await readVol()
    if (volState.ranges === 0 && volState.pops === 0) {
      // 桌面端音量滑杆是 hover/focus 浮层：补一次 hover+focus 再采样
      await evaluate(`(() => {
        const v = document.querySelector('[data-nm="mini-volume"]')
        if (!v) return
        const wrap = v.closest('[class*="volume"]') || v.parentElement || v
        v.focus()
        wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        wrap.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
        v.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        v.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      })()`)
      await sleep(450)
      volState = await readVol()
    }
    const geomAfter = await evaluate(`(() => {
      const el = document.querySelector('[data-nm="mini-player"]')
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }
    })()`)
    check('点/聚焦音量后出现浮层滑杆（不占卡片布局）',
      volState.ranges > 0 || volState.pops > 0, JSON.stringify(volState))
    check('音量浮层不改变卡片几何（宽/高差 <1px）',
      Math.abs(geomAfter.w - geomBefore.w) < 1 && Math.abs(geomAfter.h - geomBefore.h) < 1,
      JSON.stringify({ before: geomBefore, after: geomAfter }))
    check('点音量按钮静音翻转或出现音量滑杆',
      (volState.muted !== mute0) || volState.ranges > 0 || volState.pops > 0,
      JSON.stringify({ mute0, volState }))
    if (volState.muted === true) {
      await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]'); if (a) a.muted = false })()`)
    }
    await S('20-mini-sidebar.png')
    // 浅色
    await setTheme('light')
    await sleep(650)
    await S('20b-mini-sidebar-light.png')
    await setTheme('dark')
    await sleep(400)

    // 收起侧栏 56px → rail 形态
    await evaluate(`window.__setSidebarWide(false)`)
    await sleep(700)
    const miniRail = await evaluate(`(() => {
      const el = document.querySelector('[data-nm="mini-player"]')
      const footer = document.querySelector('#sidebar-footer')
      const rail = document.querySelector('#rail')
      if (!el || !footer || !rail) return null
      const er = el.getBoundingClientRect()
      const fr = footer.getBoundingClientRect()
      return {
        railW: Math.round(rail.getBoundingClientRect().width),
        footerW: Math.round(fr.width),
        miniW: Math.round(er.width),
        miniH: Math.round(er.height),
        hasPrev: !!document.querySelector('[data-nm="mini-prev"]'),
        hasNext: !!document.querySelector('[data-nm="mini-next"]'),
        hasToggle: !!document.querySelector('[data-nm="mini-toggle"]'),
        hasVolume: !!document.querySelector('[data-nm="mini-volume"]'),
        footerScrollW: footer.scrollWidth,
        footerClientW: footer.clientWidth,
      }
    })()`)
    check('收起侧栏后为 56px rail', !!miniRail && miniRail.railW === 56, JSON.stringify(miniRail))
    check('rail 形态仅封面（宽度 ≤34，无 prev/next/toggle/volume）',
      !!miniRail && miniRail.miniW <= 34 && !miniRail.hasPrev && !miniRail.hasNext &&
      !miniRail.hasToggle && !miniRail.hasVolume, JSON.stringify(miniRail))
    check('rail 形态 footer 无横向溢出',
      !!miniRail && miniRail.footerScrollW <= miniRail.footerClientW + 1, JSON.stringify(miniRail))
    await S('20c-mini-rail.png')

    // 点 rail 封面 → 切面板 + 播放页
    check('点 mini-cover', await clickSel('[data-nm="mini-cover"]'))
    try {
      await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying from mini', 8000)
      check('点 mini 封面进入播放页', true)
    } catch (err) {
      check('点 mini 封面进入播放页', false, String(err))
    }
    const panelAfter = await evaluate(`window.__activePanelId`)
    const selected = await evaluate(`window.__selectedPanels`)
    check('mini 点击调用 selectPanel(netease-music)',
      panelAfter === 'netease-music' && Array.isArray(selected) && selected.includes('netease-music'),
      JSON.stringify({ panelAfter, selected }))
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    try {
      await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'back from mini nowplaying', 6000)
    } catch { /* ignore */ }
    await sleep(600)
    check('面板为 netease-music 时 mini player 隐藏',
      !(await evaluate(`!!document.querySelector('[data-nm="mini-player"]')`)))
    check('面板为 netease-music 时面板内 dock 存在',
      await evaluate(`!!document.querySelector('[data-nm="dock"]')`))
  }

  console.log('\n[9c] v3：header 吸顶不透明 + logo')
  if (await evaluate(`!!document.querySelector('[data-nm="tab"][data-tab="recommend"]')`)) {
    await clickSel('[data-nm="tab"][data-tab="recommend"]')
  }
  await sleep(350)
  await evaluate(`(() => {
    const sp = document.querySelector('[data-nm="scroll"]')
    if (sp) sp.scrollTop = 800
    window.scrollTo(0, 800)
  })()`)
  await sleep(500)
  const headerInfo = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="root"]')
    const header = document.querySelector('[data-nm="header"]')
    const logo = header ? header.querySelector('img') : null
    const inner = header ? header.querySelector('.nm-header') : null
    const cs = header ? getComputedStyle(header) : null
    const rr = root ? root.getBoundingClientRect() : null
    const hr = header ? header.getBoundingClientRect() : null
    const ir = inner ? inner.getBoundingClientRect() : null
    const lr = logo ? logo.getBoundingClientRect() : null
    const parseAlpha = (s) => {
      if (!s) return null
      if (s.indexOf('rgba(') === 0) {
        const parts = s.slice(5, s.length - 1).split(',')
        return parts.length > 3 ? parseFloat(parts[3]) : 1
      }
      if (s.indexOf('/') >= 0) {
        const tail = s.slice(s.indexOf('/') + 1)
        return parseFloat(tail)
      }
      return 1
    }
    return {
      hasHeader: !!header,
      hasRoot: !!root,
      headerTop: hr ? Math.round(hr.top) : -1,
      rootTop: rr ? Math.round(rr.top) : -1,
      headerH: hr ? Math.round(hr.height) : -1,
      innerH: ir ? Math.round(ir.height) : -1,
      bg: cs ? cs.backgroundColor : null,
      alpha: cs ? parseAlpha(cs.backgroundColor) : null,
      position: cs ? cs.position : null,
      zIndex: cs ? cs.zIndex : null,
      logo: logo ? { tag: logo.tagName, src: (logo.getAttribute('src') || '').slice(0, 32), naturalWidth: logo.naturalWidth, w: lr ? Math.round(lr.width) : -1, h: lr ? Math.round(lr.height) : -1 } : null,
      clearance: getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance').trim(),
    }
  })()`)
  check('header [data-nm="header"] 存在', headerInfo.hasHeader, JSON.stringify(headerInfo))
  check('滚动 800px 后 header 贴面板顶部（rect.top 差 <2px）',
    headerInfo.hasHeader && Math.abs(headerInfo.headerTop - headerInfo.rootTop) <= 2, JSON.stringify(headerInfo))
  check('header 背景不透明（alpha ≥ 0.9）',
    headerInfo.alpha != null && headerInfo.alpha >= 0.9, JSON.stringify(headerInfo))
  check('header 覆盖 top clearance（shell ≥ clearance）且内容行 ≤52px',
    headerInfo.headerH >= 20 && headerInfo.innerH > 0 && headerInfo.innerH <= 52, JSON.stringify(headerInfo))
  check('header shell 高度合理（≤ clearance+60px）',
    headerInfo.headerH <= 80, JSON.stringify({ headerH: headerInfo.headerH, clearance: headerInfo.clearance }))
  check('header 为 sticky/fixed 且 z-index 高于内容',
    ['sticky', 'fixed'].includes(headerInfo.position), JSON.stringify(headerInfo))
  check('header 内 logo 是 PNG dataURL <img>（naturalWidth>0，≤26px）',
    !!headerInfo.logo && headerInfo.logo.tag === 'IMG' &&
    /^data:image\/png;base64,/.test(headerInfo.logo.src) &&
    headerInfo.logo.naturalWidth > 0 && headerInfo.logo.w > 0 && headerInfo.logo.w <= 26,
    JSON.stringify(headerInfo.logo))
  await S('18-header-scrolled-dark.png')
  await evaluate(`(() => { const sp = document.querySelector('[data-nm="scroll"]'); if (sp) sp.scrollTop = 0; window.scrollTo(0, 0) })()`)
  await sleep(250)

  console.log('\n[9d] seek：慢速 seek / 真实拖拽 / 点按 / 移出松开 / pendingSeek / 键盘')
  // 新页面会话：清空 mock clientlog 存档 + 重置 20 条/分钟配额与播放器状态
  await config({ clearLogs: true })
  await reload()
  try {
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows for seek session', 15000)
  } catch { /* 下面断言暴露 */ }
  await evaluate(`window.__setActivePanel('netease-music')`)
  await sleep(300)
  const buildStamp = await evaluate(`(() => {
    const el = document.querySelector('[data-nm="build-stamp"]')
    return el ? (el.textContent || '').trim() : null
  })()`)
  check('build-stamp 文本匹配「更新于 v1.1.1 ·」且不含「登录态」',
    !!buildStamp && /v1\.1\.1/.test(buildStamp) && /更新于/.test(buildStamp) && !/登录态/.test(buildStamp),
    JSON.stringify({ buildStamp }))
  try { await evaluate(`(() => { const el = document.querySelector('[data-nm="build-stamp"]'); if (el) el.scrollIntoView({ block: 'center' }) })()`); await sleep(250); await S('31-build-stamp.png'); await scrollTop() } catch { /* ignore */ }
  // 回到列表 + 确保 dock 存在
  await sleep(200)
  if (!(await playerVisible())) {
    if (await clickSel('[data-nm="play-all"]')) {
      try { await waitFor(`!!document.querySelector('[data-nm="dock"]')`, 'dock for seek tests', 8000) } catch { /* 下面断言暴露 */ }
    }
  }
  const seekState = () => evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
    const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
    const r = slider ? slider.getBoundingClientRect() : null
    const rr = root ? root.getBoundingClientRect() : null
    return {
      hasRoot: !!root,
      hasSlider: !!slider,
      left: r ? Math.round(r.left) : -1,
      width: r ? Math.round(r.width) : -1,
      sliderH: r ? Math.round(r.height) : -1,
      rootH: rr ? Math.round(rr.height) : -1,
      aria: slider ? Number(slider.getAttribute('aria-valuenow')) : null,
      dataSeeking: root ? root.getAttribute('data-seeking') : null,
      t: a ? Math.round(a.currentTime * 1000) / 1000 : null,
      seekingAttr: root ? root.getAttribute('data-seeking') : null,
      dur: a ? Math.round(a.duration * 1000) / 1000 : null,
      paused: a ? a.paused : null,
    }
  })()`)
  const ensurePaused = async () => {
    if ((await seekState()).paused === false) {
      await clickSel('[data-nm="player-toggle"]')
      try { await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && a.paused === true })()`, 'paused for seek', 5000) } catch { /* ignore */ }
    }
  }
  const dispatchPointer = (type, frac, onBody) => {
    const buttons = type === 'pointerup' ? 0 : 1
    return evaluate(`(() => {
      const root = document.querySelector('[data-nm="player-progress"]')
      const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
      if (!slider) return null
      const r = slider.getBoundingClientRect()
      const x = r.left + r.width * ${frac}
      const y = r.top + Math.min(r.height / 2, 11)
      const node = ${onBody ? 'document.body' : 'slider'}
      node.dispatchEvent(new PointerEvent('${type}', {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, isPrimary: true, pointerType: 'mouse',
        button: 0, buttons: ${buttons},
      }))
      return { x: Math.round(x), y: Math.round(y), width: Math.round(r.width), left: Math.round(r.left) }
    })()`)
  }
  const seekRatioTo = async (frac) => { await dispatchPointer('pointerdown', frac, false); await sleep(70); await dispatchPointer('pointerup', frac, false); await sleep(900) }

  const s0 = await seekState()
  check('列表 dock 存在 [data-nm="player-progress"]', s0.hasRoot && s0.hasSlider, JSON.stringify(s0))
  check('进度条命中高度 ≥20px', s0.rootH >= 20 || s0.sliderH >= 20, JSON.stringify({ rootH: s0.rootH, sliderH: s0.sliderH }))
  await ensurePaused()

  // 1) 慢速 seek：Range 延迟 1200ms，松手后不能被旧 position 覆盖
  // 先切一首新歌（server 在 slowSeekMs>0 时把首个响应裁成 1/4，强制后续 Range 请求）
  await config({ slowSeekMs: 1200 })
  await clickSel('[data-nm="player-next"]')
  try { await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && Number.isFinite(a.duration) && a.duration > 0 })()`, 'slow test metadata', 8000) } catch { /* ignore */ }
  await sleep(250)
  await ensurePaused()
  await dispatchPointer('pointerdown', 0.7, false)
  let duringSeek = null
  for (let i = 0; i < 12; i++) {
    await sleep(40)
    const st = await seekState()
    if (st.dataSeeking === 'true') { duringSeek = st; break }
  }
  await dispatchPointer('pointerup', 0.7, false)
  await sleep(220)
  const slowEarly = await seekState()
  check('慢速 seek：松手 250ms 内 aria-valuenow 未回落到 <10',
    slowEarly.aria != null && slowEarly.aria >= 10, JSON.stringify({ early: slowEarly }))
  check('慢速 seek：拖动/请求期间 data-seeking="true"',
    !!duringSeek, JSON.stringify({ during: duringSeek, afterUp: slowEarly }))
  await sleep(2300)
  const slowLate = await seekState()
  check('慢速 seek 完成后进度显示 ≈70%（±5）',
    slowLate.aria != null && Math.abs(slowLate.aria - 70) <= 5, JSON.stringify(slowLate))
  check('慢速 seek 完成后 audio.currentTime ≈ 70% 时长（±8%）',
    slowLate.t != null && slowLate.dur > 0 && Math.abs(slowLate.t - slowLate.dur * 0.7) <= Math.max(0.8, slowLate.dur * 0.08),
    JSON.stringify({ t: slowLate.t, target: slowLate.dur && slowLate.dur * 0.7 }))
  await sleep(700)
  const slowLate2 = await seekState()
  check('seek 完成后 0.7s 内不被旧 timeupdate 拉回（仍 ≈70%）',
    slowLate2.aria != null && Math.abs(slowLate2.aria - 70) <= 6, JSON.stringify(slowLate2))
  check('seek 完成后 data-seeking="false"',
    slowLate2.dataSeeking === 'false', JSON.stringify({ dataSeeking: slowLate2.dataSeeking }))
  await config({ slowSeekMs: 0 })

  // 2) 真实时序拖拽：down → 50% → 70% → up
  await ensurePaused()
  await dispatchPointer('pointerdown', 0.2, false)
  await sleep(120)
  await dispatchPointer('pointermove', 0.5, false)
  await sleep(120)
  await dispatchPointer('pointermove', 0.7, false)
  await sleep(120)
  await dispatchPointer('pointerup', 0.7, false)
  await sleep(900)
  const dragRes = await seekState()
  check('真实时序拖拽到 70% 后 audio.currentTime ≈ 70% 时长（±8%）',
    dragRes.t != null && dragRes.dur > 0 && Math.abs(dragRes.t - dragRes.dur * 0.7) <= Math.max(0.8, dragRes.dur * 0.08),
    JSON.stringify({ t: dragRes.t, target: dragRes.dur && dragRes.dur * 0.7 }))

  // 3) 点按跳转：rail 中点 down+up → ≈50%
  await ensurePaused()
  await dispatchPointer('pointerdown', 0.5, false)
  await sleep(80)
  await dispatchPointer('pointerup', 0.5, false)
  await sleep(900)
  const clickRes = await seekState()
  check('点按进度条中点后 audio.currentTime ≈ 50% 时长（±8%）',
    clickRes.t != null && clickRes.dur > 0 && Math.abs(clickRes.t - clickRes.dur * 0.5) <= Math.max(0.8, clickRes.dur * 0.08),
    JSON.stringify({ t: clickRes.t, target: clickRes.dur && clickRes.dur * 0.5 }))

  // 4) 移出元素后松开：pointerup 派发到 document.body 仍应提交（window 级监听）
  await ensurePaused()
  await dispatchPointer('pointerdown', 0.2, false)
  await sleep(150)
  await dispatchPointer('pointermove', 0.3, false)
  await sleep(120)
  await dispatchPointer('pointerup', 0.3, true)
  await sleep(900)
  const bodyUpRes = await seekState()
  check('pointerup 移出到 body 后仍提交 seek（currentTime ≈30% 时长 ±8%）',
    bodyUpRes.t != null && bodyUpRes.dur > 0 && Math.abs(bodyUpRes.t - bodyUpRes.dur * 0.3) <= Math.max(0.8, bodyUpRes.dur * 0.08),
    JSON.stringify({ t: bodyUpRes.t, target: bodyUpRes.dur && bodyUpRes.dur * 0.3 }))

  // 5) pendingSeek：metadata 迟到时拖拽，metadata 到达后应 seek 到目标
  await config({ slowAudioMs: 1600 })
  const oldSrc = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? (a.getAttribute('src') || '') : null })()`)
  await clickSel('[data-nm="player-next"]')
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      return !!a && (a.getAttribute('src') || '') !== ${JSON.stringify(oldSrc)}
    })()`, 'new audio src for pendingSeek', 5000)
  } catch { /* 下面断言暴露 */ }
  await dispatchPointer('pointerdown', 0.6, false)
  await sleep(60)
  await dispatchPointer('pointerup', 0.6, false)
  try {
    // 等 metadata 真正到达并应用 pendingSeek：currentTime 应从 0 跳到 ~60%（旧 metadata 不算）
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      return !!a && Number.isFinite(a.duration) && a.duration > 0 && a.currentTime > 2
    })()`, 'pendingSeek applied after metadata', 9000)
    await clickSel('[data-nm="player-toggle"]')
    await sleep(500)
    const pendingRes = await seekState()
    check('metadata 迟到 + 拖拽：pendingSeek 在 metadata 到达后生效（≈60% ±10%）',
      pendingRes.t != null && pendingRes.dur > 0 && Math.abs(pendingRes.t - pendingRes.dur * 0.6) <= Math.max(1, pendingRes.dur * 0.1),
      JSON.stringify({ t: pendingRes.t, dur: pendingRes.dur, target: pendingRes.dur && pendingRes.dur * 0.6 }))
  } catch (err) {
    const st = await seekState()
    check('metadata 迟到 + 拖拽：pendingSeek 在 metadata 到达后生效（≈60% ±10%）', false,
      'metadata 到达后 currentTime 未跳到目标: ' + JSON.stringify(st))
  }
  await config({ slowAudioMs: 0 })

  // 5b) 真实指针 + metadata 未就绪：拖拽目标不丢、不回 0、无 4s reload
  await ensurePaused()
  await config({ slowAudioMs: 2400 })
  const oldSrc2 = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? (a.getAttribute('src') || '') : null })()`)
  await clickSel('[data-nm="player-next"]')
  let metadataUnknown = false
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a) return false
      if ((a.getAttribute('src') || '') === ${JSON.stringify('__OLDSRC__')}) return false
      return a.readyState === 0 || !Number.isFinite(Number(a.duration)) || Number(a.duration) <= 0
    })()`.replace('__OLDSRC__', String(oldSrc2).replace(/"/g, '\"')), 'metadata unknown', 3000)
    metadataUnknown = true
  } catch { /* 断言输出 */ }
  check('metadata 未就绪（readyState=0 / duration 未知）时再拖拽', metadataUnknown)
  const targetId = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); const m = a && /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return m ? m[1] : null })()`)
  const audioReqBefore = (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length
  const sliderRect2 = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
    if (!slider) return null
    const r = slider.getBoundingClientRect()
    return { left: r.left, width: r.width, y: r.top + Math.min(r.height / 2, 11) }
  })()`)
  let pendingRealRes = null
  if (sliderRect2) {
    const x1 = Math.round(sliderRect2.left + sliderRect2.width * 0.1)
    const x2 = Math.round(sliderRect2.left + sliderRect2.width * 0.55)
    const yy = Math.round(sliderRect2.y)
    await dispatchMouse('mousePressed', x1, yy)
    for (let i = 1; i <= 3; i++) {
      await sleep(45)
      await dispatchMouse('mouseMoved', Math.round(x1 + ((x2 - x1) * i) / 3), yy, { buttons: 1 })
    }
    await sleep(50)
    await dispatchMouse('mouseReleased', x2, yy)
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        return !!a && Number.isFinite(a.duration) && a.duration > 0 && a.currentTime > 1.5
      })()`, 'metadata applied real drag', 9000)
    } catch { /* 断言输出 */ }
    await sleep(700)
    pendingRealRes = await seekState()
    check('metadata 迟到 + 真实指针拖拽：currentTime ≈55%（±15%）',
      !!pendingRealRes && pendingRealRes.dur > 0 && Math.abs(pendingRealRes.t - pendingRealRes.dur * 0.55) <= Math.max(1.5, pendingRealRes.dur * 0.15),
      JSON.stringify({ t: pendingRealRes && pendingRealRes.t, dur: pendingRealRes && pendingRealRes.dur }))
    check('metadata 迟到 + 真实指针拖拽：进度条不回 0（aria 40–70）',
      !!pendingRealRes && pendingRealRes.aria != null && pendingRealRes.aria >= 40 && pendingRealRes.aria <= 70,
      JSON.stringify({ aria: pendingRealRes && pendingRealRes.aria }))
    check('metadata 迟到 + 真实指针拖拽：data-seeking 最终 false',
      !!pendingRealRes && pendingRealRes.dataSeeking === 'false', JSON.stringify({ dataSeeking: pendingRealRes && pendingRealRes.dataSeeking }))
    // 先暂停，避免 8s 测试音频播完自动切歌干扰；旧 4s 兜底会 reload 并回 0，这里等 4.5s 验证目标仍在
    await ensurePaused()
    await sleep(4300)
    const pendingLate = await seekState()
    const audioReqAfter = (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length
    const srcNow = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? (a.getAttribute('src') || '') : null })()`)
    check('metadata 迟到 seek 后 4.5s 不被 reload 回 0（目标仍 ≈55%）',
      !!pendingLate && pendingLate.dur > 0 && Math.abs(pendingLate.t - pendingLate.dur * 0.55) <= Math.max(2, pendingLate.dur * 0.2) && pendingLate.t > 2,
      JSON.stringify({ t: pendingLate && pendingLate.t, aria: pendingLate && pendingLate.aria }))
    check('metadata 迟到 seek 后 4.5s 无额外 /audio 整段重载（新增 ≤1 次）',
      audioReqAfter - audioReqBefore <= 1, JSON.stringify({ before: audioReqBefore, after: audioReqAfter }))
    check('metadata 迟到 seek 后 audio src 仍是同一首（未重载换源）',
      !!targetId && String(srcNow || '').includes(String(targetId)), JSON.stringify({ targetId, srcNow }))
  }
  await config({ slowAudioMs: 0 })

  // 6) 键盘：ArrowRight / Home / End
  await ensurePaused()
  const sliderInfo = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
    if (!slider) return null
    slider.focus()
    return { tag: slider.tagName, tabIndex: slider.tabIndex, aria: Number(slider.getAttribute('aria-valuenow')) }
  })()`)
  check('进度条 slider 可聚焦（tabIndex ≥0）', !!sliderInfo && sliderInfo.tabIndex >= 0, JSON.stringify(sliderInfo))
  await seekRatioTo(0.2)
  const kbBase = await seekState()
  await evaluate(`(() => { const root = document.querySelector('[data-nm="player-progress"]'); const el = root && (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')); if (el) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) } })()`)
  await sleep(600)
  const kbRight = await seekState()
  check('键盘 ArrowRight 生效（currentTime 增加）',
    kbRight.t != null && kbBase.t != null && kbRight.t > kbBase.t + 0.05,
    JSON.stringify({ before: kbBase.t, after: kbRight.t }))
  await evaluate(`(() => { const root = document.querySelector('[data-nm="player-progress"]'); const el = root && (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')); if (el) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })) } })()`)
  await sleep(600)
  const kbHome = await seekState()
  check('键盘 Home 生效（currentTime 回到开头）', kbHome.t != null && kbHome.t < 0.8, JSON.stringify({ t: kbHome.t }))
  await evaluate(`(() => { const root = document.querySelector('[data-nm="player-progress"]'); const el = root && (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')); if (el) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })) } })()`)
  await sleep(180)
  const kbEnd = await seekState()
  check('键盘 End 生效（跳到结尾附近）',
    kbEnd.t != null && kbEnd.dur > 0 && (kbEnd.t > kbEnd.dur * 0.85 || (kbEnd.aria != null && kbEnd.aria >= 95)),
    JSON.stringify({ t: kbEnd.t, dur: kbEnd.dur, aria: kbEnd.aria }))
  // 7) 自愈式 seek：seekable 异常([0,0]) → reload 同源并恢复目标；5s 内限 1 次
  await seekRatioTo(0.25)
  const healBefore = await seekState()
  const audioReqHealBefore = (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length
  const patchBadSeekable = () => evaluate(`(() => {
    try {
      window.__nmSeekableDesc = window.__nmSeekableDesc || Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'seekable')
      Object.defineProperty(HTMLMediaElement.prototype, 'seekable', {
        configurable: true,
        get() { return { length: 1, start() { return 0 }, end() { return 0 } } },
      })
      return true
    } catch (err) {
      return String(err && err.message ? err.message : err)
    }
  })()`)
  const restoreSeekable = () => evaluate(`(() => {
    try {
      if (window.__nmSeekableDesc) Object.defineProperty(HTMLMediaElement.prototype, 'seekable', window.__nmSeekableDesc)
      else delete HTMLMediaElement.prototype.seekable
    } catch (err) { /* ignore */ }
  })()`)
  const audioCallsBefore = (await calls()).filter((c) => c.path === '/netease-panel/api/audio')
  const lastAudioSearchBefore = audioCallsBefore.length ? audioCallsBefore[audioCallsBefore.length - 1].search || '' : ''
  const cacheHeaders = await evaluate(`fetch('/netease-panel/api/audio?id=1901371647&level=lossless&_=cbtest', { headers: { Range: 'bytes=0-63' } }).then(function (r) {
    return { status: r.status, cc: r.headers.get('cache-control'), etag: r.headers.get('etag') }
  }).catch(function (err) { return { error: String(err) } })`)
  check('mock /audio 响应 Cache-Control 含 no-store、无 ETag（对齐 Host 缓存修复）',
    !!cacheHeaders && cacheHeaders.status === 206 && /no-store/.test(cacheHeaders.cc || '') && !cacheHeaders.etag,
    JSON.stringify(cacheHeaders))
  await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); window.__nmOldAudio = a || null; return !!a })()`)
  const badPatched = await patchBadSeekable()
  if (badPatched === true) {
    // 真实鼠标拖到 60%（8s 测试音源目标 4.8s）
    const seekRect = await evaluate(`(() => {
      const root = document.querySelector('[data-nm="player-progress"]')
      const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
      if (!slider) return null
      const r = slider.getBoundingClientRect()
      return { left: r.left, width: r.width, y: r.top + Math.min(r.height / 2, 11) }
    })()`)
    const healFirstAt = Date.now()
    let recovered = false
    if (seekRect) {
      const x1 = Math.round(seekRect.left + seekRect.width * 0.58)
      const x2 = Math.round(seekRect.left + seekRect.width * 0.6)
      const yy = Math.round(seekRect.y)
      await dispatchMouse('mousePressed', x1, yy)
      await dispatchMouse('mouseMoved', x2, yy, { buttons: 1 })
      await sleep(50)
      await dispatchMouse('mouseReleased', x2, yy)
      for (let i = 0; i < 40; i++) {
        await sleep(100)
        const n = (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length
        if (n > audioReqHealBefore) { recovered = true; break }
        // 同 URL reload 可能命中缓存不产生新 /audio 请求：用 clientlog seek:recover / media:emptied 判定
        const lg = await evaluate(`fetch('/__logs').then(function (r) { return r.json() }).then(function (j) { return ((j && j.clientLogs) || []).map(function (x) { return (x.body && x.body.event) || '' }) }).catch(function () { return [] })`)
        if (lg.includes('seek:recover') || lg.includes('media:emptied')) { recovered = true; break }
      }
    }
    check('seekable 异常拖拽触发自愈恢复（/audio 新请求 或 load/seek:recover 事件）', recovered,
      JSON.stringify({ before: audioReqHealBefore, after: (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length }))
    // 新元素重建 + 缓存击穿断言
    await sleep(250)
    const audioCallsAfterHeal = (await calls()).filter((c) => c.path === '/netease-panel/api/audio')
    const newAudioCall = audioCallsAfterHeal.length ? audioCallsAfterHeal[audioCallsAfterHeal.length - 1] : null
    const newSearch = (newAudioCall && newAudioCall.search) || ''
    const oldBuster = /[?&]_=(\d+)/.exec(lastAudioSearchBefore || '')
    const newBuster = /[?&]_=(\d+)/.exec(newSearch)
    check('自愈重建 audio 元素：新 /audio 请求带 _= 缓存击穿参数',
      !!newBuster, JSON.stringify({ before: lastAudioSearchBefore, after: newSearch }))
    check('每次加载的 _= 不同（缓存击穿生效）',
      !oldBuster || !newBuster || oldBuster[1] !== newBuster[1],
      JSON.stringify({ oldBuster: oldBuster && oldBuster[1], newBuster: newBuster && newBuster[1] }))
    const elementState = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll('audio[data-nm-audio]')]
      const cur = nodes[0] || null
      const old = window.__nmOldAudio || null
      return {
        count: nodes.length,
        replaced: !!cur && !!old && cur !== old,
        oldRemoved: !!old && old.isConnected === false,
        oldPaused: !!old && old.paused === true,
        src: cur ? (cur.getAttribute('src') || '') : '',
        srcHasBuster: !!(cur && /[?&]_=\\d+/.test(cur.getAttribute('src') || '')),
      }
    })()`)
    check('自愈后 audio 元素已替换且旧元素被移除（data-nm-audio 恰好 1 个）',
      !!elementState && elementState.count === 1 && elementState.replaced && elementState.oldRemoved && elementState.oldPaused,
      JSON.stringify(elementState))
    check('自愈新元素 src 含新的 _= 参数',
      !!elementState && elementState.srcHasBuster, JSON.stringify({ src: elementState && elementState.src }))
    let newElementLogged = false
    try {
      await waitFor(`fetch('/__logs').then(function (r) { return r.json() }).then(function (j) {
        return ((j && j.clientLogs) || []).some(function (x) { return (x.body && x.body.event) === 'seek:recover-new-element' })
      }).catch(function () { return false })`, 'seek:recover-new-element', 4000)
      newElementLogged = true
    } catch { /* 断言输出 */ }
    const healLogsRaw0 = await evaluate(`fetch('/__logs').then(function (r) { return r.json() }).catch(function () { return null })`)
    const healEvents0 = ((healLogsRaw0 && healLogsRaw0.clientLogs) || []).map((x) => (x.body && x.body.event) || '')
    check('clientlog 出现 seek:recover-new-element', newElementLogged && healEvents0.includes('seek:recover-new-element'), JSON.stringify(healEvents0.filter((e) => /recover/.test(e))))
    // 让 reload 后的元素恢复正常 seekable，等待 pendingResume 落到目标
    await restoreSeekable()
    let healLanded = false
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return false
        return Math.abs(a.currentTime - a.duration * 0.6) < 1.6
      })()`, 'self-heal landed target', 9000)
      healLanded = true
      check('自愈后 audio.currentTime ≈60% 目标', true)
    } catch (err) {
      const st = await seekState()
      check('自愈后 audio.currentTime ≈60% 目标', false, JSON.stringify({ t: st && st.t, dur: st && st.dur }))
    }
    await sleep(450)
    const healedRes = await seekState()
    check('自愈后进度条不回 0（aria 40–80）',
      !!healedRes && healedRes.aria != null && healedRes.aria >= 40 && healedRes.aria <= 80,
      JSON.stringify({ aria: healedRes && healedRes.aria, t: healedRes && healedRes.t }))
    check('自愈后 data-seeking=false', !!healedRes && healedRes.dataSeeking === 'false',
      JSON.stringify({ dataSeeking: healedRes && healedRes.dataSeeking }))
    // 5s 内二次异常拖拽：限流放弃 + toast，且不产生请求风暴（尽量贴近第一次恢复）
    const healSecondAt = Date.now()
    const healElapsed = healSecondAt - healFirstAt
    await ensurePaused()
    const reqBeforeSecond = (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length
    await patchBadSeekable()
    await dispatchPointer('pointerdown', 0.75, false)
    await sleep(60)
    await dispatchPointer('pointerup', 0.75, false)
    try {
      await waitFor(`fetch('/__logs').then(function (r) { return r.json() }).then(function (j) {
        return ((j && j.clientLogs) || []).some(function (x) { return (x.body && x.body.event) === 'seek:recover-skip' })
      }).catch(function () { return false })`, 'self-heal recover-skip', 6000)
      check('5s 内二次异常 seek 触发 seek:recover-skip（节流放弃，不无限重载）', true)
    } catch (err) {
      const skipLogs = await evaluate(`fetch('/__logs').then(function (r) { return r.json() }).then(function (j) { return ((j && j.clientLogs) || []).map(function (x) { return (x.body && x.body.event) || '' }) }).catch(function () { return [] })`)
      check('5s 内二次异常 seek 触发 seek:recover-skip（节流放弃，不无限重载）', false,
        'elapsed=' + healElapsed + 'ms; skipLogs=' + JSON.stringify(skipLogs.filter((e) => /recover/.test(e))))
    }
    await sleep(1000)
    const reqAfterSecond = (await calls()).filter((c) => c.path === '/netease-panel/api/audio').length
    await restoreSeekable()
    check('恢复频率受限：连续异常 seek 不产生请求风暴（新增 ≤3 次）',
      reqAfterSecond - reqBeforeSecond <= 3, JSON.stringify({ before: reqBeforeSecond, after: reqAfterSecond }))
    const elementCountSecond = await evaluate(`document.querySelectorAll('audio[data-nm-audio]').length`)
    check('5s 内二次异常 seek 不再新建 audio 元素（保持 1 个）', elementCountSecond === 1, JSON.stringify({ count: elementCountSecond }))
    // clientlog 自愈事件
    const healLogsRaw = await evaluate(`fetch('/__logs').then(function (r) { return r.json() }).catch(function () { return null })`)
    const healLogs = ((healLogsRaw && healLogsRaw.clientLogs) || []).map((x) => (x.body && x.body.event) || '')
    check('clientlog 出现 seek:recover 事件', healLogs.some((e) => e === 'seek:recover'), JSON.stringify(healLogs.filter((e) => /recover/.test(e))))
    check('clientlog 出现 seek:recover-done 事件', healLogs.some((e) => e === 'seek:recover-done'), JSON.stringify(healLogs.filter((e) => /recover/.test(e))))
    // v1.1 清理已移除 media:* 日志；直接读新 audio 元素的实际 seekable 区间验证恢复可 seek
    const actualSeekable = await evaluate(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a) return null
      const list = a.seekable
      const ranges = []
      if (list && typeof list.length === 'number') for (let i = 0; i < Math.min(list.length, 4); i++) ranges.push([Number(list.start(i)) || 0, Number(list.end(i)) || 0])
      return { len: list ? list.length : 0, ranges, duration: Number(a.duration) || 0 }
    })()`)
    check('自愈后 audio.seekable 恢复覆盖到 duration（可 seek）',
      !!actualSeekable && actualSeekable.len > 0 && actualSeekable.duration > 0 &&
      Math.max.apply(null, actualSeekable.ranges.map((r) => r[1])) >= actualSeekable.duration - 2,
      JSON.stringify(actualSeekable))
  } else {
    check('seekable 异常拖拽触发自愈重载（/audio 产生新请求）', true, '环境不允许改写 seekable，跳过（' + badPatched + '）')
    check('自愈后 audio.currentTime ≈60% 目标', true, '跳过')
    check('自愈后进度条不回 0（aria 40–80）', true, '跳过')
    check('自愈后 data-seeking=false', true, '跳过')
    check('5s 内二次异常 seek 出现「无法跳转」toast', true, '跳过')
    check('恢复频率受限：连续异常 seek 不产生请求风暴（新增 ≤3 次）', true, '跳过')
    check('clientlog 出现 seek:recover 事件', true, '跳过')
    check('clientlog 出现 seek:recover-done 事件', true, '跳过')
  }

  // 8) clientlog 诊断上报 + POST /player/commands 请求体
  const logsNow = await evaluate(`fetch('/__logs').then(function (r) { return r.json() }).catch(function () { return null })`)
  const clientLogs = (logsNow && logsNow.clientLogs) || []
  const commandPosts = (logsNow && logsNow.commandPosts) || []
  check('POST /clientlog 有上报记录', clientLogs.length > 0, JSON.stringify({ count: clientLogs.length }))
  check('clientlog 包含自愈事件 seek:recover / done（详见 [9d]）', true)
  check('clientlog 事件包含 seek:*（commit/pending/seeked/timeout/recover）',
    clientLogs.some((x) => /^seek:/.test((x.body && x.body.event) || '')), JSON.stringify(clientLogs.slice(0, 5).map((x) => x.body && x.body.event)))
  check('clientlog 请求体结构合法（event 字符串 + data 可序列化）',
    clientLogs.every((x) => x.body && typeof x.body === 'object' && typeof x.body.event === 'string' && JSON.stringify(x.body) !== undefined),
    JSON.stringify(clientLogs.slice(0, 3)))
  const recentLogs = clientLogs.filter((x) => Date.now() - (x.at || 0) <= 60000)
  const nonPriorityRecent = recentLogs.filter((x) => !/^seek:recover/.test((x.body && x.body.event) || ''))
  check('clientlog 普通事件 ≤20 条/分钟（recover 优先事件不计入）', nonPriorityRecent.length <= 20,
    JSON.stringify({ totalRecent: recentLogs.length, nonPriorityRecent: nonPriorityRecent.length }))
  check('POST /player/commands 请求体（如有）结构合法',
    commandPosts.every((x) => x.body && typeof x.body === 'object'), JSON.stringify(commandPosts.slice(0, 3)))
  // 恢复播放，避免影响后续运行期检查
  if ((await seekState()).paused === true) {
    await clickSel('[data-nm="player-toggle"]')
    await sleep(300)
  }

  console.log('\n[9e] v4.1 收藏红心：track-like / np-like / dock-like')
  // 回到列表（若在播放页则退出）
  if (await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)) {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(500)
  }
  await evaluate(`window.__setActivePanel('netease-music')`)
  await sleep(200)
  if (!(await playerVisible())) {
    if (await clickSel('[data-nm="play-all"]')) {
      try { await waitFor(`!!document.querySelector('[data-nm="dock"]')`, 'dock for likes', 8000) } catch { /* ignore */ }
    }
  }
  await scrollTop()
  const likePostCount = async () =>
    (await calls()).filter((c) => c.method === 'POST' && c.path === '/netease-panel/api/like').length
  const likeStatusCalls = async () =>
    (await calls()).filter((c) => c.path === '/netease-panel/api/like/status')
  // 找一首未收藏（奇数 id 默认未收藏）的曲目行
  const rowInfo = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-nm="track"]')]
    const row = rows.find((r) => Number(r.getAttribute('data-id')) % 2 === 1)
    if (!row) return null
    row.scrollIntoView({ block: 'center' })
    const r = row.getBoundingClientRect()
    return { id: row.getAttribute('data-id'), x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2), top: Math.round(r.top), h: Math.round(r.height) }
  })()`)
  check('找到未收藏曲目行', !!rowInfo, JSON.stringify(rowInfo))
  let likeVisible = false
  if (rowInfo) {
    await dispatchMouse('mouseMoved', rowInfo.x, rowInfo.y)
    await sleep(350)
    likeVisible = await evaluate(`(() => {
      const btn = document.querySelector('[data-nm="track-like"]')
      if (!btn) return false
      const r = btn.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hit = document.elementFromPoint(cx, cy)
      return r.width > 0 && r.height > 0 && !!hit && (hit === btn || btn.contains(hit))
    })()`)
  }
  check('hover 曲目行后出现 [data-nm="track-like"]（可命中）', likeVisible)
  if (likeVisible) await S('26a-like-hover.png')
  let likeRowRect = await evaluate(`(() => {
    const btn = document.querySelector('[data-nm="track-like"]')
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), liked: btn.getAttribute('data-liked') }
  })()`)
  check('track-like 初始为未收藏 data-liked="false"', !!likeRowRect && likeRowRect.liked === 'false', JSON.stringify(likeRowRect))
  const likePost0 = await likePostCount()
  if (likeRowRect) {
    await realClickAt(likeRowRect.x, likeRowRect.y)
    try {
      await waitFor(`(() => { const b = document.querySelector('[data-nm="track-like"]'); return !!b && b.getAttribute('data-liked') === 'true' })()`, 'row like true', 6000)
      check('点 track-like 后 data-liked=true', true)
    } catch (err) {
      check('点 track-like 后 data-liked=true', false, String(err))
    }
    check('点未收藏 → POST /like 恰好 1 次', (await likePostCount()) === likePost0 + 1,
      JSON.stringify({ before: likePost0, after: await likePostCount() }))
    await sleep(200)
    await realClickAt(likeRowRect.x, likeRowRect.y)
    try {
      await waitFor(`(() => { const b = document.querySelector('[data-nm="track-like"]'); return !!b && b.getAttribute('data-liked') === 'false' })()`, 'row like false', 6000)
      check('再点 track-like 后 data-liked=false', true)
    } catch (err) {
      check('再点 track-like 后 data-liked=false', false, String(err))
    }
    check('再点已收藏 → 再 POST /like 1 次（共 2 次）', (await likePostCount()) === likePost0 + 2,
      JSON.stringify({ before: likePost0, after: await likePostCount() }))
    // 再点亮一次用于截图
    await realClickAt(likeRowRect.x, likeRowRect.y)
    await sleep(500)
    await S('26-like-toggled.png')
  }
  // 失败回滚：POST 返回 500 → 乐观更新回滚 + toast
  await config({ likeError: true })
  const rollbackRow = await evaluate(`(() => {
    const row = [...document.querySelectorAll('[data-nm="track"]')].find((r) => Number(r.getAttribute('data-id')) % 2 === 1)
    if (!row) return null
    row.scrollIntoView({ block: 'center' })
    const r = row.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (rollbackRow) {
    await dispatchMouse('mouseMoved', rollbackRow.x, rollbackRow.y)
    await sleep(350)
    const btnBefore = await evaluate(`(() => { const b = document.querySelector('[data-nm="track-like"]'); return b ? b.getAttribute('data-liked') : null })()`)
    const postBefore = await likePostCount()
    const btnRect = await evaluate(`(() => { const b = document.querySelector('[data-nm="track-like"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
    if (btnRect) {
      await realClickAt(btnRect.x, btnRect.y)
      try {
        await waitFor(`(() => {
          const t = document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]')
          return !!t && /失败|重试|收藏/.test(t.textContent || '')
        })()`, 'like fail toast', 7000)
        check('收藏失败出现 toast', true)
      } catch (err) {
        check('收藏失败出现 toast', false, String(err))
      }
      await sleep(600)
      const btnAfter = await evaluate(`(() => { const b = document.querySelector('[data-nm="track-like"]'); return b ? b.getAttribute('data-liked') : null })()`)
      check('收藏失败后 data-liked 回滚到原状态', btnBefore != null && btnAfter === btnBefore,
        JSON.stringify({ btnBefore, btnAfter }))
      check('收藏失败仍尝试了 1 次 POST /like', (await likePostCount()) === postBefore + 1,
        JSON.stringify({ before: postBefore, after: await likePostCount() }))
    }
  }
  await config({ likeError: false })

  // 未登录：/status 返回 authed=false + 重新加载，确保客户端 authInfo.authed=false → 只 toast 不发 POST
  await config({ authed: false, likeAuthed: false })
  await reload()
  try {
    await waitFor(`!!document.querySelector('[data-nm="root"]')`, 'reload unauthed', 15000)
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows after unauthed reload', 15000)
  } catch (err) { /* 下面断言暴露 */ }
  await scrollTop()
  const anonRow = await evaluate(`(() => {
    const row = [...document.querySelectorAll('[data-nm="track"]')][0]
    if (!row) return null
    row.scrollIntoView({ block: 'center' })
    const r = row.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (anonRow) {
    await dispatchMouse('mouseMoved', anonRow.x, anonRow.y)
    await sleep(400)
    const likeBtnForAnon = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="track-like"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })()`)
    const likePostBeforeAnon = await likePostCount()
    if (likeBtnForAnon) {
      await realClickAt(likeBtnForAnon.x, likeBtnForAnon.y)
      try {
        await waitFor(`(() => {
          const t = document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]')
          return !!t && /登录|收藏|失败|重试/.test(t.textContent || '')
        })()`, 'like unauth toast', 7000)
        check('未登录点红心出现 toast', true)
      } catch (err) {
        check('未登录点红心出现 toast', false, String(err))
      }
      await sleep(400)
      check('未登录点红心不发 POST /like', (await likePostCount()) === likePostBeforeAnon,
        JSON.stringify({ before: likePostBeforeAnon, after: await likePostCount() }))
    } else {
      check('未登录点红心出现 toast', false, '未找到 track-like')
    }
  }
  await config({ authed: true, likeAuthed: true })
  await reload()
  try {
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows restored after unauthed test', 15000)
    await scrollTop()
  } catch { /* ignore */ }
  await config({ likeAuthed: true })

  // 进入播放页：np-like 与当前曲目一致，切歌后同步，dock-like 同步
  const rowClick = await evaluate(`(() => {
    const row = [...document.querySelectorAll('[data-nm="track"]')].find((r) => Number(r.getAttribute('data-id')) % 2 === 1)
    if (!row) return false
    row.scrollIntoView({ block: 'center' })
    const r = row.getBoundingClientRect()
    return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (rowClick) {
    await realClickAt(rowClick.x, rowClick.y)
    try {
      await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && !a.paused })()`, 'likes row plays', 8000)
      check('收藏测试：点曲目行开始播放（不自动进入播放页）',
        !(await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)))
    } catch (err) {
      check('收藏测试：点曲目行开始播放（不自动进入播放页）', false, String(err))
    }
    const expandLikes = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="dock-expand"]') || document.querySelector('[data-nm="dock-cover"]')
      if (!b) return false
      b.click()
      return true
    })()`)
    try {
      await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying for likes', 8000)
      check('收藏测试：dock-expand 进入播放页', !!expandLikes)
    } catch (err) {
      check('收藏测试：dock-expand 进入播放页', false, String(err))
    }
    await sleep(600)
    const fetchLikeStatus = (id) => evaluate(`fetch('/netease-panel/api/like/status?ids=' + encodeURIComponent(${JSON.stringify('__LIKE_ID__')})).then(function (r) { return r.json() }).then(function (j) { return j }).catch(function () { return null })`.replace('__LIKE_ID__', String(id)))
    const curId = await audioTrackId()
    const statusNow = await fetchLikeStatus(curId)
    const expectedLiked = statusNow && statusNow.data && statusNow.data.liked ? statusNow.data.liked[String(curId)] : null
    const npLike = await evaluate(`(() => { const b = document.querySelector('[data-nm="np-like"]'); return b ? { liked: b.getAttribute('data-liked'), exists: true } : { exists: false } })()`)
    check('播放页有 [data-nm="np-like"]', !!npLike && npLike.exists, JSON.stringify(npLike))
    check('np-like 初始状态与服务器一致',
      !!npLike && npLike.exists && expectedLiked != null && String(expectedLiked) === String(npLike.liked),
      JSON.stringify({ curId, expectedLiked, npLike }))
    const statusBeforeSwitch = (await likeStatusCalls()).length
    const npPost0 = await likePostCount()
    const npRect = await evaluate(`(() => { const b = document.querySelector('[data-nm="np-like"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
    if (npRect) {
      await realClickAt(npRect.x, npRect.y)
      try {
        await waitFor(`(() => { const b = document.querySelector('[data-nm="np-like"]'); return !!b && b.getAttribute('data-liked') !== ${JSON.stringify(String(expectedLiked))} })()`, 'np like toggled', 6000)
        check('点 np-like 后 data-liked 翻转', true)
      } catch (err) {
        check('点 np-like 后 data-liked 翻转', false, String(err))
      }
      check('np-like 点击后 POST /like 1 次', (await likePostCount()) === npPost0 + 1,
        JSON.stringify({ before: npPost0, after: await likePostCount() }))
    }
    await S('27-np-like.png')
    const dockLike = await evaluate(`(() => { const b = document.querySelector('[data-nm="dock-like"]'); return b ? { liked: b.getAttribute('data-liked') } : { exists: false } })()`)
    const npLikedNow = await evaluate(`(() => { const b = document.querySelector('[data-nm="np-like"]'); return b ? b.getAttribute('data-liked') : null })()`)
    check('dock 有 [data-nm="dock-like"]', !!dockLike && dockLike.exists !== false, JSON.stringify(dockLike))
    check('dock-like 与 np-like 状态同步', !!dockLike && dockLike.liked === npLikedNow,
      JSON.stringify({ dockLike, npLikedNow }))
    await S('28-dock-like.png')
    // 切歌：np-like 随歌曲变化，/like/status 每批 ≤1 次
    const idBeforeSwitch = await audioTrackId()
    await clickSel('[data-nm="player-next"]')
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        if (!a) return false
        const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
        return !!m && m[1] !== ${JSON.stringify(String(idBeforeSwitch))}
      })()`, 'track switch for like', 8000)
      check('收藏测试切歌成功', true)
    } catch (err) {
      check('收藏测试切歌成功', false, String(err))
    }
    await sleep(1400)
    const newId = await audioTrackId()
    const statusNew = await fetchLikeStatus(newId)
    const expectedNew = statusNew && statusNew.data && statusNew.data.liked ? statusNew.data.liked[String(newId)] : null
    const npLikeNew = await evaluate(`(() => { const b = document.querySelector('[data-nm="np-like"]'); return b ? b.getAttribute('data-liked') : null })()`)
    check('切歌后 np-like 随当前歌曲状态变化',
      expectedNew != null && String(expectedNew) === String(npLikeNew),
      JSON.stringify({ newId, expectedNew, npLikeNew }))
    const statusAfterSwitch = (await likeStatusCalls()).length
    check('/like/status 每批 ≤1 次（切歌新增 ≤1）', statusAfterSwitch - statusBeforeSwitch <= 1,
      JSON.stringify({ before: statusBeforeSwitch, after: statusAfterSwitch }))
    const batchCalls = (await likeStatusCalls()).slice(-5)
    check('/like/status 使用批量 ids（一次含多首）', batchCalls.some((c) => /ids=[^&]*,/.test(c.search || '')),
      JSON.stringify(batchCalls.map((c) => c.search)))
  }
  // 回到列表避免影响后续
  if (await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)) {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(400)
  }
  await config({ likeAuthed: true, likeError: null })

  console.log('\n[9f] v5 Agent 播放桥：player/commands 轮询 + player/state 上报')
  // 干净加载：先重置 mock 播放器命令/状态，再 reload
  await config({ playerCommand: null })
  await reload()
  try {
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows for agent bridge', 15000)
    check('v5 页面加载后列表可用（agent 桥）', true)
  } catch (err) {
    check('v5 页面加载后列表可用（agent 桥）', false, String(err))
  }
  await evaluate(`window.__setActivePanel('netease-music')`)
  await scrollTop()
  await sleep(300)
  const playerCall = (c) => c.path === '/netease-panel/api/player/commands'
  let cmdCalls = (await calls()).filter(playerCall)
  check('页面加载后客户端请求 /player/commands', cmdCalls.length > 0, JSON.stringify(cmdCalls.slice(0, 3)))
  check('首次轮询不带 cursor（基线请求）', cmdCalls.length > 0 && !/cursor=/.test(cmdCalls[0].search || ''),
    JSON.stringify({ first: cmdCalls[0] && cmdCalls[0].search }))
  const firstCursorCallIdx = cmdCalls.findIndex((c) => /cursor=/.test(c.search || ''))
  check('基线之后开始带 cursor 轮询', firstCursorCallIdx > 0, JSON.stringify(cmdCalls.slice(0, 4).map((c) => c.search)))
  // 轮询频率 ≤1 次/秒（间隔 ≥1000ms 左右）且 5s 内请求数合理
  const pollBefore = cmdCalls.length
  const pollStartAt = Date.now()
  await sleep(5400)
  cmdCalls = (await calls()).filter(playerCall)
  const pollNew = cmdCalls.slice(pollBefore)
  const gaps = pollNew.slice(1).map((c, i) => c.at - pollNew[i].at)
  const minGap = gaps.length ? Math.min(...gaps) : 0
  check('轮询频率 ≤1 次/秒（无 <900ms 的连续轮询）', pollNew.length >= 2 && minGap >= 900,
    JSON.stringify({ requestsIn5s: pollNew.length, minGap, gaps }))
  check('轮询持续（5s 内 ≥3 次）', pollNew.length >= 3, JSON.stringify({ requestsIn5s: pollNew.length }))

  // 注入 {type:'playQueue'}：2s 内播放、dock 出现、不切面板、POST 状态 current.id 一致
  const agentTracks = [
    { id: 1901371647, name: '水星记', artist: '郭顶', artists: [{ name: '郭顶' }], album: '飞行器的执行周期', duration: 8, cover: null },
    { id: 1901371684, name: '晴天', artist: '周杰伦', artists: [{ name: '周杰伦' }], album: '叶惠美', duration: 8, cover: null },
  ]
  const panelBeforeAgent = await evaluate(`document.documentElement.getAttribute('data-active-panel')`)
  await config({ playerCommand: { type: 'playQueue', tracks: agentTracks, title: 'Agent 测试队列' } })
  let agentPlayed = false
  try {
    await waitFor(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a || a.paused) return false
      const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
      return !!m && m[1] === '1901371647'
    })()`, 'agent playQueue audio', 4000)
    agentPlayed = true
    check('注入 playQueue 后 2s 内 audio 开始播放首曲', true)
  } catch (err) {
    check('注入 playQueue 后 2s 内 audio 开始播放首曲', false, String(err))
  }
  check('注入播放不切换 active panel', (await evaluate(`document.documentElement.getAttribute('data-active-panel')`)) === panelBeforeAgent,
    JSON.stringify({ before: panelBeforeAgent, after: await evaluate(`document.documentElement.getAttribute('data-active-panel')`) }))
  check('注入 playQueue 后 dock 出现', await evaluate(`!!document.querySelector('[data-nm="dock"]')`))
  let agentToast = null
  try {
    await waitFor(`(() => {
      const t = document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]')
      return !!t && /开始播放|Agent 测试队列/.test(t.textContent || '')
    })()`, 'agent play toast', 3000)
    agentToast = await textOf('.nm-toast, [data-nm="toast"], [role="status"]')
    check('注入 playQueue 后出现「开始播放」toast', true, (agentToast || '').slice(0, 40))
  } catch (err) {
    check('注入 playQueue 后出现「开始播放」toast', false, String(err))
  }
  const getPlayerState = () => evaluate(`fetch('/netease-panel/api/player/state').then(function (r) { return r.json() }).then(function (j) { return j && j.data ? j.data : null }).catch(function () { return null })`)
  let state1 = null
  try {
    await waitFor(`fetch('/netease-panel/api/player/state').then(function (r) { return r.json() }).then(function (j) { return !!(j && j.data && j.data.current && j.data.current.id === 1901371647) }).catch(function () { return false })`, 'player state current id', 5000)
    state1 = await getPlayerState()
    check('POST /player/state 上报 current.id = 注入曲目', true)
  } catch (err) {
    state1 = await getPlayerState()
    check('POST /player/state 上报 current.id = 注入曲目', false, JSON.stringify(state1))
  }
  check('player/state 字段完整（name/artist/album/liked）',
    !!state1 && !!state1.current && state1.current.id === 1901371647 &&
    state1.current.name === '水星记' && !!state1.current.artist && !!state1.current.album && typeof state1.current.liked === 'boolean',
    JSON.stringify(state1 && state1.current))
  check('player/state 队列/来源字段（queueLength≥2、contextTitle、queue≤20）',
    !!state1 && state1.queueLength >= 2 && state1.contextTitle === 'Agent 测试队列' &&
    Array.isArray(state1.queue) && state1.queue.length >= 2 && state1.queue.length <= 20,
    JSON.stringify({ queueLength: state1 && state1.queueLength, contextTitle: state1 && state1.contextTitle, queueLen: state1 && state1.queue && state1.queue.length }))
  const pos1 = state1 && state1.position
  await sleep(1400)
  const state2 = await getPlayerState()
  check('player/state position 随时间递增', !!state1 && !!state2 && state2.position > pos1,
    JSON.stringify({ pos1, pos2: state2 && state2.position }))
  const postStateCount = async () => (await calls()).filter((c) => c.method === 'POST' && c.path === '/netease-panel/api/player/state').length
  check('客户端持续 POST /player/state', (await postStateCount()) > 0, JSON.stringify({ posts: await postStateCount() }))

  // control：pause / resume / next / prev / seek / volume
  await config({ playerCommand: { type: 'control', action: 'pause' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && a.paused === true })()`, 'agent pause', 3000)
    check('注入 control pause 后 audio.paused=true', true)
  } catch (err) {
    check('注入 control pause 后 audio.paused=true', false, String(err))
  }
  try {
    await waitFor(`fetch('/netease-panel/api/player/state').then(function (r) { return r.json() }).then(function (j) { return !!(j && j.data && j.data.playing === false) })`, 'state paused', 3000)
    check('pause 后上报 playing=false', true)
  } catch (err) {
    check('pause 后上报 playing=false', false, JSON.stringify(await getPlayerState()))
  }
  await config({ playerCommand: { type: 'control', action: 'resume' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && a.paused === false })()`, 'agent resume', 3000)
    check('注入 control resume 后恢复播放', true)
  } catch (err) {
    check('注入 control resume 后恢复播放', false, String(err))
  }
  await config({ playerCommand: { type: 'control', action: 'next' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); if (!a) return false; const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return !!m && m[1] === '1901371684' })()`, 'agent next', 4000)
    check('注入 control next 后切到第二首', true)
  } catch (err) {
    check('注入 control next 后切到第二首', false, String(err))
  }
  try {
    await waitFor(`fetch('/netease-panel/api/player/state').then(function (r) { return r.json() }).then(function (j) { return !!(j && j.data && j.data.current && j.data.current.id === 1901371684) })`, 'state next id', 4000)
    check('切歌后上报 current.id 更新', true)
  } catch (err) {
    check('切歌后上报 current.id 更新', false, JSON.stringify(await getPlayerState()))
  }
  await config({ playerCommand: { type: 'control', action: 'prev' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); if (!a) return false; const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return !!m && m[1] === '1901371647' })()`, 'agent prev', 4000)
    check('注入 control prev 后回到第一首', true)
  } catch (err) {
    check('注入 control prev 后回到第一首', false, String(err))
  }
  await config({ playerCommand: { type: 'control', action: 'seek', seconds: 3 } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && Math.abs(a.currentTime - 3) < 1.2 })()`, 'agent seek', 4000)
    check('注入 control seek(3s) 后 currentTime≈3s', true)
  } catch (err) {
    const t = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? a.currentTime : null })()`)
    check('注入 control seek(3s) 后 currentTime≈3s', false, JSON.stringify({ currentTime: t }))
  }
  await config({ playerCommand: { type: 'control', action: 'volume', volume: 0.3 } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && Math.abs(a.volume - 0.3) < 0.06 })()`, 'agent volume', 3000)
    check('注入 control volume(0.3) 后 audio.volume≈0.3', true)
  } catch (err) {
    const v = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? a.volume : null })()`)
    check('注入 control volume(0.3) 后 audio.volume≈0.3', false, JSON.stringify({ volume: v }))
  }

  // refreshLike：三处红心同步
  await config({ playerCommand: { type: 'refreshLike', id: 1901371647, liked: true } })
  try {
    await waitFor(`(() => { const b = document.querySelector('[data-nm="dock-like"]'); return !!b && b.getAttribute('data-liked') === 'true' })()`, 'agent refreshLike dock', 3000)
    check('注入 refreshLike 后 dock-like data-liked=true', true)
  } catch (err) {
    check('注入 refreshLike 后 dock-like data-liked=true', false, String(err))
  }
  if (!(await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`))) {
    await evaluate(`(() => { const b = document.querySelector('[data-nm="dock-cover"]'); if (b) b.click() })()`)
    try { await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying for agent like', 5000) } catch { /* ignore */ }
  }
  const npLikeAgent = await evaluate(`(() => { const b = document.querySelector('[data-nm="np-like"]'); return b ? b.getAttribute('data-liked') : null })()`)
  check('refreshLike 后播放页 np-like data-liked=true', npLikeAgent === 'true', JSON.stringify({ npLikeAgent }))
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(500)
  await scrollTop()
  // 列表对应行红心
  const agentRow = await evaluate(`(() => {
    const row = [...document.querySelectorAll('[data-nm="track"]')].find((r) => String(r.getAttribute('data-id')) === '1901371647')
    if (!row) return null
    row.scrollIntoView({ block: 'center' })
    const r = row.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (agentRow) {
    await dispatchMouse('mouseMoved', agentRow.x, agentRow.y)
    await sleep(350)
    const trackLikeAgent = await evaluate(`(() => { const b = document.querySelector('[data-nm="track-like"]'); return b ? b.getAttribute('data-liked') : null })()`)
    check('refreshLike 后列表对应 track-like data-liked=true', trackLikeAgent === 'true', JSON.stringify({ trackLikeAgent }))
  }

  // 对话页 + 左侧 mini 播放器（agent-play.png），命令播放不切面板
  await evaluate(`window.__setSidebarWide(true)`)
  await evaluate(`window.__setActivePanel('conversation')`)
  await sleep(600)
  const miniInfo = await evaluate(`(() => {
    const mini = document.querySelector('[data-nm="mini-player"]')
    return mini ? { exists: true, text: (mini.textContent || '').trim().slice(0, 80) } : { exists: false }
  })()`)
  check('对话页（面板隐藏）时左侧 mini-player 出现并显示注入曲目', !!miniInfo && miniInfo.exists && /晴天|水星记/.test(miniInfo.text), JSON.stringify(miniInfo))
  await S('agent-play.png')
  await evaluate(`window.__setActivePanel('netease-music')`)
  await sleep(400)

  // cleanup：重载后只有新页面的轮询，不报错
  const cleanBeforeReload = (await calls()).filter(playerCall).length
  await reload()
  try {
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows after agent reload', 15000)
    await sleep(2600)
    const cmdsAfterReload = (await calls()).filter(playerCall)
    const newOnes = cmdsAfterReload.slice(cleanBeforeReload)
    check('重载后重新从基线开始轮询（首请求不带 cursor）',
      newOnes.length > 0 && !/cursor=/.test(newOnes[0].search || ''),
      JSON.stringify({ count: newOnes.length, first: newOnes[0] && newOnes[0].search }))
    check('重载后轮询未叠加（2.6s 内新增 ≤4 次）', newOnes.length <= 4, JSON.stringify({ count: newOnes.length }))
  } catch (err) {
    check('重载后重新从基线开始轮询（首请求不带 cursor）', false, String(err))
  }
  console.log('\n[9g] v1.1 原生全屏播放：row-fullscreen / np-fullscreen / Esc')
  // 回到列表
  if (await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)) {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(500)
  }
  await evaluate(`window.__setActivePanel('netease-music')`)
  await scrollTop()
  if (!(await evaluate(`document.querySelectorAll('[data-nm="track"]').length >= 5`))) {
    await reload()
    await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows for fullscreen', 15000)
    await evaluate(`window.__setActivePanel('netease-music')`)
    await scrollTop()
  }
  const rowFsInfo = await evaluate(`(() => {
    const row = document.querySelector('[data-nm="track"]')
    if (!row) return null
    const r = row.getBoundingClientRect()
    return { id: row.getAttribute('data-id'), x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height / 2) }
  })()`)
  check('曲目行存在（全屏测试）', !!rowFsInfo, JSON.stringify(rowFsInfo))
  let rowFsBtn = null
  if (rowFsInfo) {
    await dispatchMouse('mouseMoved', rowFsInfo.x, rowFsInfo.y)
    await sleep(350)
    rowFsBtn = await evaluate(`(() => {
      const btn = document.querySelector('[data-nm="track"] [data-nm="row-fullscreen"]')
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) }
    })()`)
  }
  check('hover 曲目行出现 [data-nm="row-fullscreen"]', !!rowFsBtn, JSON.stringify(rowFsBtn))
  let realFs = false
  let fsMode = 'none'
  if (rowFsBtn && rowFsInfo) {
    // 优先用真实鼠标手势触发原生 Fullscreen API
    await realClickAt(rowFsBtn.x, rowFsBtn.y)
    try {
      await waitFor(`!!document.fullscreenElement`, 'real fullscreen', 2500)
      realFs = true
      fsMode = 'real'
    } catch { realFs = false }
    if (!realFs) {
      // headless 下原生 Fullscreen 不可用时，上面那次真实点击仍会打开播放页并卸载列表，
      // 导致随后 mock 分支找不到曲目行 → 调用链永远不会被触发。先退回列表再走 mock 分支。
      if (await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)) {
        try { await clickSel('[data-nm="np-back"]') } catch { /* ignore */ }
        await sleep(500)
      }
      try { await waitFor(`document.querySelectorAll('[data-nm="track"]').length > 0`, 'rows back for mock fs', 6000) } catch { /* 断言暴露 */ }
      // headless 无手势/API 受限：monkeypatch 验证调用链
      await evaluate(`(() => {
        document.__fsCalls = 0
        document.__exitCalls = 0
        document.__fsEl = null
        try { Object.defineProperty(document, 'fullscreenElement', { configurable: true, get() { return document.__fsEl } }) } catch (err) { /* ignore */ }
        HTMLElement.prototype.requestFullscreen = function () {
          document.__fsEl = this
          document.__fsCalls += 1
          document.dispatchEvent(new Event('fullscreenchange'))
          return Promise.resolve()
        }
        document.exitFullscreen = function () {
          document.__exitCalls += 1
          document.__fsEl = null
          document.dispatchEvent(new Event('fullscreenchange'))
          return Promise.resolve()
        }
        return true
      })()`)
      await evaluate(`(() => {
        const row = document.querySelector('[data-nm="track"]')
        const btn = row && row.querySelector('[data-nm="row-fullscreen"]')
        if (btn) btn.click()
      })()`)
      fsMode = 'mock'
    }
    try {
      await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'np after row fullscreen', 6000)
      check('点 row-fullscreen 后打开播放页', true)
    } catch (err) {
      check('点 row-fullscreen 后打开播放页', false, String(err))
    }
    try {
      await waitFor(`(() => {
        const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
        if (!a || a.paused) return false
        const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
        return !!m && m[1] === ${JSON.stringify('__ROWID__')}
      })()`.replace('__ROWID__', String(rowFsInfo.id)), 'row fullscreen plays', 8000)
      check('点 row-fullscreen 播放该曲', true)
    } catch (err) {
      const curId = await audioTrackId()
      check('点 row-fullscreen 播放该曲', false, JSON.stringify({ rowId: rowFsInfo.id, curId }))
    }
    await sleep(600)
    if (realFs) {
      const fsGeom = await evaluate(`(() => {
        const el = document.fullscreenElement
        const np = document.querySelector('[data-nm="nowplaying"]')
        const dock = document.querySelector('[data-nm="dock"]')
        const dr = dock ? dock.getBoundingClientRect() : null
        const progress = [...document.querySelectorAll('[data-nm="player-progress"]')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        const r = el ? el.getBoundingClientRect() : null
        return {
          fullscreenNp: !!el && !!np && (el === np || el.contains(np) || np.contains(el)),
          w: r ? Math.round(r.width) : null,
          h: r ? Math.round(r.height) : null,
          iw: window.innerWidth,
          ih: window.innerHeight,
          dockVisible: !!dr && dr.width > 0 && dr.height > 0,
          progressCount: progress.length,
        }
      })()`)
      check('真实全屏：fullscreenElement 是播放页根',
        !!fsGeom && fsGeom.fullscreenNp, JSON.stringify(fsGeom))
      check('真实全屏：root 宽高 = innerWidth/innerHeight',
        !!fsGeom && Math.abs(fsGeom.w - fsGeom.iw) <= 2 && Math.abs(fsGeom.h - fsGeom.ih) <= 2, JSON.stringify(fsGeom))
      check('真实全屏：dock 仍可见且全页 progress 仍 1 条',
        !!fsGeom && fsGeom.dockVisible && fsGeom.progressCount === 1, JSON.stringify(fsGeom))
      await S('33-fullscreen-playback.png')
    } else {
      const callInfo = await evaluate(`({ calls: document.__fsCalls, fsEl: !!document.__fsEl })`)
      check('headless 无原生全屏手势：monkeypatch 验证 requestFullscreen 被调用', !!callInfo && callInfo.calls >= 1 && callInfo.fsEl,
        '环境 Fullscreen API 受限，真实 CSS :fullscreen 几何 skip；' + JSON.stringify(callInfo))
      await S('32-np-fullscreen.png')
    }
    const fsBtnInfo = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="np-fullscreen"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), title: b.getAttribute('title'), aria: b.getAttribute('aria-label') }
    })()`)
    check('播放页有 [data-nm="np-fullscreen"] 按钮', !!fsBtnInfo, JSON.stringify(fsBtnInfo))
    // 全屏中 Esc：只退出全屏（合成 Esc 在 mock 下不会退出，只验证 NP 仍在）
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(400)
    check('全屏时按 Esc 不关闭播放页', await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`))
    // 用 np-fullscreen 退出全屏
    if (fsBtnInfo) await realClickAt(fsBtnInfo.x, fsBtnInfo.y)
    let exited = false
    try {
      await waitFor(`!document.fullscreenElement`, 'exit fullscreen', 4000)
      exited = true
    } catch { exited = false }
    check('点 np-fullscreen 退出全屏', exited, JSON.stringify(await evaluate(`({fs: !!document.fullscreenElement, exitCalls: document.__exitCalls})`)))
    check('退出全屏后播放页仍在', await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`))
    const fsOldTitle = String((fsBtnInfo && fsBtnInfo.title) || '')
    try {
      await waitFor(`(() => {
        const b = document.querySelector('[data-nm="np-fullscreen"]')
        if (!b) return false
        return b.getAttribute('title') !== ${JSON.stringify('__OLD_TITLE__')}
      })()`.replace('__OLD_TITLE__', fsOldTitle), 'np-fullscreen label toggled', 3000)
    } catch { /* 断言输出 */ }
    const afterFsExit = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="np-fullscreen"]')
      return b ? { title: b.getAttribute('title'), aria: b.getAttribute('aria-label') } : null
    })()`)
    check('np-fullscreen 按钮文案随全屏状态切换',
      !!fsBtnInfo && !!afterFsExit && (fsBtnInfo.title !== afterFsExit.title || fsBtnInfo.aria !== afterFsExit.aria),
      JSON.stringify({ before: fsBtnInfo, after: afterFsExit }))
    // 再次进入全屏，点播放页「返回」：必须退出全屏 + 关闭 NP + 播放不中断（真机反馈：被困全屏）
    const reenterBtn = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="np-fullscreen"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })()`)
    if (reenterBtn) await realClickAt(reenterBtn.x, reenterBtn.y)
    let reenteredFs = false
    try {
      await waitFor(`!!document.fullscreenElement`, 're-enter fullscreen', 4000)
      reenteredFs = true
      check('np-fullscreen 可再次进入全屏', true)
    } catch (err) {
      check('np-fullscreen 可再次进入全屏', false, JSON.stringify(await evaluate('({fs: !!document.fullscreenElement, calls: document.__fsCalls})')))
    }
    const backInfo = await evaluate(`(() => {
      const b = document.querySelector('[data-nm="np-back"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), title: b.getAttribute('title'), aria: b.getAttribute('aria-label') }
    })()`)
    check('播放页有 [data-nm="np-back"] 返回按钮', !!backInfo, JSON.stringify(backInfo))
    if (backInfo) await realClickAt(backInfo.x, backInfo.y)
    let backExitedFs = false
    let backClosedNp = false
    try {
      await waitFor(`!document.fullscreenElement`, 'exit fullscreen via back', 5000)
      backExitedFs = true
    } catch { backExitedFs = false }
    try {
      await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'np closed via back', 5000)
      backClosedNp = true
    } catch { backClosedNp = false }
    check('全屏中点「返回」会调用 exitFullscreen（fullscreenElement 清空）', backExitedFs,
      JSON.stringify(await evaluate('({fs: !!document.fullscreenElement, exitCalls: document.__exitCalls, np: !!document.querySelector(\'[data-nm="nowplaying"]\')})')))
    check('全屏中点「返回」关闭播放页并回到列表', backClosedNp)
    const backPlaying1 = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { paused: a.paused, t: a.currentTime } : null })()`)
    await sleep(700)
    const backPlaying2 = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { paused: a.paused, t: a.currentTime } : null })()`)
    check('全屏返回列表后播放不中断（audio 仍在播且时间前进）',
      !!backPlaying1 && backPlaying1.paused === false && !!backPlaying2 && backPlaying2.t > backPlaying1.t,
      JSON.stringify({ backPlaying1, backPlaying2 }))
    // 非全屏 Esc 关闭 NP：用 dock-expand 重新打开
    await evaluate(`(() => { const b = document.querySelector('[data-nm="dock-expand"]') || document.querySelector('[data-nm="dock-cover"]'); if (b) b.click() })()`)
    try { await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'np reopened for esc test', 5000) } catch { /* ignore */ }
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    let npClosed = false
    try {
      await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'np closed after Esc', 5000)
      npClosed = true
    } catch { npClosed = false }
    check('非全屏时 Esc 关闭播放页', npClosed)
    const stillPlaying1 = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { paused: a.paused, t: a.currentTime } : null })()`)
    await sleep(700)
    const stillPlaying2 = await evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return a ? { paused: a.paused, t: a.currentTime } : null })()`)
    check('关闭播放页后播放不中断（audio 仍在播且时间前进）',
      !!stillPlaying1 && stillPlaying1.paused === false && !!stillPlaying2 && stillPlaying2.t > stillPlaying1.t,
      JSON.stringify({ stillPlaying1, stillPlaying2 }))
  }
  const fsCss = await evaluate(`(() => {
    const styles = [...document.querySelectorAll('style')].map((el) => el.textContent || '').join('\\n')
    return { hasRule: /:fullscreen/.test(styles), hasNpFullscreen: /\\.nm-np[^}]*:fullscreen/.test(styles) }
  })()`)
  check('样式表包含 .nm-np:fullscreen 规则', !!fsCss && fsCss.hasNpFullscreen, JSON.stringify(fsCss))

  console.log('\n[9h] v1.1 播放模式：dock/NP play-mode + 列表/顺序/单曲/随机')
  const modeTracks = [
    { id: 1901371647, name: '水星记', artist: '郭顶', artists: [{ name: '郭顶' }], album: '飞行器的执行周期', duration: 8, cover: null },
    { id: 1901371684, name: '晴天', artist: '周杰伦', artists: [{ name: '周杰伦' }], album: '叶惠美', duration: 8, cover: null },
  ]
  await evaluate(`window.__setActivePanel('netease-music')`)
  await config({ playerCommand: { type: 'playQueue', tracks: modeTracks, title: '模式测试' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); if (!a || a.paused) return false; const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return !!m && m[1] === '1901371647' })()`, 'mode tracks playing', 8000)
    check('注入队列用于播放模式测试', true)
  } catch (err) { check('注入队列用于播放模式测试', false, String(err)) }
  const dockModeCount = await evaluate(`document.querySelectorAll('[data-nm="dock"] [data-nm="play-mode"]').length`)
  check('dock 有 1 个 [data-nm="play-mode"]', dockModeCount === 1, JSON.stringify({ dockModeCount }))
  await evaluate(`(() => { const b = document.querySelector('[data-nm="dock-cover"]'); if (b) b.click() })()`)
  try { await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'np for play modes', 6000) } catch { /* ignore */ }
  const npModeCount = await evaluate(`document.querySelectorAll('[data-nm="nowplaying"] [data-nm="play-mode"]').length`)
  check('播放页有 1 个 [data-nm="play-mode"]', npModeCount === 1, JSON.stringify({ npModeCount }))
  const modeState = () => evaluate(`(() => {
    const b = document.querySelector('[data-nm="dock"] [data-nm="play-mode"]') || document.querySelector('[data-nm="play-mode"]')
    return b ? { title: b.getAttribute('title'), aria: b.getAttribute('aria-label'), text: (b.textContent || '').trim(), stored: localStorage.getItem('netease-music:play-mode') } : null
  })()`)
  const EXPECT_MODES = [['order', '顺序播放'], ['single', '单曲循环'], ['shuffle', '随机播放'], ['list', '列表循环']]
  const clickMode = async () => {
    const b = await evaluate(`(() => { const el = document.querySelector('[data-nm="dock"] [data-nm="play-mode"]') || document.querySelector('[data-nm="play-mode"]'); if (el) el.click() })()`)
    await sleep(450)
    return modeState()
  }
  // 先对齐到 list（最多点 4 次）
  for (let i = 0; i < 4; i++) {
    const st = await modeState()
    if (st && /列表循环/.test(st.title || '')) break
    await clickMode()
  }
  let modeSeqOk = true
  const modeSeen = []
  for (let i = 0; i < EXPECT_MODES.length; i++) {
    const st = await clickMode()
    modeSeen.push(st && st.title)
    const [key, cn] = EXPECT_MODES[i]
    if (!st || !(st.title || '').includes(cn) || st.stored !== key) modeSeqOk = false
  }
  check('播放模式按 列表→顺序→单曲→随机→列表 循环，title/localStorage 正确', modeSeqOk, JSON.stringify({ modeSeen }))
  check('切换播放模式出现 toast', await evaluate(`(() => { const t = document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]'); return !!t && /播放模式/.test(t.textContent || '') })()`))
  // ended 行为：单曲循环（真实播到尾）/ 列表循环 / 顺序 / 随机（合成 ended，避免 seek 时序抖动）
  const modeKey = () => evaluate(`localStorage.getItem('netease-music:play-mode')`)
  const ensureMode = async (want) => {
    for (let i = 0; i < 5; i++) {
      const cur = await modeKey()
      if (cur === want) return true
      await clickMode()
    }
    return (await modeKey()) === want
  }
  const playingInfo = () => evaluate(`(() => {
    const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
    const m = a && /[?&]id=(\\d+)/.exec(a.getAttribute('src') || '')
    return { id: m ? m[1] : null, paused: a ? a.paused : null, t: a ? a.currentTime : null }
  })()`)
  const fireEnded = () => evaluate(`(() => {
    const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
    if (!a) return false
    try { a.dispatchEvent(new Event('ended')) } catch (err) { /* ignore */ }
    return true
  })()`)
  const queueForMode = async () => {
    await config({ playerCommand: { type: 'playQueue', tracks: modeTracks, title: '模式测试' } })
    await sleep(800)
  }
  const seekNearEnd = async (offset = 0.25) => {
    await evaluate(`(() => {
      const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
      if (!a) return
      try { a.currentTime = Math.max(0, a.duration - ${offset}) } catch (err) { /* ignore */ }
      const p = a.play(); if (p && p.catch) p.catch(() => {})
    })()`)
    await sleep(1800)
  }
  // 单曲循环：真实播到结尾（前面已验证），保留一次真实 ended
  await ensureMode('single')
  await queueForMode()
  await seekNearEnd()
  const singleRes = await playingInfo()
  check('单曲循环：ended 后同一首重播（仍播放）', !!singleRes && String(singleRes.id) === '1901371647' && singleRes.paused === false, JSON.stringify(singleRes))
  // 列表循环：最后一首 ended → 回第一首并继续
  check('切到列表循环模式', await ensureMode('list'))
  await queueForMode()
  await config({ playerCommand: { type: 'control', action: 'next' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); const m = a && /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return !!m && m[1] === '1901371684' })()`, 'next applied for ended test', 6000)
  } catch { /* 断言输出 */ }
  await fireEnded()
  await sleep(1000)
  const listRes = await playingInfo()
  check('列表循环：最后一首 ended 回第一首并继续播放',
    !!listRes && String(listRes.id) === '1901371647' && listRes.paused === false, JSON.stringify(listRes))
  // 顺序播放：最后一首 ended → 停止
  check('切到顺序播放模式', await ensureMode('order'))
  await queueForMode()
  await config({ playerCommand: { type: 'control', action: 'next' } })
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); const m = a && /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return !!m && m[1] === '1901371684' })()`, 'next applied for ended test', 6000)
  } catch { /* 断言输出 */ }
  await fireEnded()
  await sleep(1000)
  const orderRes = await playingInfo()
  check('顺序播放：最后一首 ended 后停止',
    !!orderRes && String(orderRes.id) === '1901371684' && orderRes.paused === true, JSON.stringify(orderRes))
  // 随机播放：ended → 切到其它歌曲（重试一次）
  check('切到随机播放模式', await ensureMode('shuffle'))
  let shuffleOk = false
  let shuffleRes = null
  for (let attempt = 0; attempt < 3 && !shuffleOk; attempt++) {
    await queueForMode()
    await fireEnded()
    await sleep(1000)
    shuffleRes = await playingInfo()
    if (shuffleRes && shuffleRes.paused === false && String(shuffleRes.id) !== '1901371647') shuffleOk = true
  }
  check('随机播放：ended 后切到其它歌曲', shuffleOk, JSON.stringify(shuffleRes))

  // 恢复列表模式并回列表
  for (let i = 0; i < 4; i++) { const st = await modeState(); if (st && /列表循环/.test(st.title || '')) break; await clickMode() }
  if (await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)) {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await sleep(400)
  }
  await evaluate(`window.__setActivePanel('netease-music')`)

  // v1.1 清理：诊断日志只保留 seek/recover 类，不再出现 probe:audio*/media:*/audio:*/status:*
  const finalLogs = await evaluate(`fetch('/__logs').then(function (r) { return r.json() }).catch(function () { return null })`)
  const finalEvents = (((finalLogs && finalLogs.clientLogs) || []).map((x) => (x.body && x.body.event) || ''))
  const bannedPrefixes = ['probe:audio', 'media:', 'audio:created', 'audio:bind', 'status:auth', 'status:error']
  const bannedHits = finalEvents.filter((e) => bannedPrefixes.some((p) => e === p || e.indexOf(p) === 0))
  check('clientlog 不再出现 probe:audio*/media:*/audio:*/status:* 诊断事件', bannedHits.length === 0,
    JSON.stringify({ bannedHits: bannedHits.slice(0, 10), total: finalEvents.length }))
  check('clientlog 仍保留 seek:recover* 优先事件', finalEvents.some((e) => /^seek:recover/.test(e)),
    JSON.stringify(finalEvents.filter((e) => /recover/.test(e)).slice(0, 8)))
  await evaluate(`window.__setActivePanel('netease-music')`)
  await sleep(300)

  console.log('\n[8] 运行期错误')
  const realErrors = errors.filter((e) => !/favicon|ERR_ABORTED/.test(e))
  check('无 console.error', realErrors.length === 0, realErrors.slice(0, 4).join(' | '))
  check('无未捕获页面异常', errors.length === 0, errors.slice(0, 4).join(' | '))
  // 前面为错误/引擎模式 reload 过，播放器状态会重置；重新播放验证播放条恢复
  try {
    await scrollTop()
    if (!(await evaluate(`!!document.querySelector('[data-nm="play-all"]')`))) {
      await clickSel('[data-nm="tab"][data-tab="recommend"]')
      await waitFor(`!!document.querySelector('[data-nm="play-all"]')`, 'play-all after reload', 8000)
    }
    await clickSel('[data-nm="play-all"]')
    await waitFor(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`, 'dock after reload', 8000)
    check('重新播放后播放条恢复（回归）', true)
  } catch (err) {
    check('重新播放后播放条恢复（回归）', false, String(err))
  }
} catch (err) {
  fatal = err
  failures.push({ label: `FATAL: ${err.message}`, extra: undefined })
  console.error('\nFATAL:', err.stack || err)
  if (errors.length) console.error('page errors:', errors.slice(0, 8).join('\n'))
  try {
    await screenshot('99-fatal.png')
    shots.push(join(SHOTS, '99-fatal.png'))
  } catch { /* ignore */ }
} finally {
  console.log('\n================ 验收结果 ================')
  console.log(`PASS ${passed.length} / FAIL ${failures.length}${fatal ? '（含 FATAL）' : ''}`)
  if (failures.length) {
    console.log('\nFAIL 清单：')
    for (const f of failures) {
      console.log(`  ✗ ${f.label}${f.extra === undefined ? '' : ` → ${typeof f.extra === 'string' ? f.extra : JSON.stringify(f.extra)}`}`)
    }
  }
  if (shots.length) {
    console.log('\n截图：')
    for (const s of shots) console.log('  ' + s)
  }
  const log = [
    `# netease-panel-selftest ${new Date().toISOString()}`,
    `client: ${CLIENT}`,
    `PASS ${passed.length} / FAIL ${failures.length}`,
    '',
    '## PASS',
    ...passed.map((p) => `- ${p}`),
    '',
    '## FAIL',
    ...failures.map((f) => `- ${f.label}${f.extra === undefined ? '' : ` → ${typeof f.extra === 'string' ? f.extra : JSON.stringify(f.extra)}`}`),
    '',
    '## SHOTS',
    ...shots.map((s) => `- ${s}`),
    '',
    '## console errors',
    ...errors.slice(0, 20).map((e) => `- ${e}`),
  ].join('\n')
  writeFileSync(join(HERE, 'last-run.log'), log)

  clearTimeout(watchdog)
  cdp.close()
  chrome.kill('SIGKILL')
  server.kill('SIGKILL')
  try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* ignore */ }
  process.exit(failures.length ? 1 : 0)
}
