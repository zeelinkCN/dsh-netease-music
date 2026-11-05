#!/usr/bin/env node
/**
 * 网易云音乐 client 离线验收后端（只服务 netease-panel-selftest，不碰插件源码）
 *
 *  - 静态服务：harness.html / client.js / React 18 UMD
 *  - 完整 mock /netease-panel/api/*（严格按 CONTRACT.md 第 5 节信封）
 *  - 封面全部用本地生成的渐变 SVG data URL（离线、可截图、不依赖网络）
 *  - /audio 返回本地生成的短 WAV，支持 Range / 206
 *  - /login/start 返回固定二维码 SVG；/login/check 前 2 次 waiting，第 3 次 scanned，第 4 次 ok
 *  - /__config 切换 未登录 / 已登录 / 错误；/__calls 请求计数；/__reset 重置
 *
 * 用法：node server.mjs            （随机端口，stdout 打印 {"port":N}）
 *       NM_CLIENT=/abs/path.js node server.mjs   覆盖 client.js 路径（基础设施自测用）
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKSPACE = join(HERE, '..')
const CLIENT = process.env.NM_CLIENT
  ? resolve(process.env.NM_CLIENT)
  : join(WORKSPACE, 'client.js')

/* ------------------------------------------------------------------ *
 * 配置（/__config 可改）
 * ------------------------------------------------------------------ */
const cfg = {
  authed: false,
  bridge: 'ready',       // ready | starting | error
  errorMode: null,       // null | 'home' | 'all'  → 返回 {ok:false,...}
  slowMs: 0,             // 人为延迟，验证骨架屏
  nickname: '云端听歌人',
  avatar: null,          // 启动时生成
  userId: 3293310,
  vipType: 11,
  level: 9,
  trial: false,
  slowSeekMs: 0,      // >0：audio Range 请求 start>0 时延迟（模拟慢速 seek）
  slowAudioMs: 0,     // >0：所有 /audio 响应延迟（模拟 metadata 迟到）
  modeError: null,    // null | 'empty' | 'error'：/mode 接口异常模拟
  modeHangMs: 0,      // >0：/mode 响应挂起（模拟超时，UI 8s AbortController 兜底）
  likeAuthed: true,   // false：/like/status 返回 authed:false（未登录）
  likeError: null,    // true：like 接口返回 500
  playerCommand: null, // 注入一条 player/commands 命令（playQueue/control/refreshLike…）
  engine: 'installed',   // installed | missing | installing | failed
  installError: false,
  install: { state: 'idle', phase: 'idle', lines: [], error: null, installed: true, startedAt: 0 },
}
let calls = []
let loginCheckCount = 0

/* ------------------------------------------------------------------ *
 * 工具：本地封面 / 二维码 / WAV
 * ------------------------------------------------------------------ */
function svgCover(seed, label) {
  const hue = (seed * 47 + 13) % 360
  const hue2 = (hue + 58) % 360
  const safe = String(label ?? '').slice(0, 6).replace(/[<>&"]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 74% 60%)"/>` +
    `<stop offset="1" stop-color="hsl(${hue2} 66% 36%)"/></linearGradient></defs>` +
    `<rect width="360" height="360" fill="url(#g)"/>` +
    `<circle cx="286" cy="78" r="66" fill="rgba(255,255,255,.20)"/>` +
    `<circle cx="58" cy="314" r="104" fill="rgba(0,0,0,.16)"/>` +
    `<path d="M138 236V118l92-18v106" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="122" cy="240" r="20" fill="rgba(255,255,255,.6)"/>` +
    `<circle cx="214" cy="222" r="20" fill="rgba(255,255,255,.6)"/>` +
    `<text x="24" y="332" font-family="PingFang SC,Helvetica Neue,sans-serif" font-size="30" font-weight="700" fill="rgba(255,255,255,.94)">${safe}</text>` +
    `</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

function svgQr() {
  // 固定二维码样式图（16x16 模块的伪随机点阵 + 三个定位角），只用于截图，不承担真实扫码
  const N = 21
  const px = 240 / N
  let cells = ''
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const finder =
        (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7)
      if (finder) continue
      const on = ((x * 7 + y * 13 + x * y * 3) % 11) < 5
      if (on) cells += `<rect x="${(x * px).toFixed(2)}" y="${(y * px).toFixed(2)}" width="${px.toFixed(2)}" height="${px.toFixed(2)}"/>`
    }
  }
  const corner = (x, y) =>
    `<rect x="${x}" y="${y}" width="${px * 7}" height="${px * 7}" fill="none" stroke="#111" stroke-width="${px}"/>` +
    `<rect x="${x + px * 2}" y="${y + px * 2}" width="${px * 3}" height="${px * 3}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">` +
    `<rect width="240" height="240" fill="#fff"/><g fill="#111">${cells}</g>` +
    corner(0, 0) + corner(240 - px * 7, 0) + corner(0, 240 - px * 7) +
    `</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const QR = svgQr()

function makeWav(seconds = 12, sr = 22050) {
  const n = Math.floor(seconds * sr)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)   // PCM
  buf.writeUInt16LE(1, 22)   // mono
  buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  const fade = sr * 0.25
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - i) / fade)
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 0.22 * env * 32767)
    buf.writeInt16LE(v, 44 + i * 2)
  }
  return buf
}
const WAV = makeWav(8)   // 8s 短 WAV：可播放、可验证 ended → 自动下一首；播放页/歌词有足够时间推进

/* ------------------------------------------------------------------ *
 * 假数据
 * ------------------------------------------------------------------ */
const TRACK_DEFS = [
  ['水星记', '郭顶', '飞行器的执行周期', 325266, 1, 100],
  ['晴天', '周杰伦', '叶惠美', 269226, 1, 99],
  ['稻香', '周杰伦', '魔杰座', 223266, 0, 97],
  ['七里香', '周杰伦', '七里香', 299000, 1, 95],
  ['句号', '邓紫棋', '摩天动物园', 231000, 1, 96],
  ['演员', '薛之谦', '绅士', 256000, 0, 94],
  ['年少有为', '李荣浩', '耳朵', 265000, 1, 93],
  ['消愁', '毛不易', '平凡的一天', 282000, 0, 92],
  ['如愿', '王菲', '如愿', 274000, 1, 91],
  ['倔强', '五月天', '神的孩子都在跳舞', 268000, 1, 90],
  ['江南', '林俊杰', '第二天堂', 264000, 0, 89],
  ['十年', '陈奕迅', '黑·白·灰', 205000, 0, 88],
  ['富士山下', '陈奕迅', "What's Going On...?", 259000, 1, 87],
  ['素颜', '许嵩', '自定义', 236000, 0, 86],
  ['起风了', '买辣椒也用券', '起风了', 325000, 0, 85],
  ['海阔天空', 'Beyond', '乐与怒', 326000, 1, 84],
  ['光辉岁月', 'Beyond', '命运派对', 297000, 0, 83],
  ['后来', '刘若英', '我等你', 255000, 0, 82],
  ['遇见', '孙燕姿', '孙燕姿', 204000, 0, 81],
  ['夜曲', '周杰伦', '十一月的萧邦', 226000, 1, 80],
  ['夜空中最亮的星', '逃跑计划', '世界', 252000, 0, 79],
  ['成都', '赵雷', '无法长大', 328000, 1, 78],
  ['平凡之路', '朴树', '猎户星座', 302000, 1, 77],
  ['匆匆那年', '王菲', '匆匆那年', 240000, 1, 76],
  ['若把你', '刘珂矣', '若把你', 218000, 0, 75],
  ['光年之外', '邓紫棋', '光年之外', 235000, 1, 74],
  ['说散就散', '袁娅维', '说散就散', 236000, 0, 73],
  ['可能', '程响', '可能', 219000, 0, 72],
  ['向云端', '小霞', '小霞 2.0', 285000, 0, 71],
  ['罗生门', '梨冻紧', '罗生门', 243000, 0, 70],
  ['兰亭序', '周杰伦', '魔杰座', 240000, 1, 69],
  ['一路向北', '周杰伦', '十一月的萧邦', 285000, 1, 68],
  ['红豆', '王菲', '唱游', 258000, 0, 67],
  ['爱情转移', '陈奕迅', '认了吧', 275000, 1, 66],
  ['稻香 (Live)', '周杰伦', '2013魔天伦世界巡回演唱会', 250000, 1, 65],
  ['慢慢喜欢你', '莫文蔚', '我们在中场相遇', 246000, 0, 64],
]

const ARTIST_IDS = {
  郭顶: 2843, 周杰伦: 6452, 邓紫棋: 7763, 薛之谦: 5781, 李荣浩: 5771,
  毛不易: 12138250, 王菲: 2643, 五月天: 13193, 林俊杰: 3684, 陈奕迅: 2116,
  许嵩: 5770, 买辣椒也用券: 12085562, Beyond: 11127, 刘若英: 8325,
  孙燕姿: 9272, 逃跑计划: 12085068, 赵雷: 1197020, 朴树: 4721,
  刘珂矣: 12068044, 袁娅维: 12068081, 程响: 12085571, 小霞: 12075028,
  梨冻紧: 35269269, 莫文蔚: 8926,
}
const ARTIST_DEFS = [
  ['周杰伦', ['Jay Chou', '周董'], 30, 500, '华语流行天王，2000 年出道，代表作《晴天》《七里香》《夜曲》。'],
  ['郭顶', ['Guo Ding'], 6, 42, '独立唱作人，《飞行器的执行周期》入围金曲奖多项提名。'],
  ['林俊杰', ['JJ Lin'], 21, 320, '新加坡创作歌手，金曲奖最佳国语男歌手。'],
  ['陈奕迅', ['Eason Chan'], 40, 460, '香港歌手，华语乐坛「歌神」接班人。'],
  ['邓紫棋', ['G.E.M.'], 14, 240, '创作型女歌手，代表作《光年之外》《句号》。'],
  ['毛不易', ['Mao Buyi'], 5, 96, '创作歌手，代表作《消愁》《平凡的一天》。'],
  ['王菲', ['Faye Wong'], 26, 280, '华语流行天后，空灵声线代表。'],
  ['五月天', ['Mayday'], 12, 260, '台湾摇滚乐团，成军二十余年。'],
  ['李荣浩', ['Li Ronghao'], 8, 150, '全能音乐人，代表作《年少有为》。'],
  ['薛之谦', ['Joker Xue'], 11, 180, '创作歌手，代表作《演员》《绅士》。'],
]
const artists = ARTIST_DEFS.map(([name, alias, albumCount, songCount, description], i) => ({
  id: ARTIST_IDS[name] ?? 9000 + i,
  name,
  avatar: i === 2 || i === 7 ? null : svgCover(ARTIST_IDS[name] ?? 9000 + i, name.slice(0, 1)),
  alias,
  fans: [1200000, 880000, 1560000, 2210000][i % 4],
  albumCount,
  songCount,
  description,
}))

const tracks = TRACK_DEFS.map(([name, artist, album, duration, fee, pop], i) => {
  const artistId = ARTIST_IDS[artist] ?? 9000
  const id = 1901371647 + i * 37
  return {
    id,
    name,
    artists: [{ id: artistId, name: artist }],
    artist,
    album,
    albumId: 35005583 + i * 11,
    cover: i === 29 ? null : svgCover(id, name),
    duration,
    fee,
    pop,
    mv: null,
    alias: i === 34 ? '(Live)' : null,
    vip: fee === 1,
  }
})

const PLAYLIST_DEFS = [
  ['分手伤感温柔emo歌单', '网易云音乐', 447, 235106, '那些深夜循环的温柔与遗憾，都在这里。', false],
  ['华语流行精选｜循环播放', '云村小助手', 208, 981230, '近几年最耐听的华语流行，一遍就上头。', false],
  ['深夜emo电台', '夜航电台', 120, 54211, '凌晨两点的城市与耳机，留给自己的两个小时。', false],
  ['周杰伦经典全收录', 'Jay迷集合站', 186, 3201188, '从《Jay》到《最伟大的作品》，按发行时间排序。', false],
  ['学习工作专注 BGM', '专注研究所', 90, 761234, '无人声、低起伏，适合阅读与深度工作。', false],
  ['夏日清爽民谣', '民谣公社', 74, 208822, '蝉鸣、汽水、晚风，和一把木吉他。', false],
  ['90后回忆杀', '时光机', 150, 1560032, '前奏一响，DNA 就动了。', false],
  ['轻音乐助眠', '睡个好觉', 60, 430991, '雨声与钢琴，把一天的噪音关掉。', false],
  ['通勤路上听什么', '地铁听歌人', 128, 155902, '早高峰到工位，刚好十首歌。', false],
  ['粤语金曲黄金年代', '港乐档案', 210, 1123450, '八十到九十年代，黄金年代的回响。', false],
  ['独立民谣小站', '小站编辑部', 88, 78210, '不被算法推荐的好歌，慢慢听。', false],
  ['摇滚现场高能合集', 'Live House', 66, 91233, '把音量开到最大，感受鼓点的重量。', false],
  ['我的私藏歌单', '云端听歌人', 32, 1280, '自己攒的私藏，别外传。', true],
  ['雨天钢琴纯音乐', '雨声采集者', 45, 33120, '窗外下雨，屋里钢琴。', false],
  ['跑步节奏 BPM 160', '夜跑俱乐部', 52, 20550, '步频 160 的歌单，跑起来。', true],
  ['咖啡店背景音乐', '街角咖啡', 70, 61220, '不抢戏的午后背景音。', true],
  ['我的收藏 · 华语', '云端听歌人', 96, 640, '收藏夹里的华语老歌。', true],
  ['清晨唤醒计划', '早八人', 40, 51200, '适合通勤路上的第一首歌。', false],
  ['经典粤语慢歌', '港乐档案', 132, 88210, '慢一点，再慢一点。', false],
  ['夜间爵士小酒馆', 'Blue Note', 56, 30211, '低音萨克斯与冰块的碰撞。', false],
  ['游戏原声精选', '像素旅人', 78, 120880, '从 8-bit 到交响，游戏里的名场面。', false],
  ['法式慵懒下午茶', 'Café Paris', 48, 22100, '手风琴、香颂和一杯拿铁。', false],
  ['国风新声', '青花瓷研究所', 64, 156220, '琵琶与合成器，古意与新声。', false],
]

const playlists = PLAYLIST_DEFS.map(([name, creator, trackCount, playCount, description, mine], i) => {
  const id = 14060780068 + i * 101
  return {
    id,
    name,
    cover: svgCover(id, name),
    trackCount,
    playCount,
    description,
    creator,
    mine,
    updateTime: 1720000000000 + i * 86400000,
  }
})
const recommended = playlists.filter((p) => !p.mine).slice(0, 18)
const myPlaylists = playlists.filter((p) => p.mine)
const BIG_PLAYLIST_ID = playlists[0].id
const BIG_SUFFIX = ['Live', 'Remix', '纯音乐', '现场版', '钢琴版', 'DJ 版']
const bigTracks = (() => {
  const list = [...tracks]
  for (let i = 0; list.length < 120; i++) {
    const base = tracks[i % tracks.length]
    const round = Math.floor(i / tracks.length)
    list.push({
      ...base,
      id: 8800000 + i * 13,
      name: base.name + ' · ' + BIG_SUFFIX[i % BIG_SUFFIX.length],
      album: base.album + (round ? '（精选集 ' + round + '）' : ''),
      fee: 0,
      vip: false,
      cover: svgCover(8800000 + i * 13, base.name),
    })
  }
  return list
})()

const albums = tracks
  .filter((t) => t.cover)
  .slice(0, 12)
  .map((t, i) => ({
    id: 35005583 + i * 11,
    name: t.album,
    cover: svgCover(35005583 + i * 11, t.album),
    artist: t.artist,
    artistId: t.artists[0].id,
    publishDate: ['2016-11-25', '2003-07-31', '2016-12-22', '2022-09-23'][i % 4],
    trackCount: [10, 12, 9, 11][i % 4],
  }))

const LRC_LINES = [
  ['00:00.00', '窗外的雨声 敲打着玻璃', 'Rain taps against the window'],
  ['00:01.40', '耳机里的旋律 把夜拉得很长', 'The melody in my headphones stretches the night'],
  ['00:02.80', '那些没说完的话 都写进歌里', 'All the unsaid words are written into the song'],
  ['00:04.20', '城市灯火 一盏一盏亮起', 'City lights come on one by one'],
  ['00:05.60', '我们都在 寻找同一颗星', "We're all looking for the same star"],
  ['00:07.00', '如果风会记得 今天的温度', 'If the wind remembers the warmth of today'],
  ['00:08.40', '就让这首歌 陪你到天亮', 'Let this song stay with you until dawn'],
  ['00:09.80', '时间慢一点 再慢一点', 'Slow down, time, a little more'],
  ['00:11.20', '让心事 都被温柔听见', 'Let every worry be heard gently'],
  ['00:12.60', '我们在人海里 兜兜转转', 'We wander through the sea of people'],
  ['00:14.00', '最后都 走回同一首歌', 'And end up in the same song'],
  ['00:15.40', '（间奏）', '(Interlude)'],
  ['00:16.80', '如果风会记得 今天的温度', 'If the wind remembers the warmth of today'],
  ['00:18.20', '就让这首歌 陪你到天亮', 'Let this song stay with you until dawn'],
]
const LRC = (title, artist) => [
  `[ti:${title}]`,
  `[ar:${artist}]`,
  '[al:飞行器的执行周期]',
  '[by:netease-panel-selftest]',
  ...LRC_LINES.map(([time, text]) => `[${time}] ${text}`),
].join('\n')
const TLYRIC = LRC_LINES.slice(0, 6).map(([time, , tr]) => `[${time}] ${tr}`).join('\n')

const url = (p, level) => '/netease-panel/api/audio?id=' + encodeURIComponent(p) + '&level=' + encodeURIComponent(level || 'auto')
const audioSize = WAV.length

// 契约 10.4：auto|standard|exhigh|lossless|hires；auto 按会员选 exhigh
const LEVEL_BR = { standard: 128000, exhigh: 320000, lossless: 1512987, hires: 1512987 }
const LEVEL_ALIAS = { auto: 'exhigh', standard: 'standard', exhigh: 'exhigh', lossless: 'lossless', hires: 'hires' }

function songUrl(id, requested) {
  const actual = LEVEL_ALIAS[requested] || 'exhigh'
  const trial = !!cfg.trial || (actual === 'standard' && !cfg.authed)
  return {
    url: url(id, actual),
    br: LEVEL_BR[actual],
    size: audioSize,
    type: 'mp3',
    level: actual,
    trial,
    expiresAt: Date.now() + 300000,
  }
}

/* ------------------------------------------------------------------ *
 * v5 插件内播放器：Agent 命令队列 + 客户端状态上报
 * ------------------------------------------------------------------ */
let playerSeq = 0
let playerCommands = []
let playerState = null
function pushPlayerCommand(cmd) {
  playerSeq += 1
  playerCommands.push(Object.assign({ seq: playerSeq, at: Date.now() }, cmd))
  return playerSeq
}

/* ------------------------------------------------------------------ *
 * 收藏（红心）状态：默认偶数 id 已收藏，POST /like 翻转并记录次数
 * ------------------------------------------------------------------ */
const likedState = new Map()
for (const t of tracks) if (Number(t.id) % 2 === 0) likedState.set(String(t.id), true)
const isLiked = (id) => !!likedState.get(String(id))
function likeStatus(idsParam) {
  const ids = String(idsParam || '').split(',').map((x) => x.trim()).filter(Boolean)
  const liked = {}
  for (const id of ids) liked[id] = isLiked(id)
  return { liked, authed: !!cfg.likeAuthed }
}

/* ------------------------------------------------------------------ *
 * HTTP 工具
 * ------------------------------------------------------------------ */
function json(res, code, body, headers = {}) {
  const data = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
    ...headers,
  })
  res.end(data)
}
const ok = (res, data, headers) => json(res, 200, { ok: true, data }, headers)
const fail = (res, code, error, status = 400) =>
  json(res, status, { ok: false, error, code })

function readBody(req) {
  return new Promise((resolveBody) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try { resolveBody(body ? JSON.parse(body) : {}) } catch { resolveBody({}) }
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ *
 * 静态资源
 * ------------------------------------------------------------------ */
function staticFile(res, file, type) {
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('not found: ' + file)
  }
  const body = readFileSync(file)
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': body.length })
  res.end(body)
}

/* ------------------------------------------------------------------ *
 * 音频（含 Range）
 * ------------------------------------------------------------------ */
function serveAudio(req, res, level = 'auto') {
  const range = req.headers.range
  const headers = {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=300',
    'X-NM-Level': level,
    'X-NM-Br': String(LEVEL_BR[LEVEL_ALIAS[level] || 'exhigh'] || 320000),
  }
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!m) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${WAV.length}` })
      return res.end()
    }
    let start = m[1] === '' ? WAV.length - Number(m[2]) : Number(m[1])
    let end = m[1] === '' || m[2] === '' ? WAV.length - 1 : Number(m[2])
    start = Math.max(0, start)
    end = Math.min(WAV.length - 1, end)
    if (start > end || start >= WAV.length) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${WAV.length}` })
      return res.end()
    }
    const slice = WAV.subarray(start, end + 1)
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${WAV.length}`,
      'Content-Length': slice.length,
    })
    return res.end(slice)
  }
  res.writeHead(200, { ...headers, 'Content-Length': WAV.length })
  res.end(req.method === 'HEAD' ? undefined : WAV)
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */
function installSummary() {
  const it = cfg.install || {}
  return {
    state: it.state || 'idle',
    phase: it.phase || 'idle',
    lines: Array.isArray(it.lines) ? it.lines.slice(-40) : [],
    error: it.error || null,
    installed: !!it.installed,
    tail: Array.isArray(it.lines) && it.lines.length ? it.lines[it.lines.length - 1] : '',
  }
}

function apiStatus() {
  const base = {
    bridge: cfg.bridge,
    engine: cfg.engine,
    install: installSummary(),
    authed: cfg.authed,
    anonymous: !cfg.authed,
    nickname: cfg.authed ? cfg.nickname : null,
    avatar: cfg.authed ? cfg.avatar : null,
    userId: cfg.authed ? cfg.userId : null,
    vipType: cfg.authed ? cfg.vipType : 0,
    level: cfg.authed ? cfg.level : 0,
  }
  if (cfg.bridge === 'error') {
    return { ...base, bridge: 'error', error: '数据引擎未就绪：请先在 engine 安装 cloud-music-mcp' }
  }
  return base
}

function searchMock(q, type, limit) {
  const text = String(q || '').trim().toLowerCase()
  const has = (s) => String(s).toLowerCase().includes(text)
  const n = Math.min(Number(limit) || 30, 100)
  if (type === 'playlist') {
    return playlists.filter((p) => !text || has(p.name) || has(p.creator) || has(p.description)).slice(0, n)
  }
  if (type === 'artist') {
    return artists.filter((a) => !text || has(a.name) || a.alias.some(has)).slice(0, n)
  }
  if (type === 'album') {
    return albums.filter((a) => !text || has(a.name) || has(a.artist)).slice(0, n)
  }
  return tracks.filter((t) => !text || has(t.name) || has(t.artist) || has(t.album) || has(t.alias || '')).slice(0, n)
}

function playlistDetail(id) {
  const pl = playlists.find((p) => String(p.id) === String(id)) || playlists[0]
  if (String(pl.id) === String(BIG_PLAYLIST_ID)) {
    return { playlist: pl, songs: bigTracks.slice(0, 120) }
  }
  const n = Math.min(24, pl.trackCount)
  const songs = []
  for (let i = 0; i < n; i++) songs.push(tracks[(Number(pl.id) + i * 5) % tracks.length])
  return { playlist: pl, songs }
}

function albumDetail(id) {
  const al = albums.find((a) => String(a.id) === String(id)) || albums[0]
  const songs = tracks.filter((t) => t.album === al.name)
  return { album: al, songs: songs.length ? songs : tracks.slice(0, 8) }
}

function artistDetail(id) {
  const ar = artists.find((a) => String(a.id) === String(id)) || artists[0]
  const songs = tracks.filter((t) => t.artist === ar.name)
  const albumsFor = albums.filter((a) => a.artist === ar.name)
  return { artist: ar, songs: songs.length ? songs : tracks.slice(0, 6), albums: albumsFor }
}

function isErrorMode(scope) {
  if (cfg.errorMode === 'all') return true
  if (cfg.errorMode === scope) return true
  return false
}

async function handleApi(req, res, path, searchParams) {
  if (cfg.slowMs) await sleep(cfg.slowMs)

  if (cfg.bridge === 'error' && path !== '/status' && path !== '/login/start' && path !== '/login/check' && path !== '/logout') {
    return fail(res, 'BRIDGE', '数据引擎未就绪（mock：bridge=error）', 503)
  }
  if (cfg.engine !== 'installed' && path !== '/status' && path !== '/login/start' && path !== '/login/check' && path !== '/logout' && path !== '/setup/install' && path !== '/setup/install/log') {
    return fail(res, 'BRIDGE', '数据引擎未安装（mock：engine=' + cfg.engine + '）', 503)
  }

  if (isErrorMode('all') || isErrorMode('home')) {
    // 错误模式只影响数据接口，登录 / status 保持可用，方便单独验证错误态 UI
    const dataRoutes = new Set(['/home', '/daily', '/playlists', '/playlist', '/artist', '/album', '/search', '/subscriptions', '/song/url', '/lyrics', '/mode'])
    if (dataRoutes.has(path)) {
      return fail(res, 'NETWORK', '网络开小差了，请稍后重试', 500)
    }
  }

  switch (path) {
    case '/status':
      return ok(res, apiStatus())

    case '/home':
      return ok(res, {
        daily: tracks.slice(0, 30),
        playlists: cfg.authed ? myPlaylists : [],
        artists: cfg.authed ? artists.slice(0, 8) : [],
        recommended,
      })

    case '/daily':
      return ok(res, { songs: tracks.slice(0, 30) })

    case '/playlists':
      return ok(res, { playlists: myPlaylists })

    case '/playlist':
      return ok(res, playlistDetail(searchParams.get('id')))

    case '/artist':
      return ok(res, artistDetail(searchParams.get('id')))

    case '/album':
      return ok(res, albumDetail(searchParams.get('id')))

    case '/mode': {
      const type = searchParams.get('type') || 'heart'
      if (cfg.modeHangMs > 0) await sleep(cfg.modeHangMs)
      if (cfg.modeError === 'error') return fail(res, 'NETWORK', '推荐模式暂不可用，请稍后重试', 500)
      const limit = Math.max(12, Math.min(20, Number(searchParams.get('limit')) || 16))
      if (cfg.modeError === 'empty') {
        return ok(res, { type, title: '按心情推荐', subtitle: '', resolvedSeed: null, fallbackUsed: null, songs: [] })
      }
      const seedId = searchParams.get('songId')
      const artistId = searchParams.get('artistId')
      const seedTrack = tracks.find((t) => String(t.id) === String(seedId)) || tracks[0]
      const seedArtist = artists.find((a) => String(a.id) === String(artistId)) || artists[0]
      const META = {
        heart: ['心动模式', '从你红心的歌里，挑一些此刻会心动的', 3],
        roam: ['漫游模式', '跳出日常口味，随机漫游到一首新歌', 7],
        similar_song: ['相似歌曲', '和这首「' + seedTrack.name + '」气质相近的歌', 11],
        similar_artist: ['相似歌手', '像「' + seedArtist.name + '」一样的歌手与歌', 17],
        daily: ['每日推荐', '根据你的口味，为你精选今日推荐', 0],
      }
      const meta = META[type] || META.heart
      const offset = meta[2]
      const songs = []
      for (let i = 0; i < limit; i++) songs.push(tracks[(offset + i * 3) % tracks.length])
      return ok(res, {
        type,
        title: meta[0],
        subtitle: meta[1],
        resolvedSeed: type === 'similar_artist'
          ? { type: 'artist', id: seedArtist.id, name: seedArtist.name }
          : { type: 'song', id: seedTrack.id, name: seedTrack.name, artist: seedTrack.artist },
        fallbackUsed: (type === 'roam' || type === 'similar_song') && !seedId ? '今日推荐第一首' : null,
        songs,
      })
    }

    case '/search': {
      const type = searchParams.get('type') || 'song'
      return ok(res, { items: searchMock(searchParams.get('q'), type, searchParams.get('limit')), type })
    }

    case '/subscriptions': {
      const category = searchParams.get('category') || 'artists'
      return ok(res, { items: category === 'albums' ? albums : artists })
    }

    case '/song/url':
      return ok(res, songUrl(searchParams.get('id'), searchParams.get('level')))

    case '/lyrics': {
      const t = tracks.find((x) => String(x.id) === String(searchParams.get('id'))) || tracks[0]
      return ok(res, { lrc: LRC(t.name, t.artist), tlyric: TLYRIC })
    }

    case '/setup/install': {
      if (req.method !== 'POST') return fail(res, 'INTERNAL', 'method not allowed', 405)
      cfg.engine = 'installing'
      cfg.install = {
        state: 'running',
        phase: 'clone',
        lines: ['开始安装网易云数据引擎…', 'git clone --depth 1 cloud-music-mcp'],
        error: null,
        installed: false,
        startedAt: Date.now(),
      }
      return ok(res, { started: true })
    }

    case '/setup/install/log': {
      const it = cfg.install || {}
      if (it.state === 'running' && it.startedAt) {
        const elapsed = Date.now() - it.startedAt
        const phases = [
          { at: 0, phase: 'clone', lines: ['开始安装网易云数据引擎…', 'git clone --depth 1 cloud-music-mcp'] },
          { at: 600, phase: 'venv', lines: ['克隆完成，创建 Python venv…'] },
          { at: 1300, phase: 'pip', lines: ['安装依赖 pyncm / qrcode…'] },
          { at: 2200, phase: 'verify', lines: ['依赖安装完成，校验 import pyncm…'] },
        ]
        const failedNow = cfg.installError && elapsed >= 1500
        const doneNow = !cfg.installError && elapsed >= 3200
        if (failedNow) {
          cfg.install.state = 'failed'
          cfg.install.phase = 'pip'
          cfg.install.error = 'pip install 失败：网络超时（mock）'
          cfg.install.lines = ['开始安装网易云数据引擎…', 'git clone --depth 1 cloud-music-mcp', '创建 Python venv…', '安装依赖 pyncm / qrcode…', 'ERROR: 网络超时，安装失败']
          cfg.engine = 'failed'
        } else if (doneNow) {
          cfg.install.state = 'done'
          cfg.install.phase = 'done'
          cfg.install.installed = true
          cfg.install.lines = ['开始安装网易云数据引擎…', 'git clone --depth 1 cloud-music-mcp', '创建 Python venv…', '安装依赖 pyncm / qrcode…', '校验 import pyncm… ok', '数据引擎已就绪']
          cfg.engine = 'installed'
        } else {
          const cur = phases.filter((p) => elapsed >= p.at).pop() || phases[0]
          cfg.install.phase = cur.phase
          cfg.install.lines = phases.filter((p) => elapsed >= p.at).flatMap((p) => p.lines)
        }
      }
      return ok(res, installSummary())
    }

    case '/player/commands': {
      const raw = searchParams.get('cursor')
      if (raw === null || raw === '') return ok(res, { cursor: playerSeq, commands: [] })
      const cursor = Number(raw) || 0
      return ok(res, { cursor: playerSeq, commands: playerCommands.filter((cmd) => cmd.seq > cursor) })
    }

    case '/player/state': {
      if (req.method === 'POST') {
        const body = await readBody(req)
        playerState = body && typeof body === 'object' ? body : null
        return ok(res, { ok: true, at: Date.now() })
      }
      return ok(res, playerState || { current: null, playing: false, position: 0, duration: 0, updatedAt: null })
    }

    case '/like/status': {
      if (cfg.likeError) return fail(res, 'NETWORK', '收藏状态加载失败（mock）', 500)
      return ok(res, likeStatus(searchParams.get('ids')))
    }

    case '/like': {
      if (req.method !== 'POST') return fail(res, 'INTERNAL', 'method not allowed', 405)
      if (!cfg.likeAuthed) return fail(res, 'UNAUTHENTICATED', '请先扫码登录后再收藏', 401)
      if (cfg.likeError) return fail(res, 'NETWORK', '收藏失败，请稍后重试（mock）', 500)
      const body = await readBody(req)
      const id = body && body.id != null ? String(body.id) : null
      if (!id) return fail(res, 'NOT_FOUND', '缺少歌曲 id', 400)
      const next = typeof body.liked === 'boolean' ? body.liked : !isLiked(id)
      likedState.set(id, next)
      return ok(res, { ok: true, id, liked: next })
    }

    case '/login/start':
      if (req.method !== 'POST') return fail(res, 'INTERNAL', 'method not allowed', 405)
      loginCheckCount = 0
      return ok(res, { key: 'mock-login-key', qr: QR, expiresIn: 300 })

    case '/login/check': {
      loginCheckCount += 1
      let state = 'waiting'
      if (loginCheckCount === 3) state = 'scanned'
      else if (loginCheckCount >= 4) state = 'ok'
      if (state === 'ok') {
        cfg.authed = true
        cfg.avatar = svgCover(32933, '云')
      }
      return ok(res, state === 'ok'
        ? { state, nickname: cfg.nickname, avatar: cfg.avatar, vipType: cfg.vipType, userId: cfg.userId }
        : { state })
    }

    case '/logout':
      if (req.method !== 'POST') return fail(res, 'INTERNAL', 'method not allowed', 405)
      cfg.authed = false
      loginCheckCount = 0
      return ok(res, { authed: false })

    default:
      return fail(res, 'NOT_FOUND', '接口不存在: ' + path, 404)
  }
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */
cfg.avatar = svgCover(32933, '云')

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1')
  const pathname = u.pathname

  /* 静态 */
  if (pathname === '/') return staticFile(res, join(HERE, 'harness.html'), 'text/html; charset=utf-8')
  if (pathname === '/harness.html') return staticFile(res, join(HERE, 'harness.html'), 'text/html; charset=utf-8')
  if (pathname === '/client.js') {
    if (!existsSync(CLIENT)) {
      const msg = `/* client.js not found at ${CLIENT} — UI 尚未交付；harness 等待文件 */`
      res.writeHead(404, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(msg + '\nconsole.error("client.js not found: ' + CLIENT.replace(/"/g, '') + '")')
    }
    return staticFile(res, CLIENT, 'text/javascript; charset=utf-8')
  }
  if (pathname === '/react.js') return staticFile(res, join(HERE, 'assets', 'react.js'), 'text/javascript; charset=utf-8')
  if (pathname === '/react-dom.js') return staticFile(res, join(HERE, 'assets', 'react-dom.js'), 'text/javascript; charset=utf-8')
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end() }
  if (pathname === '/__health') return json(res, 200, { ok: true, client: CLIENT, clientExists: existsSync(CLIENT), port: server.address()?.port ?? null })

  /* 测试控制面 */
  if (pathname === '/__config') {
    if (req.method === 'POST') {
      const patch = await readBody(req)
      Object.assign(cfg, patch)
      if (patch.playerCommand && typeof patch.playerCommand === 'object') {
        pushPlayerCommand(patch.playerCommand)
        cfg.playerCommand = null
      }
      if (patch.loginReset) loginCheckCount = 0
      // engine 状态变化时同步安装摘要，避免 install.installed=true 掩盖 engine:missing
      if ('engine' in patch) {
        if (patch.engine === 'installed') {
          cfg.install = { state: 'idle', phase: 'idle', lines: [], error: null, installed: true, startedAt: 0 }
        } else {
          cfg.install = {
            state: patch.engine === 'failed' ? 'failed' : 'idle',
            phase: 'idle',
            lines: [],
            error: null,
            installed: false,
            startedAt: 0,
          }
        }
      }
    }
    return json(res, 200, { ...cfg, client: CLIENT, clientExists: existsSync(CLIENT) })
  }
  if (pathname === '/__calls') return json(res, 200, calls)
  if (pathname === '/__reset') {
    calls = []
    loginCheckCount = 0
    cfg.errorMode = null
    cfg.slowMs = 0
    cfg.slowSeekMs = 0
    cfg.slowAudioMs = 0
    cfg.modeError = null
    cfg.modeHangMs = 0
    cfg.likeAuthed = true
    cfg.likeError = null
    likedState.clear()
    for (const t of tracks) if (Number(t.id) % 2 === 0) likedState.set(String(t.id), true)
    playerSeq = 0
    playerCommands = []
    playerState = null
    cfg.engine = 'installed'
    cfg.installError = false
    cfg.install = { state: 'idle', phase: 'idle', lines: [], error: null, installed: true, startedAt: 0 }
    return json(res, 200, { ok: true })
  }

  /* 音频 / 图片代理（非 JSON） */
  if (pathname === '/netease-panel/api/audio') {
    calls.push({ at: Date.now(), method: req.method, path: pathname, search: u.search })
    const range = req.headers.range || ''
    const startMatch = /^bytes=(\d+)-/.exec(range)
    const rangeStart = startMatch ? Number(startMatch[1]) : 0
    if (cfg.slowAudioMs > 0) await sleep(cfg.slowAudioMs)
    if (cfg.slowSeekMs > 0) {
      // 只先返回 1/4 数据，强制浏览器后续用 Range 取剩余部分；
      // start>0 的 Range 请求延迟 slowSeekMs，用于模拟慢速 seek。
      const quarter = Math.floor(WAV.length / 4)
      const m = /^bytes=(\d+)-(\d*)$/.exec(range)
      if (!m || Number(m[1]) === 0) {
        req.headers.range = 'bytes=0-' + (quarter - 1)
      } else if (rangeStart > 0) {
        await sleep(cfg.slowSeekMs)
      }
    }
    return serveAudio(req, res, u.searchParams.get('level') || 'auto')
  }
  if (pathname === '/netease-panel/api/img') {
    const svg = svgCover(77, 'IMG')
    const body = Buffer.from(decodeURIComponent(svg.split(',')[1]), 'utf8')
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': body.length,
    })
    return res.end(body)
  }

  /* API */
  if (pathname.startsWith('/netease-panel/api/')) {
    calls.push({ at: Date.now(), method: req.method, path: pathname, search: u.search })
    const path = pathname.slice('/netease-panel/api'.length) || '/'
    try {
      return await handleApi(req, res, path, u.searchParams)
    } catch (err) {
      return fail(res, 'INTERNAL', String(err?.message || err), 500)
    }
  }

  return fail(res, 'NOT_FOUND', 'not found', 404)
})

server.listen(Number(process.env.NM_PORT) || 0, '127.0.0.1', () => {
  const { port } = server.address()
  console.log(JSON.stringify({ port, client: CLIENT, clientExists: existsSync(CLIENT) }))
})
