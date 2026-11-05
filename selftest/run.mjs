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
    const box = root || document.querySelector('[data-nm="player"]')
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
  check('shell.overlay slot 注册成功', await evaluate('!!window.__slots["shell.overlay"]'))
  const specs = await evaluate('window.__slotSpecs')
  check('main spec.key = netease-music', specs?.main?.key === 'netease-music', JSON.stringify(specs?.main))
  check('sidebar.panellist spec.id = netease-music', specs?.['sidebar.panellist']?.id === 'netease-music',
    JSON.stringify(specs?.['sidebar.panellist']))
  check('shell.overlay spec.id = netease-music-player', specs?.['shell.overlay']?.id === 'netease-music-player',
    JSON.stringify(specs?.['shell.overlay']))
  check('sidebar.panellist spec.order = 30', specs?.['sidebar.panellist']?.order === 30,
    JSON.stringify(specs?.['sidebar.panellist']))
  check('无当前曲目时播放条不渲染（无占位）', !(await evaluate(`!!document.querySelector('[data-nm="player"]')`)))
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
  check('PlayerDock 是 React 组件', await evaluate(`typeof window.__slots['shell.overlay'] === 'function'`))
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

  console.log('\n[3] 播放：播放全部 → 播放条出现 → 播放中 → 进度前进 → 下一首 → 暂停')
  check('点击「播放全部」', await clickSel('[data-nm="play-all"]'))
  try {
    await waitFor(`!!document.querySelector('[data-nm="player"]')`, 'player dock', 8000)
    check('播放条 data-nm="player" 出现', true)
  } catch (err) {
    check('播放条 data-nm="player" 出现', false, '点击播放全部后 8s 内无播放条')
    throw err
  }
  try {
    await waitFor(`(() => {
      const el = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="player"]')
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
      const el = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="player"]')
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
      const el = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="player"]')
      return el && el.getAttribute('data-playing') === 'true'
    })()`, 'play by row click', 8000)
    check('曲目行点击后恢复播放（播放整列表）', true, `before=${(beforeRow || '').slice(0, 24)}`)
  } catch (err) {
    check('曲目行点击后恢复播放（播放整列表）', false, `data-playing=${await playerState()}`)
  }
  // v2：点曲目行会进入全屏播放页；退出后再继续后续场景
  if (await evaluate(`!!document.querySelector('[data-nm="nowplaying"]')`)) {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    try {
      await waitFor(`!document.querySelector('[data-nm="nowplaying"]')`, 'exit nowplaying after row click', 6000)
      check('播放页 Esc 返回列表（v2）', true)
    } catch {
      check('播放页 Esc 返回列表（v2）', false, 'Escape 后播放页仍在')
      if (await evaluate(`!!document.querySelector('[data-nm="np-back"]')`)) await clickSel('[data-nm="np-back"]')
      await sleep(400)
    }
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

  console.log('\n[9] v2：shell.bottom 停靠 / 全屏播放页 / 黑胶 / 歌词 / 音质 / logo')
  await setTheme('dark')
  await setViewport(1440, 980)
  await sleep(300)
  if (await evaluate(`!!document.querySelector('[data-nm="tab"][data-tab="recommend"]')`)) {
    await clickSel('[data-nm="tab"][data-tab="recommend"]')
    await sleep(250)
  }
  if (!(await playerVisible())) {
    if (await clickSel('[data-nm="play-all"]')) {
      try { await waitFor(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`, 'dock after play-all', 8000) } catch { /* 下面断言暴露 */ }
    }
  }
  await sleep(600)
  const dockLayout = await evaluate(`(() => {
    const dock = document.querySelector('[data-nm="dock"]') || document.querySelector('[data-nm="player"]')
    const bottom = document.querySelector('#bottom-root')
    const rootEl = document.querySelector('#root')
    const composer = document.querySelector('#composer')
    const bodyEl = document.querySelector('#body')
    const appEl = document.querySelector('#app')
    const dockRect = dock ? dock.getBoundingClientRect() : null
    const composerRect = composer ? composer.getBoundingClientRect() : null
    const bodyRect = bodyEl ? bodyEl.getBoundingClientRect() : null
    return {
      dockFound: !!dock,
      dataDock: dock ? dock.getAttribute('data-dock') : null,
      inBottomSlot: !!(bottom && dock && bottom.contains(dock)),
      slotRender: window.__slotRender || null,
      bottomH: bottom ? bottom.offsetHeight : -1,
      composerH: composer ? composer.offsetHeight : -1,
      rootH: rootEl ? rootEl.clientHeight : -1,
      bodyH: bodyEl ? bodyEl.clientHeight : -1,
      appH: appEl ? appEl.clientHeight : -1,
      dockTop: dockRect ? Math.round(dockRect.top) : -1,
      dockBottom: dockRect ? Math.round(dockRect.bottom) : -1,
      composerBottom: composerRect ? Math.round(composerRect.bottom) : -1,
      bodyBottom: bodyRect ? Math.round(bodyRect.bottom) : -1,
    }
  })()`)
  check('dock 注册在 shell.bottom 槽', !!dockLayout.slotRender && dockLayout.slotRender.bottom === true && dockLayout.inBottomSlot, JSON.stringify(dockLayout))
  check('dock 根 data-nm="dock" 且 data-dock="bottom"',
    dockLayout.dockFound && dockLayout.dataDock === 'bottom', JSON.stringify(dockLayout))
  check('底部停靠不遮挡输入框（dock.top ≥ composer.bottom-1）',
    dockLayout.dockTop >= dockLayout.composerBottom - 1, JSON.stringify(dockLayout))
  check('shell.bottom 占位压缩主区高度（dock 独占一行，主区 = body - dock）',
    Math.abs(dockLayout.rootH + dockLayout.composerH - dockLayout.bodyH) <= 2 &&
    Math.abs(dockLayout.bodyH + dockLayout.bottomH - dockLayout.appH) <= 2, JSON.stringify(dockLayout))
  await S('16-dock-bottom.png')

  // 点曲目行 → 全屏播放页
  await scrollTop()
  const npEntry = await clickSel('[data-nm="section"][data-section="daily"] [data-nm="track"]')
  check('点曲目行', npEntry)
  let npReady = false
  try {
    await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying', 8000)
    npReady = true
    check('播放页 [data-nm="nowplaying"] 出现', true)
  } catch (err) {
    check('播放页 [data-nm="nowplaying"] 出现', false, '点曲目行后 8s 内未出现（v2 播放页可能未实现/未落盘）')
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
      await S('13-nowplaying-vinyl-dark.png')
      check('播放页暂停', await clickSel('[data-nm="player-toggle"]'))
      try {
        await waitFor(`(() => {
          const st = document.querySelector('[data-nm="player-state"]') || document.querySelector('[data-nm="dock"][data-playing]')
          return !!st && st.getAttribute('data-playing') === 'false'
        })()`, 'paused in nowplaying', 6000)
      } catch { /* 下面黑胶断言会暴露 */ }
      await sleep(350)
      const v1 = await evaluate(`(() => { const el = document.querySelector('[data-nm="np-vinyl"]'); return el ? { spinning: el.classList.contains('is-spinning') } : null })()`)
      check('暂停后黑胶不再旋转（无 is-spinning）', !!v1 && !v1.spinning, JSON.stringify(v1))
      check('播放页恢复播放', await clickSel('[data-nm="player-toggle"]'))
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
    } catch (err) {
      check('返回后播放页消失', false, String(err))
    }
    check('点 dock 封面 [data-nm="dock-cover"]', await clickSel('[data-nm="dock-cover"]'))
    try {
      await waitFor(`!!document.querySelector('[data-nm="nowplaying"]')`, 'nowplaying from dock cover', 6000)
      check('点 dock 封面进入播放页', true)
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

  console.log('\n[9b] shell.bottom 冲突时回退 shell.overlay（契约 §10.3）')
  await cdp.send('Page.navigate', { url: BASE + '/?shellBottom=throw' })
  await waitFor('document.readyState === "complete"', 'fallback page ready', 15000)
  await waitFor('window.__mounted === true || window.__mountError', 'fallback mount', 15000)
  const fallbackMount = await evaluate(`({ mountError: window.__mountError, mode: window.__shellBottomMode, slotRender: window.__slotRender })`)
  check('模拟 shell.bottom 冲突后页面正常挂载', !fallbackMount.mountError, JSON.stringify(fallbackMount))
  check('shell.bottom 冲突时回退注册 shell.overlay',
    !!fallbackMount.slotRender && fallbackMount.slotRender.overlay === true && fallbackMount.slotRender.bottom === false,
    JSON.stringify(fallbackMount))
  try {
    await waitFor(`!!document.querySelector('[data-nm="play-all"]')`, 'fallback play-all', 10000)
    await clickSel('[data-nm="play-all"]')
    await waitFor(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`, 'fallback dock', 8000)
    await sleep(500)
    const fb = await evaluate(`(() => {
      const dock = document.querySelector('[data-nm="dock"]') || document.querySelector('[data-nm="player"]')
      const overlay = document.querySelector('#overlay-root')
      const rootEl = document.querySelector('#root')
      const bodyEl = document.querySelector('#body')
      const composerEl = document.querySelector('#composer')
      return {
        dataDock: dock ? dock.getAttribute('data-dock') : null,
        inOverlay: !!(overlay && dock && overlay.contains(dock)),
        rootH: rootEl ? rootEl.clientHeight : -1,
        bodyH: bodyEl ? bodyEl.clientHeight : -1,
        composerH: composerEl ? composerEl.offsetHeight : -1,
      }
    })()`)
    check('回退播放条 data-dock="float"', fb.dataDock === 'float', JSON.stringify(fb))
    check('回退播放条渲染在 shell.overlay 根（不压缩主区）',
      fb.inOverlay && Math.abs(fb.rootH + fb.composerH - fb.bodyH) <= 2, JSON.stringify(fb))
    await screenshot('18-dock-fallback-float.png')
    shots.push(join(SHOTS, '18-dock-fallback-float.png'))
  } catch (err) {
    check('回退播放条 data-dock="float"', false, String(err))
  }

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
    await waitFor(`!!document.querySelector('[data-nm="player"]')`, 'player after reload', 8000)
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
