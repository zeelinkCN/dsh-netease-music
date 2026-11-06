/**
 * 网易云音乐 · DeepSeek Harness 插件（Host 侧）
 *
 * 职责：
 *  1. 管理常驻 Python 数据引擎（server/bridge.py，NDJSON over stdio）
 *  2. 暴露 /netease-panel/api/* 给浏览器端（登录、推荐、歌单、歌手、搜索、歌词）
 *  3. 音频/图片代理（带着 Referer 转发，支持 Range，浏览器 <audio> 可直接拖动进度）
 *
 * 设计要点：
 *  - 引擎懒启动 + 崩溃后按需重启，激活本身不阻塞
 *  - 面板只认统一信封 {ok:true,data} / {ok:false,error,code}
 *  - 所有缓存都带 TTL；登录/登出会清空缓存，保证换账号后数据干净
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, truncateSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createInstaller } from './server/installer.mjs'

export const name = 'netease-music'
export const inject = ['webServer']

/* ------------------------------------------------------------------ *
 * 路径与常量
 * ------------------------------------------------------------------ */
const ROOT = dirname(fileURLToPath(import.meta.url))
const ROUTE = '/netease-panel/api'
const DATA_DIR = process.env.DSH_NETEASE_MUSIC_DIR || join(homedir(), '.dsh', 'netease-panel')
const COOKIE_FILE = join(DATA_DIR, 'cookies.json')
const LOG_FILE = join(DATA_DIR, 'bridge.log')
const IS_WINDOWS = process.platform === 'win32'
const ENGINE_DIR = process.env.DSH_NETEASE_ENGINE_DIR || join(ROOT, 'engine', 'cloud-music-mcp')
/** 跨平台 venv 解释器：macOS/Linux 在 bin/python，Windows 在 Scripts/python.exe */
const VENV_PYTHON = IS_WINDOWS
  ? join(ENGINE_DIR, '.venv', 'Scripts', 'python.exe')
  : join(ENGINE_DIR, '.venv', 'bin', 'python')
const VENV_SCRIPTS = join(ENGINE_DIR, '.venv', IS_WINDOWS ? 'Scripts' : 'bin')
/** MCP stdio 入口（给 cordis.patch.yml 的 netease-mcp 行参考） */
const MCP_ENTRY = join(VENV_SCRIPTS, IS_WINDOWS ? 'cloud-music-mcp.exe' : 'cloud-music-mcp')
const PYTHON = process.env.DSH_NETEASE_PYTHON || VENV_PYTHON
const BRIDGE = process.env.DSH_NETEASE_BRIDGE || join(ROOT, 'server', 'bridge.py')
const LOG_MAX_BYTES = 2 * 1024 * 1024
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const AUDIO_LEVELS = new Set(['auto', 'standard', 'exhigh', 'lossless', 'hires'])
const MODE_TYPES = new Set(['heart', 'roam', 'similar_song', 'similar_artist', 'daily'])
const AUDIO_MIME = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

const IMAGE_HOSTS = [
  '.music.126.net',
  '.126.net',
  '.127.net',
  '.163.com',
  'music.163.com',
]

/* ------------------------------------------------------------------ *
 * 日志（stderr + 滚动文件，永不向客户端抛异常）
 * ------------------------------------------------------------------ */
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
    .join(' ')}`
  try {
    console.error('[netease-music]', ...args)
  } catch {
    /* ignore */
  }
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > LOG_MAX_BYTES) truncateSync(LOG_FILE, 0)
    appendFileSync(LOG_FILE, `${line}\n`)
  } catch {
    /* 日志失败不影响业务 */
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/* ------------------------------------------------------------------ *
 * 错误
 * ------------------------------------------------------------------ */
const ERR_ENGINE_MISSING =
  '数据引擎尚未安装：请先为 dsh-netease-music/engine 创建 venv 并安装 cloud-music-mcp（见插件 README「引擎安装」）'

class PluginError extends Error {
  constructor(message, code = 'INTERNAL') {
    super(message)
    this.code = code
  }
}

/* ------------------------------------------------------------------ *
 * Python 引擎（NDJSON 子进程）
 * ------------------------------------------------------------------ */
class Bridge {
  constructor(options) {
    this.python = options.python
    this.script = options.script
    this.cookieFile = options.cookieFile
    this.child = null
    this.ready = false
    this.starting = null
    this.buffer = ''
    this.seq = 0
    this.pending = new Map()
    this.restarts = 0
    this.lastExit = null
  }

  get alive() {
    return !!this.child && this.ready
  }

  ensure() {
    if (this.alive) return Promise.resolve()
    return this.start()
  }

  start() {
    if (this.starting) return this.starting
    if (!existsSync(this.python)) return Promise.reject(new PluginError(ERR_ENGINE_MISSING, 'ENGINE_MISSING'))
    if (!existsSync(this.script)) return Promise.reject(new PluginError('引擎脚本缺失：' + this.script, 'ENGINE_MISSING'))

    this.starting = new Promise((resolve, reject) => {
      let settled = false
      const settleOk = () => {
        if (settled) return
        settled = true
        this.starting = null
        resolve()
      }
      const settleErr = (err) => {
        if (settled) return
        settled = true
        this.starting = null
        reject(err)
      }
      const timer = setTimeout(
        () => settleErr(new PluginError('网易云数据引擎启动超时（网络或依赖异常）', 'BRIDGE')),
        45_000,
      )

      let child
      try {
        child = spawn(this.python, [this.script], {
          cwd: join(ROOT, 'server'),
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
            NETEASE_COOKIE_FILE: this.cookieFile,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (err) {
        clearTimeout(timer)
        settleErr(new PluginError(`无法启动数据引擎：${err?.message ?? err}`, 'BRIDGE'))
        return
      }
      this.child = child
      this.ready = false
      this.buffer = ''
      this.lastExit = null

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => this.#onData(chunk, settleOk, settleErr))
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => {
        const text = String(chunk).trim()
        if (text) log('[engine]', text.slice(0, 2000))
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        this.#failAll(err)
        settleErr(new PluginError(`数据引擎进程错误：${err?.message ?? err}`, 'BRIDGE'))
      })
      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        this.child = null
        this.ready = false
        this.starting = null
        this.lastExit = `code=${code} signal=${signal ?? ''}`
        log('数据引擎退出', this.lastExit)
        this.#failAll(new PluginError('数据引擎已退出，请重试', 'BRIDGE'))
        settleErr(new PluginError('数据引擎启动失败（进程提前退出）', 'BRIDGE'))
      })
      child.stdin.on('error', (err) => log('引擎 stdin 错误', String(err?.message ?? err)))
    })
    return this.starting
  }

  #onData(chunk, settleOk, settleErr) {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      index = this.buffer.indexOf('\n')
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        log('引擎输出非 JSON，已忽略：', line.slice(0, 300))
        continue
      }
      if (msg && msg.event === 'ready') {
        this.ready = true
        this.restarts = 0
        log('数据引擎就绪', msg.data ?? {})
        settleOk()
        continue
      }
      if (msg && msg.id != null) {
        const entry = this.pending.get(String(msg.id))
        if (!entry) continue
        this.pending.delete(String(msg.id))
        clearTimeout(entry.timer)
        if (msg.ok) entry.resolve(msg.data)
        else {
          const err = new PluginError(
            String(msg.error || '数据引擎返回错误'),
            typeof msg.code === 'string' && msg.code ? msg.code : 'INTERNAL',
          )
          entry.reject(err)
        }
        continue
      }
      log('引擎事件：', line.slice(0, 300))
    }
  }

  #failAll(err) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    this.pending.clear()
  }

  async call(cmd, params = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? 30_000
    await this.ensure()
    const child = this.child
    if (!child) throw new PluginError('数据引擎未运行', 'BRIDGE')
    const id = String(++this.seq)
    const line = JSON.stringify({ id, cmd, params }) + '\n'
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new PluginError('网易云接口响应超时，请重试', 'TIMEOUT'))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        child.stdin.write(line)
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new PluginError(`写入数据引擎失败：${err?.message ?? err}`, 'BRIDGE'))
      }
    })
  }

  stop() {
    const child = this.child
    this.child = null
    this.ready = false
    this.starting = null
    this.#failAll(new PluginError('数据引擎已停止', 'BRIDGE'))
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      /* ignore */
    }
    try {
      child.kill('SIGTERM')
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }, 2000).unref?.()
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ *
 * 缓存（带 TTL + 并发去重）
 * ------------------------------------------------------------------ */
function createCache() {
  const store = new Map()
  const inflight = new Map()
  return {
    async wrap(key, ttlMs, factory) {
      const hit = store.get(key)
      if (hit && Date.now() - hit.at < ttlMs) return hit.value
      if (inflight.has(key)) return inflight.get(key)
      const task = Promise.resolve()
        .then(factory)
        .then((value) => {
          store.set(key, { at: Date.now(), value })
          return value
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, task)
      return task
    },
    clear() {
      store.clear()
    },
    get size() {
      return store.size
    },
  }
}

/* ------------------------------------------------------------------ *
 * 播放器状态上报的收敛（只保留工具需要的字段，避免客户端塞任意大对象）
 * ------------------------------------------------------------------ */
function sanitizePlayerState(input) {
  const src = input && typeof input === 'object' ? input : {}
  const current = src.current && typeof src.current === 'object' ? src.current : null
  const pickTrack = (track) =>
    track && typeof track === 'object'
      ? {
          id: Number(track.id) || null,
          name: typeof track.name === 'string' ? track.name.slice(0, 200) : '',
          artist: typeof track.artist === 'string' ? track.artist.slice(0, 200) : '',
          album: typeof track.album === 'string' ? track.album.slice(0, 200) : '',
          liked: !!track.liked,
        }
      : null
  return {
    current: pickTrack(current),
    playing: !!src.playing,
    loading: !!src.loading,
    position: Number(src.position) || 0,
    duration: Number(src.duration) || 0,
    quality: typeof src.quality === 'string' ? src.quality.slice(0, 16) : '',
    actualLevel: typeof src.actualLevel === 'string' ? src.actualLevel.slice(0, 16) : '',
    queueLength: Number(src.queueLength) || 0,
    queue: Array.isArray(src.queue) ? src.queue.slice(0, 20).map(pickTrack).filter(Boolean) : [],
    contextTitle: typeof src.contextTitle === 'string' ? src.contextTitle.slice(0, 120) : '',
    updatedAt: Date.now(),
  }
}

/* ------------------------------------------------------------------ *
 * 插件入口
 * ------------------------------------------------------------------ */
export function apply(ctx) {
  const cache = createCache()
  const bridge = new Bridge({ python: PYTHON, script: BRIDGE, cookieFile: COOKIE_FILE })
  /* 本地真实 HTTP 基址：App 页面跑在 dsh-app:// 自定义协议下，媒体经该协议会丢 Content-Length，
     导致 <audio> 判定不可 seek；音频需要绝对 http://127.0.0.1:<port> 地址。 */
  let lastAuth = { authed: false, nickname: null, avatar: null, vipType: 0, userId: null, at: 0 }

  const localHttpBase = () => {
    try {
      const ws = ctx.webServer || {}
      let port = ws.listenedPort || 0
      if (!port && ws.server && typeof ws.server.address === 'function') port = (ws.server.address() || {}).port || 0
      return port ? 'http://127.0.0.1:' + port : ''
    } catch (err) {
      return ''
    }
  }

  /* ---------------- 插件内播放器：Agent 命令队列 + 客户端上报状态 ---------------- */
  const playerCommands = []
  let playerCommandSeq = 0
  let playerState = null
  const pushPlayerCommand = (command) => {
    playerCommandSeq += 1
    playerCommands.push({ seq: playerCommandSeq, at: Date.now(), ...command })
    if (playerCommands.length > 120) playerCommands.splice(0, playerCommands.length - 120)
    return playerCommandSeq
  }
  const currentTrack = () => (playerState && playerState.current) || null

  const installer = createInstaller({
    engineDir: ENGINE_DIR,
    pythonPath: PYTHON,
    dataDir: DATA_DIR,
    onLog: (line) => log('[install]', line),
  })
  let loginKey = null

  try {
    mkdirSync(DATA_DIR, { recursive: true })
  } catch (err) {
    log('创建数据目录失败', String(err?.message ?? err))
  }

  const json = (res, payload, statusCode = 200) => {
    const body = JSON.stringify(payload)
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  }
  const ok = (res, data) => json(res, { ok: true, data })
  const fail = (res, error, code = 'INTERNAL') => {
    const message = typeof error === 'string' ? error : String(error?.message ?? error)
    const actualCode = typeof error === 'object' && error?.code ? error.code : code
    json(res, { ok: false, error: message, code: actualCode })
  }

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let raw = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 131_072) {
          req.destroy()
          reject(new PluginError('请求体过大', 'INTERNAL'))
        }
      })
      req.on('end', () => {
        if (!raw) return resolve({})
        try {
          resolve(JSON.parse(raw))
        } catch (err) {
          reject(new PluginError(`JSON 解析失败：${err.message}`, 'INTERNAL'))
        }
      })
      req.on('error', (err) => reject(new PluginError(String(err?.message ?? err), 'INTERNAL')))
    })

  const num = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const route = (path, handler, kind = 'exact') => ({ kind, path: `${ROUTE}/${path}`, handler })

  /** 统一包装：业务错误走信封，永远 200（流式路由自己处理响应） */
  const wrap = (handler) => async (req, res) => {
    try {
      /* App 内部 dsh-app:// 协议会缓存 GET 响应，登录态等状态不能缓存 */
      try {
        if (!res.headersSent) res.headersSent || res.setHeader('Cache-Control', 'no-store, no-transform')
        /* 页面在 dsh-app:// 下，走绝对 http 的请求是跨源：允许跨源读取（本机回环，无凭据） */
        if (!res.headersSent) res.setHeader('Access-Control-Allow-Origin', '*')
        if (!res.headersSent) res.setHeader('Access-Control-Allow-Headers', 'accept,content-type')
        if (!res.headersSent) res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      } catch (err) { /* ignore */ }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      try {
        if (url.pathname === '/netease-panel/api/status' || url.pathname === '/netease-panel/api/httpbase') {
          log('[api-req]', req.method, url.pathname, url.search.slice(0, 60), 'ua=' + String(req.headers['user-agent'] || '').slice(0, 40))
        }
      } catch (err) { /* ignore */ }
      const data = await handler(url, req, res)
      if (res.writableEnded) return
      ok(res, data)
    } catch (err) {
      if (res.writableEnded) return
      log('请求失败', req.method, req.url, String(err?.message ?? err))
      fail(res, err)
    }
  }

  const handle = (handler) => wrap(handler)

  const invalidate = () => {
    cache.clear()
    loginKey = null
  }

  /* ---------------- 音频代理 ---------------- */
  const audioRoute = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const id = num(url.searchParams.get('id'))
    if (!id) return fail(res, '缺少歌曲 id', 'NOT_FOUND')
    const requestedLevel = String(url.searchParams.get('level') || 'auto').toLowerCase()
    const level = AUDIO_LEVELS.has(requestedLevel) ? requestedLevel : 'auto'
    let info
    try {
      info = await cache.wrap(`songurl:${id}:${level}`, 5 * 60 * 1000, () =>
        bridge.call('song_url', { id, level }, { timeoutMs: 25_000 }),
      )
    } catch (err) {
      if (res.writableEnded) return
      return fail(res, err)
    }
    if (!info || !info.url) {
      if (res.writableEnded) return
      return fail(res, info?.message || '这首歌暂时没有可播放的音源（可能需要会员或已下架）', 'NOT_FOUND')
    }

    const controller = new AbortController()
    res.on('close', () => controller.abort())
    log(
      '[audio-req]',
      'id=' + id,
      'level=' + level,
      'range=' + String(req.headers.range || '-').slice(0, 40),
      'ifRange=' + String(req.headers['if-range'] || '-').slice(0, 20),
      'ifNoneMatch=' + String(req.headers['if-none-match'] || '-').slice(0, 20),
      'accept=' + String(req.headers.accept || '-').slice(0, 40),
    )
    const headers = { 'User-Agent': UA, Referer: 'https://music.163.com/' }
    const rawRange = String(req.headers.range || '')
    const fullRange = /^bytes=0-$/.test(rawRange.trim())
    if (rawRange && !fullRange) headers.Range = rawRange
    let upstream
    try {
      upstream = await fetch(info.url, { headers, redirect: 'follow', signal: controller.signal })
    } catch (err) {
      if (res.writableEnded) return
      return fail(res, `音源连接失败：${err?.message ?? err}`, 'NETWORK')
    }
    if (req.headers.range && !/^bytes=0-/.test(String(req.headers.range))) {
      log('[audio-range]', 'id=' + id, 'level=' + level, String(req.headers.range).slice(0, 40))
    }
    if (!upstream.ok && upstream.status !== 206) {
      if (res.writableEnded) return
      return fail(res, `音源返回 HTTP ${upstream.status}`, 'NETWORK')
    }
    res.statusCode = !fullRange && upstream.status === 206 ? 206 : 200
    const passthrough = fullRange
      ? ['content-type', 'content-length', 'accept-ranges']
      : ['content-type', 'content-length', 'content-range', 'accept-ranges']
    for (const key of passthrough) {
      const value = upstream.headers.get(key)
      if (value) res.setHeader(key, value)
    }
    // 上游把 FLAC/无损也常标成 audio/mpeg，这里按真实编码覆盖，否则 <audio> 解码会犹豫
    const ext = String(info.type || '').toLowerCase().replace('.', '')
    res.setHeader('Content-Type', AUDIO_MIME[ext] || 'audio/mpeg')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (!res.getHeader('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes')
    // 音频流绝不能进浏览器缓存：被中断的局部响应被复用会让 <audio> 判定 seekable=[0,0]
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('Pragma', 'no-cache')
    log(
      '[audio-resp]',
      'id=' + id,
      'status=' + res.statusCode,
      'len=' + String(res.getHeader('content-length') || '-'),
      'range=' + String(res.getHeader('content-range') || '-').slice(0, 40),
      'acceptRanges=' + String(res.getHeader('accept-ranges') || '-'),
    )
    try {
      for await (const chunk of upstream.body) {
        if (res.writableEnded) break
        res.write(chunk)
      }
    } catch (err) {
      if (!res.writableEnded) {
        log('音频转发中断', String(err?.message ?? err))
      }
    } finally {
      if (!res.writableEnded) res.end()
    }
  }

  /* ---------------- 图片代理（封面兜底） ---------------- */
  const imageRoute = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const raw = url.searchParams.get('u')
    if (!raw) return fail(res, '缺少图片地址', 'NOT_FOUND')
    let target
    try {
      target = new URL(raw)
    } catch {
      return fail(res, '图片地址不合法', 'NOT_FOUND')
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return fail(res, '只支持 http(s) 图片', 'NOT_FOUND')
    }
    const host = target.hostname
    if (!IMAGE_HOSTS.some((suffix) => host === suffix.replace(/^\./, '') || host.endsWith(suffix))) {
      return fail(res, '不在允许的图片域名内', 'NOT_FOUND')
    }
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    let upstream
    try {
      upstream = await fetch(target.toString(), {
        headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' },
        redirect: 'follow',
        signal: controller.signal,
      })
    } catch (err) {
      return fail(res, `图片加载失败：${err?.message ?? err}`, 'NETWORK')
    }
    if (!upstream.ok) return fail(res, `图片返回 HTTP ${upstream.status}`, 'NETWORK')
    res.statusCode = 200
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
    const length = upstream.headers.get('content-length')
    if (length) res.setHeader('Content-Length', length)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    try {
      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.end(buffer)
    } catch (err) {
      if (!res.writableEnded) fail(res, `图片读取失败：${err?.message ?? err}`, 'NETWORK')
    }
  }

  /* ---------------- 官方 App 图标（侧栏 / 插件管理页共用，保证长得就是网易云） ---------------- */
  const ICON_FILES = { 64: 'icon-64.png', 128: 'icon-128.png', 256: 'icon.png' }
  const iconRoute = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const wanted = Number(url.searchParams.get('size')) || 256
    const file = ICON_FILES[wanted] || ICON_FILES[256]
    let bytes
    try {
      bytes = readFileSync(join(ROOT, 'assets', file))
    } catch (err) {
      log('图标读取失败', file, String(err?.message ?? err))
      return fail(res, '图标资源缺失', 'NOT_FOUND')
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=604800')
    res.setHeader('Content-Length', String(bytes.length))
    res.end(bytes)
  }


  /* ---------------- Agent 工具：在插件内播放（不启动桌面客户端） ---------------- */
  const toolText = (text) => ({ schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] })

  const formatTrack = (track) => `${track.name} - ${track.artist || '未知歌手'}`

  /** 把一次「播放」请求解析成曲目列表 */
  const resolvePlayRequest = async (args) => {
    const seedId = currentTrack() && currentTrack().id ? currentTrack().id : undefined
    if (args.mode) {
      const data = await bridge.call('mode', { type: String(args.mode), seedSongId: seedId, limit: 30 }, { timeoutMs: 45_000 })
      const songs = Array.isArray(data && data.songs) ? data.songs : []
      return { songs, title: (data && data.title) || String(args.mode), subtitle: (data && data.subtitle) || '', fallbackUsed: (data && data.fallbackUsed) || null }
    }
    if (args.playlistId) {
      const data = await bridge.call('playlist', { id: Number(args.playlistId) }, { timeoutMs: 60_000 })
      const songs = Array.isArray(data && data.songs) ? data.songs : []
      return { songs, title: (data && data.playlist && data.playlist.name) || '歌单', subtitle: '' }
    }
    if (args.albumId) {
      const data = await bridge.call('album', { id: Number(args.albumId) }, { timeoutMs: 60_000 })
      const songs = Array.isArray(data && data.songs) ? data.songs : []
      return { songs, title: (data && data.album && data.album.name) || '专辑', subtitle: '' }
    }
    const query = String(args.query || '').trim()
    if (query) {
      const type = ['song', 'playlist', 'artist', 'album'].includes(String(args.type)) ? String(args.type) : 'song'
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
      const found = await bridge.call('search', { q: query, type, limit }, { timeoutMs: 30_000 })
      const items = Array.isArray(found && found.items) ? found.items : []
      if (!items.length) return { songs: [], title: query, subtitle: '', empty: true }
      if (type === 'playlist') {
        const detail = await bridge.call('playlist', { id: Number(items[0].id) }, { timeoutMs: 60_000 })
        return { songs: (detail && detail.songs) || [], title: (detail && detail.playlist && detail.playlist.name) || query, subtitle: '' }
      }
      if (type === 'artist') {
        const detail = await bridge.call('artist', { id: Number(items[0].id) }, { timeoutMs: 60_000 })
        return { songs: (detail && detail.songs) || [], title: (detail && detail.artist && detail.artist.name) || query, subtitle: '' }
      }
      if (type === 'album') {
        const detail = await bridge.call('album', { id: Number(items[0].id) }, { timeoutMs: 60_000 })
        return { songs: (detail && detail.songs) || [], title: (detail && detail.album && detail.album.name) || query, subtitle: '' }
      }
      return { songs: items, title: '搜索：' + query, subtitle: '' }
    }
    const data = await bridge.call('daily', {}, { timeoutMs: 40_000 })
    return { songs: (data && data.songs) || [], title: '每日推荐', subtitle: '' }
  }

  try {
    const ws = ctx.webServer || {}
    let port = ws.port
    try {
      if (!port && ws.server && typeof ws.server.address === 'function') port = (ws.server.address() || {}).port
    } catch (err) { /* ignore */ }
    log('[host] webServer keys=' + JSON.stringify(Object.keys(ws)) + ' port=' + String(port) +
      ' serverKeys=' + JSON.stringify(ws.server ? Object.keys(ws.server) : []))
  } catch (err) { /* ignore */ }

  ctx.effect(() => {
    const tools = ctx.get('tools')
    const systemPrompt = ctx.get('systemPrompt')
    const disposers = []

    if (tools && typeof tools.register === 'function') {
      disposers.push(tools.register({
        name: 'netease_play',
        description:
          '在 DeepSeek Harness 的网易云音乐插件里开始播放（面板内播放器 + 底部播放条，不会启动或唤起桌面网易云客户端）。用户说“放首歌/听点音乐/来点周杰伦/播放我的歌单”时优先用本工具，而不是任何会打开桌面客户端的工具。可以用 query 搜索后播放、用 mode 播放推荐模式、用 playlistId/albumId 播放指定歌单/专辑，什么都不给则播放每日推荐。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索词，例如歌手、歌名、歌单名；与 mode/playlistId/albumId 互斥，优先 mode > playlistId > albumId > query。' },
            type: { type: 'string', enum: ['song', 'playlist', 'artist', 'album'], description: 'query 的搜索类型，默认 song（播放搜索到的歌曲列表）；playlist/artist/album 会取第一个匹配项并播放其全部歌曲。' },
            mode: { type: 'string', enum: ['daily', 'heart', 'roam', 'similar_song', 'similar_artist'], description: '听歌模式：daily 每日推荐；heart 心动模式；roam 私人漫游/FM；similar_song 相似歌曲；similar_artist 相似艺人。' },
            playlistId: { type: 'integer', description: '网易云歌单 ID。' },
            albumId: { type: 'integer', description: '网易云专辑 ID。' },
            limit: { type: 'integer', description: '搜索歌曲时最多播放多少首（1-50，默认 20）。' },
          },
          additionalProperties: false,
        },
        output: toolText('播放结果'),
        async execute(args) {
          try {
          const req = args && typeof args === 'object' ? args : {}
          let resolved
          try {
            resolved = await resolvePlayRequest(req)
          } catch (err) {
            return '播放失败：' + String(err && err.message ? err.message : err)
          }
          const songs = Array.isArray(resolved.songs) ? resolved.songs : []
          if (!songs.length) {
            return resolved.empty
              ? `没有搜到「${String(req.query || '')}」相关的歌，换一个关键词试试。`
              : '没有拿到可播放的歌曲（可能是未登录或接口异常），请让用户在网易云插件面板检查登录状态。'
          }
          if (!installer.isInstalled() || !bridge.alive) {
            return '播放器未就绪：数据引擎还没连接好，请让用户在网易云插件面板查看引擎状态。'
          }
          pushPlayerCommand({ type: 'playQueue', tracks: songs, title: resolved.title || '', subtitle: resolved.subtitle || '' })
          const first = songs[0]
          const fallback = resolved.fallbackUsed ? `（已降级：${resolved.fallbackUsed}）` : ''
          return `${resolved.title || '播放'} · 共 ${songs.length} 首，已开始在 Harness 插件内播放：第一首《${formatTrack(first)}》${fallback}。播放条会固定在该面板底部，回到对话页后收进左侧栏迷你播放器，不影响继续工作。`
          } catch (err) {
            return '播放失败：' + String(err && err.message ? err.message : err)
          }
        },
      }))

      disposers.push(tools.register({
        name: 'netease_player',
        description:
          '控制 Harness 内置网易云播放器的状态：查看当前播放、暂停/继续、上一首/下一首、跳转进度、调音量、收藏/取消收藏，也可以只搜索不播放。不要用它启动桌面网易云客户端；播放音乐请用 netease_play。',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['status', 'pause', 'resume', 'next', 'prev', 'seek', 'volume', 'like', 'unlike', 'search'], description: '要执行的操作。status 查看当前播放；search 用 query 搜索并返回歌单文本（不播放）。' },
            seconds: { type: 'number', description: 'action=seek 时的目标秒数。' },
            volume: { type: 'number', description: 'action=volume 时的音量（0-1）。' },
            trackId: { type: 'integer', description: 'action=like/unlike 时指定歌曲 ID；省略则用当前播放歌曲。' },
            query: { type: 'string', description: 'action=search 的搜索词。' },
            type: { type: 'string', enum: ['song', 'playlist', 'artist', 'album'], description: 'action=search 的搜索类型，默认 song。' },
            limit: { type: 'integer', description: 'action=search 返回条数（1-20，默认 10）。' },
          },
          required: ['action'],
          additionalProperties: false,
        },
        output: toolText('播放器状态'),
        async execute(args) {
          try {
          const req = args && typeof args === 'object' ? args : {}
          const action = String(req.action || 'status')
          const state = playerState || { current: null, playing: false, position: 0, duration: 0 }
          const nowPlaying = state.current ? `《${formatTrack(state.current)}》${state.playing ? '正在播放' : '已暂停'}` : '当前没有播放歌曲'
          switch (action) {
            case 'status': {
              const auth = await bridge.call('status', {}, { timeoutMs: 15_000 }).catch(() => null)
              const progress = state.duration ? `${Math.floor(state.position / 1000)}s / ${Math.floor(state.duration / 1000)}s` : ''
              return `${nowPlaying}${progress ? '（' + progress + '）' : ''}；音质 ${state.actualLevel || state.quality || '自动'}；队列 ${state.queueLength || 0} 首；登录状态：${auth && auth.authed ? '已登录（' + (auth.nickname || '') + '）' : '未登录'}。${state.contextTitle ? '来源：' + state.contextTitle : ''}`
            }
            case 'pause':
            case 'resume':
            case 'next':
            case 'prev':
              pushPlayerCommand({ type: 'control', action })
              return action === 'pause' ? '已发送暂停指令。' : action === 'resume' ? '已发送继续播放指令。' : action === 'next' ? '已切到下一首。' : '已切到上一首。'
            case 'seek':
              pushPlayerCommand({ type: 'control', action: 'seek', seconds: Number(req.seconds) || 0 })
              return `已跳转到 ${Math.max(0, Number(req.seconds) || 0)} 秒。`
            case 'volume':
              pushPlayerCommand({ type: 'control', action: 'volume', volume: Math.min(1, Math.max(0, Number(req.volume))) })
              return `音量已设为 ${Math.round(Math.min(1, Math.max(0, Number(req.volume))) * 100)}%。`
            case 'like':
            case 'unlike': {
              const id = Number(req.trackId) || (state.current && state.current.id) || 0
              if (!id) return '没有可收藏的歌曲：当前没有播放，也没有传 trackId。'
              const data = await bridge.call('like_set', { id, like: action === 'like' }, { timeoutMs: 20_000 })
              cache.clear()
              pushPlayerCommand({ type: 'refreshLike', id, liked: action === 'like' })
              return `${action === 'like' ? '已收藏到「我喜欢的音乐」' : '已取消收藏'}：歌曲 ${id}${data && data.liked !== undefined ? '（状态 ' + (data.liked ? '已收藏' : '未收藏') + '）' : ''}。`
            }
            case 'search': {
              const found = await bridge.call('search', { q: String(req.query || ''), type: String(req.type || 'song'), limit: Math.min(20, Math.max(1, Number(req.limit) || 10)) }, { timeoutMs: 30_000 })
              const items = Array.isArray(found && found.items) ? found.items : []
              if (!items.length) return '没有搜到结果。'
              const lines = items.slice(0, 20).map((item, index) => `${index + 1}. ${item.name}${item.artist ? ' - ' + item.artist : ''}${item.id ? ' (ID ' + item.id + ')' : ''}`)
              return `搜索「${req.query}」：\n` + lines.join('\n')
            }
            default:
              return '未知操作：' + action
          }
          } catch (err) {
            return '播放器操作失败：' + String(err && err.message ? err.message : err)
          }
        },
      }))

      if (typeof tools.guard === 'function') {
        disposers.push(tools.guard((exec) => {
          const name = exec && typeof exec.name === 'string' ? exec.name : ''
          if (/(^|__)cloud_music_play$/.test(name)) {
            return '不要用 cloud_music_play 唤起桌面网易云客户端；用户想在 Harness 里边工作边听歌，请改用 netease_play 在本插件播放器内播放。'
          }
          if (/(^|__)cloud_music_login$/.test(name)) {
            return '扫码登录请让用户在网易云音乐插件面板里点「扫码登录」，不要用 cloud_music_login（它会弹桌面图片窗口）。'
          }
          return undefined
        }))
      }
    }

    if (systemPrompt && typeof systemPrompt.section === 'function') {
      disposers.push(systemPrompt.section({
        name: 'netease-music-plugin',
        order: 9000,
        text: [
          '## 音乐播放（网易云音乐插件）',
          '用户在 Harness 里听歌时，使用插件工具：`netease_play` 开始播放（支持搜索词、听歌模式 daily/heart/roam/similar_song/similar_artist、歌单/专辑 ID），`netease_player` 查询状态或暂停/继续/切歌/跳转/调音量/收藏。',
          '不要调用 `cloud_music_play`（会启动桌面网易云客户端）或 `cloud_music_login`（会弹桌面二维码窗口）；它们已被拦截。扫码登录请引导用户到左侧栏网易云面板操作。',
          '播放不会中断对话：音乐在插件播放器里播放，面板内显示底部播放条，回到对话后收进左侧栏迷你播放器。',
        ].join('\n'),
      }))
    }

    return () => {
      disposers.forEach((dispose) => {
        try {
          dispose()
        } catch (err) {
          log('工具释放失败', String(err?.message ?? err))
        }
      })
    }
  }, 'netease-music: agent tools')

  ctx.effect(() => {
    // 引擎缺失 → 自动无感安装（用户装完插件即可用，无需命令行）
    if (!installer.isInstalled()) {
      log('未检测到数据引擎，开始自动安装…')
      installer.start().then(() => {
        if (!installer.isInstalled()) return
        cache.clear()
        bridge.stop()
        bridge.ensure().catch((err) => log('自动安装后重连失败：', String(err?.message ?? err)))
      })
    } else {
      // 预热：首次打开面板时更快；失败不影响插件激活
      bridge.ensure().catch((err) => log('引擎预热失败：', String(err?.message ?? err)))
    }

    const routes = [
      /* 临时诊断：查看 clientModules 服务的 bundle 构建/缓存状态（排查完删除） */
      route(
        'clientmodules',
        wrap(async (url) => {
          const svc = ctx.get('clientModules')
          if (!svc) return { error: 'no clientModules service' }
          const id = '@local/netease-music'
          const action = String(url.searchParams.get('action') || '')
          const out = { keys: Object.keys(svc), proto: Object.getOwnPropertyNames(Object.getPrototypeOf(svc)) }
          const safe = (name, fn) => {
            try { out[name] = fn() } catch (err) { out[name] = 'ERR: ' + String(err && err.message || err) }
          }
          const marker = (text) => ({
            hasAuthHttp: String(text).includes('auth-http'),
            hasStatusAuth: String(text).includes('status:auth'),
            bytes: String(text).length,
          })
          if (action === 'graph') {
            try {
              out.graphJson = JSON.stringify(svc.graph()).slice(0, 4000)
            } catch (err) {
              out.graphErr = String(err && err.message || err)
            }
            return out
          }
          if (action === 'bundle') {
            const candidates = [
              'http://127.0.0.1/api/client-plugins/' + id,
              'http://127.0.0.1/api/client-plugins/' + id + '/client.js',
              'http://127.0.0.1/api/client-plugin/' + id,
              'http://127.0.0.1/api/client-plugins?package=' + id,
            ]
            const results = []
            for (const target of candidates) {
              try {
                const res = await svc.fetchBundle(new Request(target, { method: 'GET' }))
                const text = await res.text()
                results.push({ target, status: res.status, ...marker(text), head: text.slice(0, 120) })
              } catch (err) {
                results.push({ target, error: String(err && err.message || err) })
              }
            }
            out.bundles = results
            return out
          }
          if (action === 'rebuild') {
            try { svc.notifyGraphChanged?.() } catch (err) { out.notifyErr = String(err && err.message || err) }
            try { svc.reconcilePackage?.(id) } catch (err) { out.reconcileErr = String(err && err.message || err) }
            await new Promise((resolve) => setTimeout(resolve, 800))
            safe('afterRebuilt', () => svc.rebuilt(id))
            safe('afterBaseline', () => svc.artifactBaseline(id))
            safe('dirty', () => svc.dirty)
          }
          safe('clientPath', () => svc.clientPath(id))
          safe('artifactBaseline', () => svc.artifactBaseline(id))
          safe('rebuilt', () => svc.rebuilt(id))
          return out
        }),
      ),

      /* 轻量登录态：不等待引擎，返回最近一次快照（页面 /status 读取失败时的兜底） */
      route(
        'auth',
        wrap(async () => ({
          authed: !!lastAuth.authed,
          nickname: lastAuth.nickname,
          avatar: lastAuth.avatar,
          vipType: lastAuth.vipType,
          userId: lastAuth.userId,
          at: lastAuth.at,
          engine: existsSync(PYTHON) ? 'installed' : 'installing',
        })),
      ),

      /* 真实 HTTP 基址（客户端给 <audio> 用；dsh-app:// 协议会丢 Content-Length） */
      route(
        'httpbase',
        wrap(async () => ({ base: localHttpBase() })),
      ),

      /* 临时诊断页：同源 + 各种 audio 创建方式的 seekable 对比（排查完删除） */
      route(
        'testpage',
        (req, res) => {
          const id = String(new URL(req.url || '/', 'http://x').searchParams.get('id') || '3456695878')
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(`<!doctype html><meta charset="utf-8"><title>seek test</title>
<audio id="a1" preload="metadata" src="/netease-panel/api/audio?id=${id}&level=standard&_=1"></audio>
<script>
const a2 = document.createElement('audio')
a2.preload = 'metadata'
a2.src = '/netease-panel/api/audio?id=${id}&level=standard&_=2'
document.body.appendChild(a2)
const a3 = document.createElement('audio')
a3.preload = 'metadata'
a3.style.display = 'none'
a3.src = '/netease-panel/api/audio?id=${id}&level=standard&_=3'
document.body.appendChild(a3)
window.__info = () => [1,2,3].map((n) => {
  const a = document.getElementById('a' + n) || document.querySelectorAll('audio')[n - 1]
  return { n, duration: a && a.duration, readyState: a && a.readyState, seekable: a && a.seekable.length ? [a.seekable.start(0), a.seekable.end(0)] : [], networkState: a && a.networkState }
})
window.__play = () => Promise.all([1,2,3].map((n) => { const a = document.querySelectorAll('audio')[n-1]; return a.play().catch(() => {}) }))
window.__seek = (n, t) => { const a = document.querySelectorAll('audio')[n-1]; try { a.currentTime = t } catch (e) { return String(e) } }
</script>`)
        },
      ),

      /* 客户端诊断日志（临时/低频）：客户端把关键事件 POST 到这里，落到 bridge.log 便于真机排查 */
      route(
        'clientlog',
        handle(async (url, req) => {
          if (req.method && req.method !== 'POST') throw new PluginError('请用 POST 上报日志', 'INTERNAL')
          let body = {}
          try {
            body = await readJson(req)
          } catch (err) {
            throw err
          }
          const event = typeof body.event === 'string' ? body.event.slice(0, 80) : 'event'
          let data = ''
          try {
            data = JSON.stringify(body.data === undefined ? null : body.data).slice(0, 800)
          } catch (err) {
            data = '"<unserializable>"'
          }
          log('[client]', event, data)
          return { ok: true }
        }),
      ),

      /* 插件内播放器：客户端轮询命令 + 上报播放状态（Agent 工具通过它驱动 UI） */
      route(
        'player/commands',
        handle((url) => {
          const raw = url.searchParams.get('cursor') ?? url.searchParams.get('since')
          // 不带 cursor 的首次请求只取基线，避免刷新页面时重放历史命令
          if (raw === null || raw === undefined || raw === '') return { cursor: playerCommandSeq, commands: [] }
          const cursor = Number(raw) || 0
          return {
            cursor: playerCommandSeq,
            commands: playerCommands.filter((cmd) => cmd.seq > cursor),
          }
        }),
      ),
      route(
        'player/state',
        handle(async (url, req, res) => {
          if (req.method === 'POST') {
            let body = {}
            try {
              body = await readJson(req)
            } catch (err) {
              throw err
            }
            playerState = sanitizePlayerState(body)
            return { ok: true, at: Date.now() }
          }
          return playerState || { current: null, playing: false, position: 0, duration: 0, updatedAt: null }
        }),
      ),

      /* 运行状态：永远返回 200，方便前端区分「引擎缺失 / 未登录 / 就绪」 */
      route(
        'status',
        wrap(async () => {
          const install = installer.snapshot()
          const base = {
            engine: existsSync(PYTHON) ? 'installed' : install.state === 'running' ? 'installing' : install.state === 'failed' ? 'failed' : 'missing',
            engineDir: ENGINE_DIR,
            mcpEntry: MCP_ENTRY,
            httpBase: localHttpBase(),
            install: {
              state: install.state,
              phase: install.phase,
              error: install.error,
              installed: install.installed,
              tail: install.lines.slice(-6),
            },
          }
          try {
            const status = await bridge.call('status', {}, { timeoutMs: 20_000 })
            try {
              log('[status-resp]', 'authed=' + String(status && status.authed), 'nickname=' + String((status && status.nickname) || ''))
              lastAuth = {
                authed: !!(status && status.authed),
                nickname: (status && status.nickname) || null,
                avatar: (status && status.avatar) || null,
                vipType: Number((status && status.vipType) || 0),
                userId: (status && status.userId) || null,
                at: Date.now(),
              }
            } catch (err) { /* ignore */ }
            return { bridge: 'ready', ...base, ...status }
          } catch (err) {
            return {
              bridge: 'error',
              ...base,
              authed: false,
              anonymous: false,
              error: String(err?.message ?? err),
              code: err?.code || 'BRIDGE',
            }
          }
        }),
      ),

      /* 扫码登录 */
      route(
        'login/start',
        handle(async (url, req) => {
          if (req.method && req.method !== 'POST') throw new PluginError('请用 POST 开始登录', 'INTERNAL')
          const data = await bridge.call('login_start', {}, { timeoutMs: 30_000 })
          loginKey = data?.key ?? null
          log('已生成登录二维码')
          return data
        }),
      ),

      route(
        'login/check',
        handle(async (url) => {
          const key = url.searchParams.get('key') || loginKey
          if (!key) throw new PluginError('登录会话不存在，请重新生成二维码', 'NOT_FOUND')
          const data = await bridge.call('login_check', { key }, { timeoutMs: 25_000 })
          if (data?.state === 'ok') {
            invalidate()
            log('扫码登录成功')
          }
          return data
        }),
      ),

      route(
        'logout',
        handle(async (url, req) => {
          if (req.method && req.method !== 'POST') throw new PluginError('请用 POST 退出登录', 'INTERNAL')
          await bridge.call('logout', {}, { timeoutMs: 20_000 }).catch(() => null)
          invalidate()
          return { authed: false }
        }),
      ),

      /* 首页聚合 */
      route(
        'home',
        handle(() => cache.wrap('home', 10 * 60 * 1000, () => bridge.call('home', {}, { timeoutMs: 40_000 }))),
      ),
      route(
        'daily',
        handle(() => cache.wrap('daily', 10 * 60 * 1000, () => bridge.call('daily', {}, { timeoutMs: 40_000 }))),
      ),
      route(
        'playlists',
        handle(() =>
          cache.wrap('playlists', 10 * 60 * 1000, () => bridge.call('my_playlists', {}, { timeoutMs: 40_000 })),
        ),
      ),
      route(
        'playlist',
        handle((url) => {
          const id = num(url.searchParams.get('id'))
          if (!id) throw new PluginError('缺少歌单 id', 'NOT_FOUND')
          return cache.wrap(`playlist:${id}`, 30 * 60 * 1000, () =>
            bridge.call('playlist', { id }, { timeoutMs: 60_000 }),
          )
        }),
      ),
      route(
        'artist',
        handle((url) => {
          const id = num(url.searchParams.get('id'))
          if (!id) throw new PluginError('缺少歌手 id', 'NOT_FOUND')
          return cache.wrap(`artist:${id}`, 30 * 60 * 1000, () =>
            bridge.call('artist', { id }, { timeoutMs: 60_000 }),
          )
        }),
      ),
      route(
        'album',
        handle((url) => {
          const id = num(url.searchParams.get('id'))
          if (!id) throw new PluginError('缺少专辑 id', 'NOT_FOUND')
          return cache.wrap(`album:${id}`, 30 * 60 * 1000, () => bridge.call('album', { id }, { timeoutMs: 60_000 }))
        }),
      ),
      route(
        'search',
        handle((url) => {
          const q = String(url.searchParams.get('q') || '').trim()
          if (!q) throw new PluginError('搜索关键词为空', 'NOT_FOUND')
          const type = String(url.searchParams.get('type') || 'song')
          const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 30))
          return cache.wrap(`search:${type}:${limit}:${q}`, 3 * 60 * 1000, () =>
            bridge.call('search', { q, type, limit }, { timeoutMs: 30_000 }),
          )
        }),
      ),
      route(
        'subscriptions',
        handle((url) => {
          const category = url.searchParams.get('category') === 'albums' ? 'albums' : 'artists'
          return cache.wrap(`subs:${category}`, 30 * 60 * 1000, () =>
            bridge.call('subscriptions', { category }, { timeoutMs: 40_000 }),
          )
        }),
      ),
      /* 听歌模式：心动 / 漫游 / 相似歌曲 / 相似艺人 / 每日推荐（首页轮播用） */
      /* 歌曲收藏（红心）：查询批量状态 / 设置 */
      route(
        'like/status',
        handle((url) => {
          const raw = String(url.searchParams.get('ids') || '')
          const ids = raw
            .split(',')
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isFinite(v) && v > 0)
            .slice(0, 50)
          if (!ids.length) throw new PluginError('缺少歌曲 id', 'NOT_FOUND')
          const key = `like:${ids.slice().sort((a, b) => a - b).join(',')}`
          return cache.wrap(key, 30 * 1000, () => bridge.call('like_status', { ids }, { timeoutMs: 20_000 }))
        }),
      ),
      route(
        'like',
        handle(async (url, req) => {
          if (req.method && req.method !== 'POST') throw new PluginError('请用 POST 收藏歌曲', 'INTERNAL')
          const body = await readJson(req)
          const id = num(body && body.id)
          if (!id) throw new PluginError('缺少歌曲 id', 'NOT_FOUND')
          const like = body.like !== false
          const data = await bridge.call('like_set', { id, like }, { timeoutMs: 20_000 })
          cache.clear()
          return { ok: true, liked: !!(data && data.liked !== undefined ? data.liked : like) }
        }),
      ),

      route(
        'mode',
        handle((url) => {
          const type = String(url.searchParams.get('type') || 'daily')
          if (!MODE_TYPES.has(type)) throw new PluginError('不支持的模式：' + type, 'NOT_FOUND')
          const songId = num(url.searchParams.get('songId'))
          const artistId = num(url.searchParams.get('artistId'))
          const limit = Math.min(60, Math.max(5, Number(url.searchParams.get('limit')) || 30))
          return cache.wrap(`mode:${type}:${songId || 0}:${artistId || 0}:${limit}`, 5 * 60 * 1000, () =>
            bridge.call('mode', { type, seedSongId: songId, seedArtistId: artistId, limit }, { timeoutMs: 45_000 }),
          )
        }),
      ),

      route(
        'song/url',
        handle((url) => {
          const id = num(url.searchParams.get('id'))
          if (!id) throw new PluginError('缺少歌曲 id', 'NOT_FOUND')
          const rawLevel = String(url.searchParams.get('level') || 'auto').toLowerCase()
          const level = AUDIO_LEVELS.has(rawLevel) ? rawLevel : 'auto'
          return cache.wrap(`songurl:${id}:${level}`, 5 * 60 * 1000, () =>
            bridge.call('song_url', { id, level }, { timeoutMs: 25_000 }),
          )
        }),
      ),
      route(
        'lyrics',
        handle((url) => {
          const id = num(url.searchParams.get('id'))
          if (!id) throw new PluginError('缺少歌曲 id', 'NOT_FOUND')
          return cache.wrap(`lyrics:${id}`, 60 * 60 * 1000, () =>
            bridge.call('lyrics', { id }, { timeoutMs: 25_000 }),
          )
        }),
      ),

      /* 字节流：不走信封 */
      route('audio', audioRoute),
      route('img', imageRoute),
      route('icon', iconRoute),

      /* 无感安装：面板「引擎缺失」卡片调用它；安装完成后自动重连 bridge */
      route(
        'setup/install',
        handle(async (url, req) => {
          if (req.method && req.method !== 'POST') throw new PluginError('请用 POST 开始安装', 'INTERNAL')
          installer.start().then(() => {
            if (installer.isInstalled()) {
              cache.clear()
              loginKey = null
              bridge.stop()
              bridge.ensure().catch((err) => log('安装后重连失败：', String(err?.message ?? err)))
            }
          })
          return installer.snapshot()
        }),
      ),
      route('setup/install/log', handle(() => installer.snapshot())),

      route(
        'refresh',
        handle((url, req) => {
          if (req.method && req.method !== 'POST') throw new PluginError('请用 POST 刷新', 'INTERNAL')
          cache.clear()
          return { cleared: true, cacheSize: cache.size }
        }),
      ),
    ].map((r) => ctx.webServer.register(r))

    return () => {
      routes.forEach((dispose) => {
        try {
          dispose()
        } catch (err) {
          log('路由释放失败', String(err?.message ?? err))
        }
      })
      bridge.stop()
    }
  }, 'netease-music: routes')
}
