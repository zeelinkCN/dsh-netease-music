#!/usr/bin/env node
/**
 * player-regression.mjs — 审查「中危」客户端边界回归（task-17）
 * 真实 Chrome + 真 React + 真 client.js + mock server，覆盖：
 *  quality→pause/seek/连切、seek-recovery 旧 timer、mute 重建、useStatus fallback、
 *  logout 接口失败、换账号时 like 陈旧回写。
 * 用法：node player-regression.mjs
 * 退出码：0 全绿；1 有 FAIL；2 client 缺失；3 无 Chrome。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(HERE, 'tmp')
const SHOTS = join(HERE, 'shots')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const NODE = process.execPath
const CLIENT = process.env.NM_CLIENT ? resolve(process.env.NM_CLIENT) : join(HERE, '..', 'client.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(TMP, { recursive: true }); mkdirSync(SHOTS, { recursive: true })

const passed = []
const failed = []
function check(label, ok, extra) {
  if (ok) { passed.push(label); console.log(`  ✓ ${label}${extra === undefined ? '' : ` (${extra})`}`) }
  else { failed.push({ label, extra }); console.log(`  ✗ ${label}${extra === undefined ? '' : ` → ${extra}`}`) }
}
if (!existsSync(CLIENT)) { console.error('client.js 不存在: ' + CLIENT); process.exit(2) }
if (!existsSync(CHROME)) { console.error('找不到 Chrome'); process.exit(3) }
console.log(`[regression] client=${CLIENT}`)

const server = spawn(NODE, [join(HERE, 'server.mjs')], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, NM_CLIENT: CLIENT } })
const port = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('mock server timeout')), 10000)
  server.stdout.on('data', (b) => { const m = /\{"port":(\d+)/.exec(b.toString()); if (m) { clearTimeout(timer); res(Number(m[1])) } })
})
const BASE = `http://127.0.0.1:${port}`
async function config(patch) {
  return (await fetch(`${BASE}/__config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })).json()
}
const calls = async () => (await fetch(`${BASE}/__calls`)).json()

const profileDir = join(TMP, 'regression-chrome-profile')
try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* ignore */ }
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-crash-reporter',
  '--disable-breakpad', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1440,980', '--remote-debugging-port=0',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion', `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeErr = ''
chrome.stderr.on('data', (b) => { chromeErr += b.toString() })
const devtoolsFile = join(profileDir, 'DevToolsActivePort')
const debugPort = await (async () => {
  for (let i = 0; i < 150; i++) { if (existsSync(devtoolsFile)) { const line = readFileSync(devtoolsFile, 'utf8').split('\n')[0].trim(); if (line) return Number(line) } await sleep(100) }
  throw new Error('DevToolsActivePort timeout\n' + chromeErr.slice(-500))
})()
let pageWs = null
for (let i = 0; i < 80 && !pageWs; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); const page = list.find((t) => t.type === 'page'); if (page?.webSocketDebuggerUrl) pageWs = page.webSocketDebuggerUrl } catch { /* retry */ }
  if (!pageWs) await sleep(100)
}
if (!pageWs) throw new Error('no page target')

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map() }
  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((res, rej) => { this.ws.addEventListener('open', res, { once: true }); this.ws.addEventListener('error', rej, { once: true }) })
    this.ws.addEventListener('close', () => { for (const p of this.pending.values()) p.reject(new Error('CDP closed')); this.pending.clear() })
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); return }
      if (msg.method) for (const fn of this.listeners.get(msg.method) || []) fn(msg.params)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout ' + method)) }, 20000)
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v) }, reject: (e) => { clearTimeout(t); reject(e) } })
    })
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn) }
}
const cdp = new CDP(pageWs)
await cdp.connect()
const pageErrors = []
cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push((p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || 'exception').slice(0, 300)))
cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') pageErrors.push((p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)) })
await cdp.send('Page.enable'); await cdp.send('Runtime.enable')

async function evaluate(expression) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.exceptionDetails) throw new Error(`eval failed: ${expression.slice(0, 160)}\n${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ''}`)
  return res.result.value
}
async function waitFor(expression, label, timeout = 10000) {
  const start = Date.now(); let last
  while (Date.now() - start < timeout) {
    try { last = await evaluate(expression); if (last) return last } catch (err) { last = String(err) }
    await sleep(80)
  }
  throw new Error(`waitFor timeout: ${label}; last=${JSON.stringify(last)}`)
}
async function setViewport(w, h) { await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }) }
async function navigate() { await cdp.send('Page.navigate', { url: BASE + '/' }); await waitFor('document.readyState === "complete"', 'ready') }
async function reload() { await cdp.send('Page.reload', { ignoreCache: true }); await waitFor('document.readyState === "complete"', 'reload ready') }
const clickSel = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; try { el.scrollIntoView({ block: 'center' }) } catch (_) {} el.click(); return true })()`)
const visible = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' })()`)
const audioState = () => evaluate(`(() => {
  const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
  if (!a) return null
  return { paused: a.paused, t: a.currentTime, dur: a.duration, muted: a.muted, volume: a.volume, src: a.getAttribute('src') || '' }
})()`)
const audioTrackId = () => evaluate(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); if (!a) return null; const m = /[?&]id=(\\d+)/.exec(a.getAttribute('src') || ''); return m ? m[1] : null })()`)
const playerVisible = () => evaluate(`!!document.querySelector('[data-nm="dock"], [data-nm="player"]')`)
const bodyText = () => evaluate(`document.body.textContent || ''`)
async function ensurePanel() {
  await evaluate(`window.__setActivePanel('netease-music')`)
  await sleep(350)
}
async function ensurePaused() {
  const a = await audioState()
  if (a && a.paused === false) { await clickSel('[data-nm="player-toggle"]'); await sleep(450) }
}
async function ensurePlaying() {
  await ensurePanel()
  await evaluate(`(() => { const r = document.querySelector('[data-nm="root"]'); if (r) r.scrollTo(0, 0); window.scrollTo(0, 0) })()`)
  if (!(await playerVisible())) {
    for (let i = 0; i < 20; i++) { if (await evaluate(`!!document.querySelector('[data-nm="play-all"]')`)) break; await sleep(150) }
    await clickSel('[data-nm="play-all"]')
    try { await waitFor(`!!document.querySelector('[data-nm="dock"]')`, 'dock', 8000) } catch { /* 断言输出 */ }
  }
  try { await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && !a.paused })()`, 'playing', 8000) } catch { /* 断言输出 */ }
}
async function freshPage(extra = {}) {
  await config(Object.assign({ authed: true, bridge: 'ready', errorMode: null, statusError: null, authError: false, logoutError: false, likeDelayMs: 0, likeForceLiked: null, slowAudioMs: 0, slowSeekMs: 0, modeError: null, likeError: null, engine: 'installed', installError: false, authPending: false, statusDelayMs: 0, statusSequence: null, statusPendingOnce: false, statusPendingForMs: 0, statusPendingUntil: 0, statusPlan: null, resetLikes: false }, extra))
  await navigate()
  await waitFor('window.__mounted === true || window.__mountError', 'mount', 15000)
  await ensurePanel()
  try { await waitFor(`document.querySelectorAll('[data-nm="track"]').length >= 5`, 'rows', 12000) } catch { /* 断言输出 */ }
}
function dispatchPointerEval(type, frac) {
  const buttons = type === 'pointerup' ? 0 : 1
  return evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
    if (!slider) return null
    const r = slider.getBoundingClientRect()
    const x = r.left + r.width * ${frac}
    const y = r.top + Math.min(r.height / 2, 11)
    slider.dispatchEvent(new PointerEvent('${type}', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: ${buttons} }))
    return { x: Math.round(x), y: Math.round(y) }
  })()`)
}
async function openQuality() {
  const ok = await clickSel('[data-nm="dock-quality"]')
  await sleep(250)
  return ok
}
async function pickQuality(level) {
  return evaluate(`(() => {
    const opts = [...document.querySelectorAll('[data-nm="quality-option"]')]
    const el = opts.find((x) => x.getAttribute('data-level') === ${JSON.stringify(level)}) || opts[0]
    if (!el) return false
    el.click(); return true
  })()`)
}
const muteButton = () => evaluate(`(() => {
  const box = document.querySelector('[data-nm="dock"] .nm-dock-volume') || document.querySelector('.nm-dock-volume')
  const btn = box ? box.querySelector('button') : null
  if (!btn) return null
  const r = btn.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), title: btn.getAttribute('title') }
})()`)

let fatal = null
try {
  /* A. 切音质 → 暂停 → metadata 不得恢复播放 */
  console.log('\n[1] quality→pause→metadata 保持暂停')
  await freshPage()
  await ensurePlaying()
  await config({ slowAudioMs: 1800 })
  await openQuality()
  const pickedPause = await pickQuality('lossless')
  await sleep(150)
  const delayedMeta = await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return a ? { readyState:a.readyState, dur:Number(a.duration) } : null })()`)
  check('setup：切音质时新 metadata 尚未就绪（readyState=0）', !!delayedMeta && (delayedMeta.readyState === 0 || !Number.isFinite(delayedMeta.dur) || delayedMeta.dur <= 0), JSON.stringify(delayedMeta))
  await clickSel('[data-nm="player-toggle"]')
  await sleep(3000)
  const qp = await audioState()
  check('切音质后立即暂停：metadata 到达后仍保持暂停', !!qp && qp.paused === true, JSON.stringify(qp))
  check('暂停状态同步到 dock（data-playing=false）',
    (await evaluate(`(() => { const el = document.querySelector('[data-nm="dock"][data-playing]') || document.querySelector('[data-nm="player-state"]'); return el ? el.getAttribute('data-playing') : null })()`)) === 'false')
  await config({ slowAudioMs: 0 })

  /* B. 切音质 → seek 90% → metadata 保留新 seek */
  console.log('\n[2] quality→seek90→metadata 保留新 seek')
  await freshPage()
  await ensurePlaying()
  await config({ slowAudioMs: 1800 })
  await openQuality()
  await pickQuality('hires')
  await sleep(120)
  // 用真实指针序列提交 80% seek；若指针事件被 loading 吞掉，再用键盘 End 兜底（记录诊断）
  await dispatchPointerEval('pointerdown', 0.8)
  await sleep(60)
  await dispatchPointerEval('pointerup', 0.8)
  await sleep(180)
  let seekDiag = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
    const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio')
    return { aria: slider ? slider.getAttribute('aria-valuenow') : null, seeking: root ? root.getAttribute('data-seeking') : null, ready: a ? a.readyState : null, dur: a ? String(a.duration) : null, src: a ? (a.getAttribute('src') || '') : '' }
  })()`)
  if (!seekDiag || Number(seekDiag.aria) < 50) {
    await evaluate(`(() => {
      const root = document.querySelector('[data-nm="player-progress"]')
      const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
      if (slider) { slider.focus(); slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })) }
    })()`)
    await sleep(200)
  }
  const seekDiag2 = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    const slider = root ? (root.matches('[role="slider"]') ? root : root.querySelector('[role="slider"]')) : null
    return { aria: slider ? slider.getAttribute('aria-valuenow') : null, seeking: root ? root.getAttribute('data-seeking') : null, src: (document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'))?.getAttribute('src') || '' }
  })()`)
  console.log('  · seek diag ' + JSON.stringify({ seekDiag, seekDiag2 }))
  // metadata 到达后立即采样（不 pause：同时验证 playing 意图恢复；8s 测试音频离结尾还有余量）
  try { await waitFor(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return !!a && Number.isFinite(a.duration) && a.duration > 0 })()`, 'hires metadata', 7000) } catch { /* 断言输出 */ }
  await sleep(250)
  const qs = await audioState()
  check('切音质期间 seek 80%：metadata 后 currentTime ≥70% 且恢复播放意图（paused=false）',
    !!qs && Number.isFinite(qs.dur) && qs.dur > 0 && qs.t >= qs.dur * 0.7 && qs.paused === false,
    JSON.stringify(qs && { t: qs.t, dur: qs.dur }))
  await config({ slowAudioMs: 0 })

  /* B2. 旧 audio 元素的 loadedmetadata 不得消费新 quality 的 pendingResume */
  console.log('\n[2b] stale metadata：旧 audio 元素不消费新 quality pendingResume')
  await freshPage()
  await ensurePlaying()
  // 先播到 ~2.5s，便于区分“旧目标”和 0
  await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); if(a) a.currentTime=2.4 })()`)
  await sleep(500)
  const staleTarget = await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return a ? a.currentTime : 0 })()`)
  await config({ slowAudioMs: 1800 })
  await openQuality()
  await pickQuality('lossless')
  await sleep(150)
  const oldA = await evaluate(`(() => {
    const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio')
    window.__staleAudioA = a
    return a ? { src: a.getAttribute('src') || '', inDom: a.isConnected } : null
  })()`)
  await openQuality()
  await pickQuality('hires')
  await sleep(150)
  const bInfo = await evaluate(`(() => {
    const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio')
    return a ? { src: a.getAttribute('src') || '', same: a === window.__staleAudioA, count: document.querySelectorAll('audio[data-nm-audio]').length } : null
  })()`)
  check('换 quality 后 audio 元素已替换（old A != new B）',
    !!bInfo && bInfo.same === false && bInfo.count === 1 && /level=hires/.test(bInfo.src || ''), JSON.stringify({ oldA, bInfo }))
  // 对已被移除的旧 A 元素 dispatch loadedmetadata
  await evaluate(`(() => { const a=window.__staleAudioA; if (a) a.dispatchEvent(new Event('loadedmetadata')) })()`)
  await sleep(120)
  const afterStale = await evaluate(`(() => {
    const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio')
    return a ? { t: a.currentTime, paused: a.paused, src: a.getAttribute('src') || '', level: /level=([a-z]+)/.exec(a.getAttribute('src')||'')?.[1] || null } : null
  })()`)
  await sleep(250)
  const afterStale2 = await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return a ? { t: a.currentTime } : null })()`)
  check('旧 A 的 loadedmetadata 不会 seek/播放新 B（B 仍等自己的 metadata）',
    !!afterStale && afterStale.t < Math.max(1, staleTarget - 1) && !/level=lossless/.test(afterStale.src || ''),
    JSON.stringify({ staleTarget, afterStale, afterStale2 }))
  try {
    await waitFor(`(() => {
      const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio')
      if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return false
      return Math.abs(a.currentTime - ${JSON.stringify('__TARGET__')}) < 1.5
    })()`.replace('__TARGET__', String(staleTarget)), 'B metadata restores target', 9000)
    check('B 自己的 metadata 到达后才恢复 target（≈切换时位置）', true)
  } catch (err) {
    const st = await audioState()
    check('B 自己的 metadata 到达后才恢复 target（≈切换时位置）', false, JSON.stringify({ staleTarget, st }))
  }
  const bFinal = await audioState()
  check('stale metadata 后 B 仍正常播放并保持 hires', !!bFinal && bFinal.paused === false && /level=hires/.test(bFinal.src || ''),
    JSON.stringify({ t: bFinal && bFinal.t, paused: bFinal && bFinal.paused, src: bFinal && bFinal.src }))
  const oldADead = await evaluate(`(() => { const a=window.__staleAudioA; return a ? { connected: a.isConnected, paused: a.paused } : null })()`)
  check('旧 A 元素已移除/暂停', !!oldADead && oldADead.connected === false && oldADead.paused !== false, JSON.stringify(oldADead))
  await config({ slowAudioMs: 0 })

  /* C. 快速连切音质不误停 */
  console.log('\n[3] rapid quality 连切不误停')
  await freshPage()
  await ensurePlaying()
  for (const level of ['lossless', 'hires', 'exhigh', 'lossless', 'exhigh']) {
    await openQuality()
    await pickQuality(level)
    await sleep(90)
  }
  await sleep(3200)
  const rq = await audioState()
  check('快速连切音质后仍在播放（未误停）', !!rq && rq.paused === false, JSON.stringify(rq && { paused: rq.paused }))

  /* D. seek-recovery 旧 retry 不影响新曲目 B */
  console.log('\n[4] seek pending → next B → pause：旧 retry 不影响 B')
  await freshPage()
  await ensurePlaying()
  await config({ slowAudioMs: 2600 })
  await clickSel('[data-nm="player-next"]')
  try {
    await waitFor(`(() => { const a = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio'); return !!a && (a.readyState === 0 || !Number.isFinite(Number(a.duration)) || Number(a.duration) <= 0) })()`, 'metadata unknown A', 4000)
  } catch { /* 断言输出 */ }
  await dispatchPointerEval('pointerdown', 0.7)
  await sleep(60)
  await dispatchPointerEval('pointerup', 0.7)
  await sleep(120)
  const pendingArmed = await evaluate(`(() => {
    const root = document.querySelector('[data-nm="player-progress"]')
    return !!root && root.getAttribute('data-seeking') === 'true'
  })()`)
  check('setup：seek 在 metadata 未就绪时进入 seeking/pending', pendingArmed)
  const idB = await audioTrackId()
  await clickSel('[data-nm="player-next"]')
  try {
    await waitFor(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return !!a && Number.isFinite(a.duration) && a.duration > 0 })()`, 'B metadata', 8000)
  } catch { /* 断言输出 */ }
  await ensurePaused()
  let bPaused = await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return a ? a.paused : null })()`)
  check('setup：切到 B 后已暂停', bPaused === true)
  await sleep(7000)
  const b = await audioState()
  check('切到 B 后暂停：旧 seek retry 未把 B 拉到旧位置',
    !!b && b.paused === true && b.t < 0.8, JSON.stringify({ id: idB, t: b && b.t, paused: b && b.paused }))
  await config({ slowAudioMs: 0 })

  /* E. mute 后 audio 重建仍保持静音 */
  console.log('\n[5] mute→audio 重建仍 muted')
  await freshPage()
  await ensurePlaying()
  const mt = await muteButton()
  if (mt) await evaluate(`(() => { const box=document.querySelector('[data-nm="dock"] .nm-dock-volume')||document.querySelector('.nm-dock-volume'); const b=box?box.querySelector('button'):null; if(b) b.click() })()`)
  await sleep(300)
  let muted = await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return a ? { muted:a.muted, volume:a.volume } : null })()`)
  check('点击静音后 audio.muted=true（或 volume=0）', !!muted && (muted.muted === true || muted.volume === 0), JSON.stringify(muted))
  // 触发 seek 自愈重建 audio 元素（记录旧元素，断言新元素替换）
  await evaluate(`(() => { window.__nmMuteOldAudio = document.querySelector('audio[data-nm-audio]') || document.querySelector('audio') })()`)
  await evaluate(`(() => {
    window.__nmSeekableDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'seekable')
    Object.defineProperty(HTMLMediaElement.prototype, 'seekable', { configurable: true, get() { return { length: 1, start() { return 0 }, end() { return 0 } } } })
  })()`)
  await dispatchPointerEval('pointerdown', 0.6); await sleep(60); await dispatchPointerEval('pointerup', 0.6)
  await sleep(1500)
  let rebuilt = false
  try {
    await waitFor(`(() => {
      const nodes = [...document.querySelectorAll('audio[data-nm-audio]')]
      return nodes.length === 1 && !!window.__nmMuteOldAudio && nodes[0] !== window.__nmMuteOldAudio
    })()`, 'audio rebuilt', 6000)
    rebuilt = true
  } catch { rebuilt = false }
  check('seek 自愈确实重建了 audio 元素', rebuilt)
  let rebuiltMuted = null
  rebuiltMuted = await evaluate(`(() => { const a=document.querySelector('audio[data-nm-audio]')||document.querySelector('audio'); return a ? { muted:a.muted, volume:a.volume } : null })()`)
  await evaluate(`(() => { try { if (window.__nmSeekableDesc) Object.defineProperty(HTMLMediaElement.prototype,'seekable',window.__nmSeekableDesc) } catch(err){} })()`)
  check('audio 重建后仍保持静音（muted=true 或 volume=0）',
    !!rebuiltMuted && (rebuiltMuted.muted === true || rebuiltMuted.volume === 0), JSON.stringify(rebuiltMuted))

  /* F. useStatus fallback：status 失败 / bridge:error，auth 成功都显示已登录 */
  console.log('\n[6] useStatus fallback（status 失败/auth 成功；bridge:error）')
  const loggedIn = async () => {
    const loginOpen = await evaluate(`!!document.querySelector('[data-nm="login-open"]')`)
    const hasLogout = await evaluate(`!!document.querySelector('button[title="退出登录"], button[aria-label="退出登录"]')`)
    const account = await evaluate(`!!document.querySelector('.nm-account')`)
    return { loginOpen, hasLogout, account }
  }
  await freshPage({ statusError: 'http', authError: false, authed: true })
  await sleep(2200)
  const fallbackHttp = await loggedIn()
  check('status 500 + /auth 成功：页面显示已登录（fallback）',
    fallbackHttp.loginOpen === false && fallbackHttp.hasLogout === true, JSON.stringify(fallbackHttp))
  await freshPage({ statusError: 'bridge-data', authError: false, authed: true })
  await sleep(2200)
  const fallbackBridge = await loggedIn()
  check('status 返回 bridge:error + /auth 成功：fallback 显示已登录',
    fallbackBridge.loginOpen === false && fallbackBridge.hasLogout === true, JSON.stringify(fallbackBridge))

  /* F2. authPending：登录态恢复中不得显示成未登录 */
  console.log('\n[6b] authPending 恢复中显示')
  await freshPage({ statusError: 'http', authError: false, authed: false, authPending: true })
  await sleep(2200)
  const pendingInfo = await evaluate(`(() => {
    const hook = document.querySelector('[data-nm="auth-pending"]')
    const visible = hook ? (() => { const r = hook.getBoundingClientRect(); return r.width > 0 && r.height > 0 })() : false
    const text = document.body.textContent || ''
    return {
      hook: !!hook, visible,
      hasRecoverText: /恢复|登录态恢复|正在恢复/.test(text),
      loginOpen: !!document.querySelector('[data-nm="login-open"]'),
      hasLogout: !!document.querySelector('button[title="退出登录"], button[aria-label="退出登录"]'),
    }
  })()`)
  check('authPending：显示恢复中指示（hook 或文案），而不是直接未登录',
    (!!pendingInfo && pendingInfo.hook && pendingInfo.visible) ||
    (!!pendingInfo && pendingInfo.hasRecoverText && !pendingInfo.loginOpen),
    JSON.stringify(pendingInfo))

  /* F3. authPending 保留上一份账号资料 + 不重置 like 缓存 */
  console.log('\n[6c] authPending 保留账号资料 + 不重置 like')
  await freshPage({ authed: true, statusSequence: ['normal', 'pending'] })
  await sleep(700)
  // 先给奇数行点红心（缓存 liked=true）
  await evaluate(`(() => {
    const rows=[...document.querySelectorAll('[data-nm="track"]')]
    const row=rows.find((r)=>Number(r.getAttribute('data-id'))%2===1)
    if(!row) return false
    const btn=row.querySelector('[data-nm="track-like"]')
    if(btn) btn.click()
    return !!btn
  })()`)
  await sleep(700)
  const likedBeforePending = await evaluate(`(() => {
    const rows=[...document.querySelectorAll('[data-nm="track"]')]
    const row=rows.find((r)=>Number(r.getAttribute('data-id'))%2===1)
    const btn=row ? row.querySelector('[data-nm="track-like"]') : null
    return btn ? btn.getAttribute('data-liked') : null
  })()`)
  // 触发一次 /status => pending（unverified）数据（一次性标记，避免序列被其它请求消费）
  await config({ statusPendingForMs: 3000 })
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find((x)=>/刷新/.test((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||''))); if(b) b.click() })()`)
  try { await waitFor(`(() => { const a=document.querySelector('.nm-account'); return !!a && /恢复/.test(a.textContent||'') })()`, 'account restoring', 3000) } catch { /* 断言输出 */ }
  await sleep(150)
  const pendingKeep = await evaluate(`(() => {
    const name=document.querySelector('.nm-account-name')
    const account=document.querySelector('.nm-account')
    const restoring=document.querySelector('.nm-account-restoring')
    const loginOpen=!!document.querySelector('[data-nm="login-open"]')
    const banner=!!document.querySelector('.nm-login-banner')
    const rows=[...document.querySelectorAll('[data-nm="track"]')]
    const row=rows.find((r)=>Number(r.getAttribute('data-id'))%2===1)
    const btn=row ? row.querySelector('[data-nm="track-like"]') : null
    return {
      name: name ? (name.textContent||'').trim() : null,
      account: !!account,
      restoring: !!restoring,
      text: account ? (account.textContent||'').trim().slice(0,60) : '',
      loginOpen, banner,
      liked: btn ? btn.getAttribute('data-liked') : null,
    }
  })()`)
  check('authPending：不出现 login-open/扫码 banner', !!pendingKeep && pendingKeep.loginOpen === false && pendingKeep.banner === false, JSON.stringify(pendingKeep))
  check('authPending：保留头像/昵称（云端听歌人）并显示恢复中',
    !!pendingKeep && pendingKeep.name === '云端听歌人' && /恢复/.test(pendingKeep.text || ''), JSON.stringify(pendingKeep))
  check('authPending：不重置 like 缓存（仍 data-liked=true）',
    !!pendingKeep && likedBeforePending === 'true' && pendingKeep.liked === 'true', JSON.stringify({ likedBeforePending, liked: pendingKeep && pendingKeep.liked }))
  // 恢复为正常 status 后 like 仍保留
  await config({ statusPendingForMs: 0 })
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find((x)=>/刷新/.test((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||''))); if(b) b.click() })()`)
  await sleep(1000)
  const afterRecoveryLiked = await evaluate(`(() => {
    const rows=[...document.querySelectorAll('[data-nm="track"]')]
    const row=rows.find((r)=>Number(r.getAttribute('data-id'))%2===1)
    const btn=row ? row.querySelector('[data-nm="track-like"]') : null
    return btn ? btn.getAttribute('data-liked') : null
  })()`)
  check('authPending 恢复为正常后 like 缓存仍保留', afterRecoveryLiked === 'true', JSON.stringify({ afterRecoveryLiked }))

  /* F4. status refresh overlap：旧延迟响应不得覆盖新账号 */
  console.log('\n[6d] status refresh overlap 旧响应不覆盖新账号')
  await freshPage({ authed: true })
  await sleep(700)
  await config({ statusPlan: [
    { delay: 1200, nickname: '旧账号A', userId: 1111111, authed: true },
    { delay: 0, nickname: '新账号B', userId: 8888888, authed: true },
  ], nickname: '新账号B', userId: 8888888, authed: true })
  const statusCallsBefore = (await calls()).filter((c) => c.path === '/netease-panel/api/status').length
  const clickRefresh = () => evaluate(`(() => { const b=[...document.querySelectorAll('button')].find((x)=>/刷新/.test((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||''))); if(b) b.click(); return !!b })()`)
  const r1 = await clickRefresh()
  await sleep(150)
  const r2 = await clickRefresh()
  await sleep(2400)
  const statusCallsAfter = (await calls()).filter((c) => c.path === '/netease-panel/api/status').length
  console.log('  · overlap diag ' + JSON.stringify({ r1, r2, statusCallsBefore, statusCallsAfter }))
  const overlapState = await evaluate(`(() => {
    const name=document.querySelector('.nm-account-name')
    const loginOpen=!!document.querySelector('[data-nm="login-open"]')
    return { name: name ? (name.textContent||'').trim() : null, loginOpen, bodyHasOld: (document.body.textContent||'').includes('旧账号A'), bodyHasNew: (document.body.textContent||'').includes('新账号B') }
  })()`)
  check('status overlap：最终显示新账号，旧延迟响应未覆盖',
    !!overlapState && overlapState.name === '新账号B' && overlapState.loginOpen === false,
    JSON.stringify(Object.assign({}, overlapState, { r1, r2, statusCallsBefore, statusCallsAfter })))
  await config({ statusPlan: null, statusDelayMs: 0, nickname: '云端听歌人', userId: 3293310 })

  /* F5. bridge=error 的 status 也要走 /auth，并保留 engine 诊断 */
  console.log('\n[6e] status bridge=error + /auth 成功：登录态 fallback + engine 错误卡片')
  await freshPage({ authed: true, statusError: 'bridge-error' })
  await sleep(2200)
  const bridgeFallback = await evaluate(`(() => {
    const hasLogout = !!document.querySelector('button[title="退出登录"], button[aria-label="退出登录"]')
    const loginOpen = !!document.querySelector('[data-nm="login-open"]')
    const engineCard = !!document.querySelector('[data-nm="engine-setup"]')
    const text = document.body.textContent || ''
    return { hasLogout, loginOpen, engineCard, hasEngineText: /引擎|数据引擎/.test(text) }
  })()`)
  const authCalls = (await calls()).filter((c) => c.path === '/netease-panel/api/auth').length
  check('status bridge=error 时仍调用 /auth 兜底', authCalls > 0, JSON.stringify({ authCalls }))
  check('status bridge=error + /auth authed：显示已登录（不显示扫码）',
    !!bridgeFallback && bridgeFallback.hasLogout === true && bridgeFallback.loginOpen === false, JSON.stringify(bridgeFallback))
  check('status bridge=error：仍展示 engine 错误卡片/诊断',
    !!bridgeFallback && (bridgeFallback.engineCard || bridgeFallback.hasEngineText), JSON.stringify(bridgeFallback))

  /* G. logout 接口失败不得本地登出 */
  console.log('\n[7] logout 接口失败保持登录')
  await freshPage({ logoutError: true, authed: true })
  await sleep(1200)
  const logoutBtn = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => /退出登录|Sign out/.test((x.getAttribute('title') || '') + (x.getAttribute('aria-label') || '')))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  check('已登录时存在「退出登录」按钮', !!logoutBtn)
  if (logoutBtn) await evaluate(`(() => { const btns=[...document.querySelectorAll('button')]; const b=btns.find((x)=>/退出登录|Sign out/.test((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||''))); if(b) b.click() })()`)
  await sleep(1500)
  const afterLogoutFail = await loggedIn()
  const toastText = await evaluate(`(() => { const t=document.querySelector('.nm-toast, [data-nm="toast"], [role="status"]'); return t ? (t.textContent||'').trim() : null })()`)
  check('logout 接口 500：仍保持已登录（不显示退出态）',
    afterLogoutFail.loginOpen === false && afterLogoutFail.hasLogout === true, JSON.stringify(afterLogoutFail))
  check('logout 接口 500：不出现「已退出登录」成功提示',
    !toastText || !/已退出登录|Signed out/.test(toastText), JSON.stringify({ toastText }))

  /* H. 换账号时 pending like 状态旧回写不得污染 */
  console.log('\n[8] 换账号 pending like 旧回写不污染')
  await freshPage({ authed: true, likeDelayMs: 10000, likeForceLiked: true, resetLikes: true })
  await sleep(1000)
  const oddRow = await evaluate(`(() => {
    const rows=[...document.querySelectorAll('[data-nm="track"]')]
    const row=rows.find((r)=>Number(r.getAttribute('data-id'))%2===1)
    if(!row) return null
    row.scrollIntoView({block:'center'})
    const r=row.getBoundingClientRect()
    return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), id: row.getAttribute('data-id') }
  })()`)
  const hoverAt = Date.now()
  if (oddRow) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: oddRow.x, y: oddRow.y, button: 'none', buttons: 0, pointerType: 'mouse' })
    await sleep(300)
  }
  // 旧 like/status 已在途（延迟 10s）：立刻恢复正常延迟，避免影响后续新请求
  await config({ likeDelayMs: 0, likeForceLiked: null })
  // 换账号：logout 成功 → 打开登录弹窗，等待客户端轮询自动完成登录（800/2000ms 轮询）
  await evaluate(`(() => { const btns=[...document.querySelectorAll('button')]; const b=btns.find((x)=>/退出登录|Sign out/.test((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||''))); if(b) b.click() })()`)
  try {
    await waitFor(`!!document.querySelector('[data-nm="login-open"]')`, 'logged out for switch', 6000)
  } catch { /* 断言输出 */ }
  await evaluate(`(() => { const b=document.querySelector('[data-nm="login-open"]'); if(b) b.click() })()`)
  let relogged = false
  try {
    await waitFor(`!!document.querySelector('button[title="退出登录"], button[aria-label="退出登录"]')`, 're-login', 14000)
    relogged = true
  } catch { relogged = false }
  if (!relogged) {
    const loginDiag = await evaluate(`(() => {
      const modal = !!document.querySelector('[data-nm="login-modal"]')
      const st = document.querySelector('[data-nm="login-state"]')
      const loginOpen = !!document.querySelector('[data-nm="login-open"]')
      return { modal, state: st ? st.getAttribute('data-state') : null, text: st ? (st.textContent||'').slice(0,40) : null, loginOpen }
    })()`)
    const loginCalls = (await calls()).filter((c) => c.path === '/netease-panel/api/login/check').length
    console.log('  · login diag ' + JSON.stringify({ loginDiag, loginCalls }))
  }
  check('setup：like 换账号流程确实重新登录', relogged)
  // 等旧延迟响应回来（hover 后 10s + 余量），期间不改客户端 like 状态
  const waitMore = Math.max(0, 11500 - (Date.now() - hoverAt))
  await sleep(waitMore)
  const likeNow = await evaluate(`(() => {
    const row=[...document.querySelectorAll('[data-nm="track"]')].find((r)=>String(r.getAttribute('data-id'))===${JSON.stringify('__ODD__')})
    if(!row) return null
    const btn=row.querySelector('[data-nm="track-like"]')
    return btn ? btn.getAttribute('data-liked') : null
  })()`.replace('__ODD__', String(oddRow && oddRow.id)))
  const serverLikeNow = await evaluate(`fetch('/netease-panel/api/like/status?ids=' + encodeURIComponent(${JSON.stringify('__ID__')})).then(function(r){return r.json()}).then(function(j){return j && j.data && j.data.liked ? j.data.liked : null}).catch(function(){return null})`.replace('__ID__', String(oddRow && oddRow.id)))
  const likeStatusCallCount = (await calls()).filter((c) => c.path === '/netease-panel/api/like/status').length
  check('换账号后旧 pending like 响应未把状态写成 liked=true',
    likeNow === 'false', JSON.stringify({ id: oddRow && oddRow.id, likeNow, serverLikeNow, likeStatusCallCount }))
} catch (err) {
  fatal = err
  console.log('\n[FATAL] ' + (err && err.stack ? err.stack : err))
}

// 汇总
const total = passed.length + failed.length
console.log(`\nREGRESSION ${failed.length === 0 && !fatal ? 'PASS' : 'FAIL'} ${passed.length}/${total}`)
if (failed.length) { console.log('FAIL 清单：'); failed.forEach((f) => console.log(`  ✗ ${f.label}${f.extra === undefined ? '' : ' → ' + f.extra}`)) }
if (pageErrors.length) { console.log('\nconsole/page errors:'); pageErrors.slice(0, 20).forEach((e) => console.log('  - ' + e)) }
try { chrome.kill('SIGKILL') } catch { /* ignore */ }
try { server.kill('SIGKILL') } catch { /* ignore */ }
try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* ignore */ }
if (fatal) process.exit(1)
process.exit(failed.length === 0 ? 0 : 1)
