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
 * 插件入口
 * ------------------------------------------------------------------ */
export function apply(ctx) {
  const cache = createCache()
  const bridge = new Bridge({ python: PYTHON, script: BRIDGE, cookieFile: COOKIE_FILE })
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
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
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
    const headers = { 'User-Agent': UA, Referer: 'https://music.163.com/' }
    if (req.headers.range) headers.Range = String(req.headers.range)
    let upstream
    try {
      upstream = await fetch(info.url, { headers, redirect: 'follow', signal: controller.signal })
    } catch (err) {
      if (res.writableEnded) return
      return fail(res, `音源连接失败：${err?.message ?? err}`, 'NETWORK')
    }
    if (!upstream.ok && upstream.status !== 206) {
      if (res.writableEnded) return
      return fail(res, `音源返回 HTTP ${upstream.status}`, 'NETWORK')
    }
    res.statusCode = upstream.status === 206 ? 206 : 200
    const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']
    for (const key of passthrough) {
      const value = upstream.headers.get(key)
      if (value) res.setHeader(key, value)
    }
    // 上游把 FLAC/无损也常标成 audio/mpeg，这里按真实编码覆盖，否则 <audio> 解码会犹豫
    const ext = String(info.type || '').toLowerCase().replace('.', '')
    res.setHeader('Content-Type', AUDIO_MIME[ext] || 'audio/mpeg')
    if (!res.getHeader('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')
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
      /* 运行状态：永远返回 200，方便前端区分「引擎缺失 / 未登录 / 就绪」 */
      route(
        'status',
        wrap(async () => {
          const install = installer.snapshot()
          const base = {
            engine: existsSync(PYTHON) ? 'installed' : install.state === 'running' ? 'installing' : install.state === 'failed' ? 'failed' : 'missing',
            engineDir: ENGINE_DIR,
            mcpEntry: MCP_ENTRY,
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
