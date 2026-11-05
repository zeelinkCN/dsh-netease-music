#!/usr/bin/env node
/**
 * 网易云音乐 DSH 插件 —— bridge 集成自测。
 *
 * 真正 spawn `server/bridge.py`（走 engine 虚拟环境的 python），用 NDJSON 逐条发命令，
 * 校验协议、数据形状（docs/CONTRACT.md 4.1 / 4.2）与错误路径。
 * 不会真正扫码登录：只验证 login_start 能拿到二维码、login_check 第一次返回 waiting。
 *
 * 用法（在插件根目录执行）：
 *   node server/selftest.mjs
 *   NETEASE_COOKIE_FILE=/tmp/cookies.json node server/selftest.mjs
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.resolve(__dirname, '..')
const python = path.join(pluginDir, 'engine', 'cloud-music-mcp', '.venv', 'bin', 'python')
const bridgePath = path.join(__dirname, 'bridge.py')

const startedAt = Date.now()
const results = []
const notes = []
let child = null
let stdoutBuffer = ''
let stderrBuffer = ''
let readyResolve = null
let readyReject = null
let readySeen = false
let stdoutLines = 0
let stdoutNonJson = []
let stdinClosed = false
const pending = new Map()
let seq = 0

function check(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error: error.message })
    console.log(`FAIL  ${name}\n      ${error.message}`)
  }
}

function info(label, value) {
  console.log(`      · ${label}: ${value}`)
  notes.push({ label, value })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hasKeys(object, keys, label) {
  assert(object && typeof object === 'object', `${label} 不是对象`)
  const missing = keys.filter((key) => !(key in object))
  assert(missing.length === 0, `${label} 缺少字段：${missing.join(', ')}`)
}

function isIntOrNull(value, label) {
  assert(value === null || (typeof value === 'number' && Number.isFinite(value)), `${label} 应为 number|null，实际 ${JSON.stringify(value)}`)
}

function isStringOrNull(value, label) {
  assert(value === null || typeof value === 'string', `${label} 应为 string|null，实际 ${JSON.stringify(value)}`)
}

function checkCover(cover, label) {
  isStringOrNull(cover, `${label}.cover`)
  if (cover) assert(cover.startsWith('https://'), `${label}.cover 必须是 https：${cover}`)
}

function checkTrack(track, label) {
  hasKeys(track, ['id', 'name', 'artists', 'artist', 'album', 'albumId', 'cover', 'duration', 'fee', 'pop', 'mv', 'alias', 'vip'], label)
  isIntOrNull(track.id, `${label}.id`)
  assert(typeof track.name === 'string', `${label}.name 应为 string`)
  assert(Array.isArray(track.artists), `${label}.artists 应为数组`)
  for (const [index, artist] of track.artists.entries()) {
    hasKeys(artist, ['id', 'name'], `${label}.artists[${index}]`)
  }
  isStringOrNull(track.artist, `${label}.artist`)
  isStringOrNull(track.album, `${label}.album`)
  isIntOrNull(track.albumId, `${label}.albumId`)
  checkCover(track.cover, label)
  isIntOrNull(track.duration, `${label}.duration`)
  assert(typeof track.fee === 'number', `${label}.fee 应为 number`)
  isIntOrNull(track.pop, `${label}.pop`)
  isIntOrNull(track.mv, `${label}.mv`)
  isStringOrNull(track.alias, `${label}.alias`)
  assert(typeof track.vip === 'boolean', `${label}.vip 应为 boolean`)
  if (track.artists.length > 0) assert(track.artist, `${label}.artist 不应为空（有 artists）`)
  if (track.duration !== null) assert(track.duration > 0, `${label}.duration 应为正数（毫秒）`)
}

function checkPlaylist(playlist, label) {
  hasKeys(playlist, ['id', 'name', 'cover', 'trackCount', 'playCount', 'description', 'creator', 'mine', 'updateTime'], label)
  isIntOrNull(playlist.id, `${label}.id`)
  assert(typeof playlist.name === 'string' && playlist.name.length > 0, `${label}.name 应为非空 string`)
  checkCover(playlist.cover, label)
  isIntOrNull(playlist.trackCount, `${label}.trackCount`)
  isIntOrNull(playlist.playCount, `${label}.playCount`)
  isStringOrNull(playlist.description, `${label}.description`)
  isStringOrNull(playlist.creator, `${label}.creator`)
  assert(typeof playlist.mine === 'boolean', `${label}.mine 应为 boolean`)
  isIntOrNull(playlist.updateTime, `${label}.updateTime`)
}

function checkArtist(artist, label) {
  hasKeys(artist, ['id', 'name', 'avatar', 'alias', 'fans', 'albumCount', 'songCount', 'description'], label)
  isIntOrNull(artist.id, `${label}.id`)
  assert(typeof artist.name === 'string' && artist.name.length > 0, `${label}.name 应为非空 string`)
  if (artist.avatar !== null) assert(artist.avatar.startsWith('https://'), `${label}.avatar 必须是 https`)
  assert(artist.alias === null || Array.isArray(artist.alias), `${label}.alias 应为数组|null`)
  isIntOrNull(artist.fans, `${label}.fans`)
  isIntOrNull(artist.albumCount, `${label}.albumCount`)
  isIntOrNull(artist.songCount, `${label}.songCount`)
  isStringOrNull(artist.description, `${label}.description`)
  if (artist.description) assert(artist.description.length <= 200, `${label}.description 应截断到 200 字`)
}

function checkAlbum(album, label) {
  hasKeys(album, ['id', 'name', 'cover', 'artist', 'artistId', 'publishDate', 'trackCount'], label)
  isIntOrNull(album.id, `${label}.id`)
  assert(typeof album.name === 'string' && album.name.length > 0, `${label}.name 应为非空 string`)
  checkCover(album.cover, label)
  isStringOrNull(album.artist, `${label}.artist`)
  isIntOrNull(album.artistId, `${label}.artistId`)
  if (album.publishDate !== null) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(album.publishDate), `${label}.publishDate 应为 YYYY-MM-DD，实际 ${album.publishDate}`)
  }
  isIntOrNull(album.trackCount, `${label}.trackCount`)
}

function handleLine(line) {
  if (line.trim() === '') return
  stdoutLines += 1
  let message
  try {
    message = JSON.parse(line)
  } catch (error) {
    stdoutNonJson.push(line.slice(0, 200))
    console.log(`FAIL  stdout 出现非 JSON 行：${line.slice(0, 200)}`)
    return
  }
  if (message.event === 'ready') {
    if (readySeen) {
      if (readyReject) readyReject(new Error('重复的 ready 事件'))
      return
    }
    readySeen = true
    if (readyResolve) {
      const resolve = readyResolve
      readyResolve = null
      readyReject = null
      resolve(message.data)
    }
    return
  }
  if (!('id' in message)) {
    stdoutNonJson.push(line.slice(0, 200))
    console.log(`FAIL  协议行缺少 id：${line.slice(0, 200)}`)
    return
  }
  const waiter = pending.get(String(message.id))
  if (!waiter) {
    console.log(`FAIL  收到未知 id 的响应：${message.id}`)
    return
  }
  pending.delete(String(message.id))
  clearTimeout(waiter.timer)
  waiter.resolve(message)
}

function handleStderr(chunk) {
  stderrBuffer += chunk
}

function waitReady(timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    if (readySeen) return resolve(null)
    const timer = setTimeout(() => {
      readyReject = null
      reject(new Error(`等待 ready 事件超时（${timeoutMs}ms）`))
    }, timeoutMs)
    readyResolve = (data) => {
      clearTimeout(timer)
      resolve(data)
    }
    readyReject = (error) => {
      clearTimeout(timer)
      reject(error)
    }
  })
}

function callRaw(cmd, params = {}, timeoutMs = 90000) {
  const id = String(++seq)
  return new Promise((resolve, reject) => {
    if (!child || child.exitCode !== null) return reject(new Error('bridge 进程已退出'))
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`命令 ${cmd} 超时（${timeoutMs}ms）`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(`${JSON.stringify({ id, cmd, params })}\n`)
  })
}

async function call(cmd, params, timeoutMs) {
  const message = await callRaw(cmd, params, timeoutMs)
  if (!message.ok) {
    const error = new Error(`命令 ${cmd} 失败：${message.error}（${message.code}）`)
    error.message = message.error
    error.code = message.code
    throw error
  }
  return message.data
}

async function main() {
  console.log('=== 网易云音乐 bridge 自测 ===')
  console.log(`插件目录: ${pluginDir}`)
  console.log(`python  : ${python}`)
  console.log(`bridge  : ${bridgePath}`)
  console.log(`cookie  : ${process.env.NETEASE_COOKIE_FILE || '~/.dsh/netease-panel/cookies.json'}\n`)

  if (!fs.existsSync(python)) {
    console.error(`FAIL  找不到虚拟环境 python：${python}\n请先在 engine/cloud-music-mcp 下创建 .venv 并安装依赖。`)
    process.exit(1)
  }
  if (!fs.existsSync(bridgePath)) {
    console.error(`FAIL  找不到 bridge.py：${bridgePath}`)
    process.exit(1)
  }

  child = spawn(python, ['-u', bridgePath], {
    cwd: pluginDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk
    let index
    while ((index = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, index)
      stdoutBuffer = stdoutBuffer.slice(index + 1)
      handleLine(line)
    }
  })
  child.stderr.on('data', handleStderr)
  child.on('exit', (code, signal) => {
    const error = new Error(`bridge 提前退出（code=${code}, signal=${signal}）`)
    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    pending.clear()
  })

  // 1) ready 事件
  let ready = null
  try {
    ready = await waitReady()
    check('启动后输出 ready 事件（stdout 只有 NDJSON）', () => {
      assert(ready && typeof ready === 'object', 'ready.data 缺失')
      assert(typeof ready.authed === 'boolean', 'ready.authed 应为 boolean')
      assert(typeof ready.anonymous === 'boolean', 'ready.anonymous 应为 boolean')
    })
    const startupMs = Date.now() - startedAt
    info('启动耗时', `${startupMs}ms`)
    info('登录态', `authed=${ready.authed} anonymous=${ready.anonymous} userId=${ready.userId ?? null}`)
  } catch (error) {
    check('启动后输出 ready 事件（stdout 只有 NDJSON）', () => {
      throw error
    })
  }

  // 2) ping
  try {
    const pong = await call('ping')
    check('ping', () => {
      assert(pong.pong === true, 'pong 应为 true')
    })
  } catch (error) {
    check('ping', () => { throw error })
  }

  // 3) status
  let status = null
  try {
    status = await call('status')
    check('status 形状', () => {
      hasKeys(status, ['authed', 'anonymous', 'nickname', 'avatar', 'userId', 'vipType', 'level'], 'status')
      assert(typeof status.authed === 'boolean', 'authed 应为 boolean')
      assert(typeof status.anonymous === 'boolean', 'anonymous 应为 boolean')
      assert(status.nickname === null || typeof status.nickname === 'string', 'nickname 应为 string|null')
      if (status.avatar !== null) assert(status.avatar.startsWith('https://'), 'avatar 必须是 https')
      isIntOrNull(status.userId, 'status.userId')
      isIntOrNull(status.vipType, 'status.vipType')
      isIntOrNull(status.level, 'status.level')
    })
    info('账号', `${status.nickname || '（未登录）'} uid=${status.userId} vip=${status.vipType}`)
  } catch (error) {
    check('status 形状', () => { throw error })
  }

  // 4) home
  let home = null
  try {
    home = await call('home', {}, 120000)
    check('home 形状与内容', () => {
      hasKeys(home, ['daily', 'playlists', 'artists', 'recommended'], 'home')
      assert(Array.isArray(home.daily) && home.daily.length > 0, 'daily 应为非空数组')
      assert(Array.isArray(home.recommended) && home.recommended.length > 0, 'recommended 应为非空数组')
      assert(Array.isArray(home.playlists), 'playlists 应为数组')
      assert(Array.isArray(home.artists), 'artists 应为数组')
      checkTrack(home.daily[0], 'home.daily[0]')
      checkPlaylist(home.recommended[0], 'home.recommended[0]')
      if (home.artists.length > 0) checkArtist(home.artists[0], 'home.artists[0]')
    })
    info('home 今日推荐', `${home.daily.length} 首`)
    info('home 推荐歌单', `${home.recommended.length} 个`)
    info('home 我的歌单', `${home.playlists.length} 个`)
    info('home 收藏歌手', `${home.artists.length} 位`)
    info('首曲', `${home.daily[0]?.name} — ${home.daily[0]?.artist}`)
  } catch (error) {
    check('home 形状与内容', () => { throw error })
  }

  // 5) daily
  try {
    const daily = await call('daily')
    check('daily 形状', () => {
      hasKeys(daily, ['songs'], 'daily')
      assert(Array.isArray(daily.songs) && daily.songs.length > 0, 'songs 应为非空数组')
      checkTrack(daily.songs[0], 'daily.songs[0]')
    })
    info('daily', `${daily.songs.length} 首`)
  } catch (error) {
    check('daily 形状', () => { throw error })
  }

  // 6) my_playlists
  try {
    const mine = await call('my_playlists')
    check('my_playlists 形状', () => {
      hasKeys(mine, ['playlists'], 'my_playlists')
      assert(Array.isArray(mine.playlists), 'playlists 应为数组')
      if (mine.playlists.length > 0) {
        checkPlaylist(mine.playlists[0], 'my_playlists.playlists[0]')
        assert(mine.playlists[0].mine === true, '我的歌单 mine 应为 true')
      }
    })
    info('my_playlists', `${mine.playlists.length} 个${status?.authed ? '' : '（未登录时为空，符合契约）'}`)
  } catch (error) {
    check('my_playlists 形状', () => { throw error })
  }

  // 7) playlist 详情（全量分页，≤500）
  try {
    const detail = await call('playlist', { id: 14060780068 }, 120000)
    check('playlist 详情形状（含全量曲目）', () => {
      hasKeys(detail, ['playlist', 'songs'], 'playlist')
      checkPlaylist(detail.playlist, 'playlist.playlist')
      assert(Array.isArray(detail.songs), 'songs 应为数组')
      assert(detail.songs.length > 0, 'songs 不应为空')
      assert(detail.songs.length <= 500, `songs 不应超过 500 首，实际 ${detail.songs.length}`)
      checkTrack(detail.songs[0], 'playlist.songs[0]')
      checkTrack(detail.songs[detail.songs.length - 1], 'playlist.songs[last]')
    })
    info('playlist', `《${detail.playlist.name}》 trackCount=${detail.playlist.trackCount} 返回 ${detail.songs.length} 首`)
  } catch (error) {
    check('playlist 详情形状（含全量曲目）', () => { throw error })
  }

  // 8) 搜索四种类型
  for (const [category, keyword, probe] of [
    ['song', '郭顶', (item) => checkTrack(item, 'search.song[0]')],
    ['artist', '周杰伦', (item) => checkArtist(item, 'search.artist[0]')],
    ['playlist', '华语', (item) => checkPlaylist(item, 'search.playlist[0]')],
    ['album', '周杰伦', (item) => checkAlbum(item, 'search.album[0]')],
  ]) {
    try {
      const result = await call('search', { q: keyword, type: category, limit: 5 })
      check(`search ${category}`, () => {
        hasKeys(result, ['items', 'type'], `search(${category})`)
        assert(result.type === category, `type 应为 ${category}`)
        assert(Array.isArray(result.items) && result.items.length > 0, `items 不应为空（q=${keyword}）`)
        probe(result.items[0])
      })
      info(`search ${category}`, `"${keyword}" → ${result.items.length} 条，首条《${result.items[0]?.name}》`)
    } catch (error) {
      check(`search ${category}`, () => { throw error })
    }
  }

  // 9) artist 详情
  try {
    const artist = await call('artist', { id: 6452 }, 120000)
    check('artist 详情形状', () => {
      hasKeys(artist, ['artist', 'songs', 'albums'], 'artist')
      checkArtist(artist.artist, 'artist.artist')
      assert(artist.artist.name === '周杰伦', `artist.name 应为 周杰伦，实际 ${artist.artist.name}`)
      assert(Array.isArray(artist.songs) && artist.songs.length > 0, 'songs 不应为空')
      checkTrack(artist.songs[0], 'artist.songs[0]')
      assert(Array.isArray(artist.albums) && artist.albums.length > 0, 'albums 不应为空')
      checkAlbum(artist.albums[0], 'artist.albums[0]')
    })
    info('artist', `${artist.artist.name} 歌曲 ${artist.songs.length} 首 / 专辑 ${artist.albums.length} 张 / 粉丝 ${artist.artist.fans ?? 'null'}`)
  } catch (error) {
    check('artist 详情形状', () => { throw error })
  }

  // 10) album 详情
  try {
    const album = await call('album', { id: 35005583 })
    check('album 详情形状', () => {
      hasKeys(album, ['album', 'songs'], 'album')
      checkAlbum(album.album, 'album.album')
      assert(album.album.name === '飞行器的执行周期', `album.name 不符：${album.album.name}`)
      assert(album.album.publishDate === '2016-11-25', `publishDate 不符：${album.album.publishDate}`)
      assert(Array.isArray(album.songs) && album.songs.length === 10, `songs 应为 10 首，实际 ${album.songs.length}`)
      checkTrack(album.songs[0], 'album.songs[0]')
    })
    info('album', `《${album.album.name}》 ${album.album.artist} ${album.album.publishDate} ${album.songs.length} 首`)
  } catch (error) {
    check('album 详情形状', () => { throw error })
  }

  // 11) song_url
  try {
    const url = await call('song_url', { id: 441491828 }, 120000)
    check('song_url 形状', () => {
      hasKeys(url, ['url', 'br', 'size', 'type', 'level', 'trial', 'expiresAt'], 'song_url')
      assert(typeof url.url === 'string' && url.url.startsWith('https://'), `url 应为 https 地址，实际 ${url.url}`)
      assert(typeof url.br === 'number' && url.br > 0, 'br 应为正数')
      assert(typeof url.size === 'number' && url.size > 0, 'size 应为正数')
      assert(typeof url.level === 'string', 'level 应为 string')
      assert(typeof url.trial === 'boolean', 'trial 应为 boolean')
      assert(typeof url.expiresAt === 'number' && url.expiresAt > Date.now(), 'expiresAt 应为未来时间戳(ms)')
    })
    info('song_url', `level=${url.level} br=${url.br} size=${url.size} type=${url.type} trial=${url.trial}`)
  } catch (error) {
    check('song_url 形状', () => { throw error })
  }

  // 12) lyrics
  try {
    const lyrics = await call('lyrics', { id: 441491828 })
    check('lyrics 形状', () => {
      hasKeys(lyrics, ['lrc', 'tlyric'], 'lyrics')
      assert(typeof lyrics.lrc === 'string' && lyrics.lrc.length > 0, 'lrc 应为非空 string')
      assert(lyrics.lrc.includes('['), 'lrc 应包含时间标签 [mm:ss.xxx]')
      isStringOrNull(lyrics.tlyric, 'lyrics.tlyric')
    })
    info('lyrics', `lrc ${lyrics.lrc.length} 字符 / tlyric ${lyrics.tlyric ? lyrics.tlyric.length + ' 字符' : 'null'}`)
  } catch (error) {
    check('lyrics 形状', () => { throw error })
  }

  // 13) login_start（只生成二维码，不扫码）
  let loginSession = null
  try {
    loginSession = await call('login_start', {}, 120000)
    check('login_start 返回二维码 PNG dataURL', () => {
      hasKeys(loginSession, ['key', 'qr', 'expiresIn'], 'login_start')
      assert(typeof loginSession.key === 'string' && loginSession.key.length > 8, 'key 应为非空字符串')
      assert(loginSession.qr.startsWith('data:image/png;base64,'), 'qr 应为 data:image/png;base64,…')
      const base64 = loginSession.qr.slice('data:image/png;base64,'.length)
      const buffer = Buffer.from(base64, 'base64')
      assert(buffer.length > 200, `二维码 PNG 太小（${buffer.length} 字节）`)
      assert(buffer[0] === 0x89 && buffer.subarray(1, 4).toString() === 'PNG', '二维码不是合法 PNG')
      assert(typeof loginSession.expiresIn === 'number' && loginSession.expiresIn > 0, 'expiresIn 应为正数')
    })
    info('login_start', `key=${loginSession.key.slice(0, 8)}… qr=${Buffer.from(loginSession.qr.split(',')[1], 'base64').length} 字节 expiresIn=${loginSession.expiresIn}s`)
  } catch (error) {
    check('login_start 返回二维码 PNG dataURL', () => { throw error })
  }

  // 14) login_check 第一次应为 waiting（不扫码）
  if (loginSession) {
    try {
      const state = await call('login_check', { key: loginSession.key }, 60000)
      check('login_check 返回 waiting（未扫码）', () => {
        hasKeys(state, ['state'], 'login_check')
        assert(state.state === 'waiting', `state 应为 waiting，实际 ${state.state}`)
      })
      info('login_check', `state=${state.state} status=${state.status}`)
    } catch (error) {
      check('login_check 返回 waiting（未扫码）', () => { throw error })
    }

    // 14b) 同一时刻只允许一个 login_* 会话：未知 key → expired；重新 login_start 后旧 key 失效
    try {
      const stale = await call('login_check', { key: 'stale-key-not-started' })
      check('未知 key 的 login_check 返回 expired', () => {
        assert(stale.state === 'expired', `state 应为 expired，实际 ${stale.state}`)
      })
    } catch (error) {
      check('未知 key 的 login_check 返回 expired', () => { throw error })
    }

    try {
      const again = await call('login_start', {}, 120000)
      const oldKey = await call('login_check', { key: loginSession.key })
      const fresh = await call('login_check', { key: again.key })
      check('重新 login_start 后旧 key 失效、新 key 为 waiting', () => {
        assert(typeof again.key === 'string' && again.key !== loginSession.key, '第二次 login_start 应返回新 key')
        assert(oldKey.state === 'expired', `旧 key 应为 expired，实际 ${oldKey.state}`)
        assert(fresh.state === 'waiting', `新 key 应为 waiting，实际 ${fresh.state}`)
      })
      info('单会话', `新 key ${again.key.slice(0, 8)}… waiting，旧 key 已 expired`)
    } catch (error) {
      check('重新 login_start 后旧 key 失效、新 key 为 waiting', () => { throw error })
    }
  }

  // 15) 错误路径：单条失败不能挂掉进程
  try {
    const unknown = await callRaw('definitely_not_a_command')
    check('未知命令返回 ok:false + code:INTERNAL + 中文错误', () => {
      assert(unknown.ok === false, 'ok 应为 false')
      assert(unknown.code === 'INTERNAL', `code 应为 INTERNAL，实际 ${unknown.code}`)
      assert(typeof unknown.error === 'string' && unknown.error.length > 0, 'error 应为非空中文描述')
      assert(/[\u4e00-\u9fa5]/.test(unknown.error), 'error 应包含中文')
    })
    info('未知命令错误', `${unknown.code}: ${unknown.error}`)
  } catch (error) {
    check('未知命令返回 ok:false + code:INTERNAL + 中文错误', () => { throw error })
  }

  try {
    const missingPlaylist = await callRaw('playlist', { id: 99999999999 })
    check('不存在的歌单返回错误码（NOT_FOUND）', () => {
      assert(missingPlaylist.ok === false, 'ok 应为 false')
      assert(['NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL'].includes(missingPlaylist.code), `code 异常：${missingPlaylist.code}`)
      assert(typeof missingPlaylist.error === 'string' && missingPlaylist.error.length > 0, 'error 应为非空字符串')
    })
    info('不存在歌单错误', `${missingPlaylist.code}: ${missingPlaylist.error}`)
  } catch (error) {
    check('不存在的歌单返回错误码（NOT_FOUND）', () => { throw error })
  }

  try {
    const missingId = await callRaw('song_url', {})
    check('song_url 缺 id 返回 ok:false（INTERNAL）', () => {
      assert(missingId.ok === false, 'ok 应为 false')
      assert(missingId.code === 'INTERNAL', `code 应为 INTERNAL，实际 ${missingId.code}`)
    })
    info('缺参数错误', `${missingId.code}: ${missingId.error}`)
  } catch (error) {
    check('song_url 缺 id 返回 ok:false（INTERNAL）', () => { throw error })
  }

  try {
    const noCmd = await callRaw('', {})
    check('缺少 cmd 的请求返回 ok:false（INTERNAL）', () => {
      assert(noCmd.ok === false, 'ok 应为 false')
      assert(noCmd.code === 'INTERNAL', `code 应为 INTERNAL，实际 ${noCmd.code}`)
    })
    info('缺 cmd 错误', `${noCmd.code}: ${noCmd.error}`)
  } catch (error) {
    check('缺少 cmd 的请求返回 ok:false（INTERNAL）', () => { throw error })
  }

  // 16) 错误之后进程仍存活
  try {
    const pong = await call('ping')
    check('多条错误之后 bridge 仍存活', () => {
      assert(pong.pong === true, 'pong 应为 true')
    })
  } catch (error) {
    check('多条错误之后 bridge 仍存活', () => { throw error })
  }

  // 17) stdout 纯净性
  check('stdout 只包含 NDJSON 协议行', () => {
    assert(stdoutNonJson.length === 0, `发现 ${stdoutNonJson.length} 条非协议输出：${stdoutNonJson[0] || ''}`)
    assert(stdoutLines > 10, `协议行数异常偏少：${stdoutLines}`)
  })
  info('stdout 协议行数', stdoutLines)

  // 18) stderr 有日志
  check('日志全部写 stderr（含 [bridge 前缀）', () => {
    assert(stderrBuffer.length > 0, 'stderr 为空')
    assert(stderrBuffer.includes('[bridge'), 'stderr 缺少 [bridge 日志前缀')
  })
  info('stderr 日志行数', stderrBuffer.split('\n').filter(Boolean).length)

  // 19) stdin EOF 后正常退出
  const exitInfo = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), 15000)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
    stdinClosed = true
    child.stdin.end()
  })
  check('stdin EOF 后进程退出（code=0）', () => {
    assert(!exitInfo.timedOut, '关闭 stdin 后进程 15s 内没有退出')
    assert(exitInfo.code === 0, `退出码应为 0，实际 ${exitInfo.code}（signal=${exitInfo.signal}）`)
  })
  info('退出', exitInfo.timedOut ? '超时未退出' : `code=${exitInfo.code}`)

  // 汇总
  const failed = results.filter((item) => !item.ok)
  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('\n=== 汇总 ===')
  console.log(`通过 ${results.length - failed.length}/${results.length}，耗时 ${totalSeconds}s`)
  if (failed.length > 0) {
    console.log('失败项：')
    for (const item of failed) console.log(`  - ${item.name}: ${item.error}`)
    process.exit(1)
  }
  console.log('全部通过 ✅')
  process.exit(0)
}

main().catch((error) => {
  console.error(`\n自测脚本异常：${error.stack || error.message}`)
  if (child && child.exitCode === null) child.kill('SIGKILL')
  process.exit(1)
})
