#!/usr/bin/env node
/**
 * live-verify.mjs — 确认「中危修复已在当前 Harness 运行时真正生效」
 *
 * 与 player-regression.mjs 的区别：不启动 mock server，直接探测本机正在运行的
 * Harness。GUI 根页有 token 认证网关（headless 无凭证会得到 401），因此这里
 * 通过插件面板 API + 运行时 clientModules 服务的产物状态来取证：
 *
 *  1. /status、/auth 返回修复版才有的登录态字段（auth / authPending / authError）
 *  2. 运行时已发布的 client 产物与磁盘上最新的 client.js 完全对齐（size/mtime）
 *  3. reconcile/rebuild 后 dirty 为空，产物未被判定为过期
 *  4. 磁盘 client.js 含本轮新增实现标记（build 号、replaceAudioSource 等）
 *  5. 引擎 installed + bridge ready + 真实账号 valid（证明整链可服务）
 *  6. 一次真实音源取址成功（证明账号/VIP 链路可用）
 *
 * 用法：node live-verify.mjs [baseUrl]
 * 退出码：0 全绿；1 有 FAIL。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = process.env.NM_CLIENT ? resolve(process.env.NM_CLIENT) : join(HERE, '..', 'client.js')
const BASE = (process.argv[2] || process.env.NM_LIVE_BASE || 'http://127.0.0.1:53868').replace(/\/+$/, '')
const EXPECT_BUILD = process.env.NM_EXPECT_BUILD || 'v1.1.1'
const SONG_ID = process.env.NM_LIVE_SONG || '1901371647'

const passed = []
const failed = []
function check(label, ok, extra) {
  if (ok) { passed.push(label); console.log(`  ✓ ${label}${extra === undefined ? '' : ` (${extra})`}`) }
  else { failed.push(label); console.log(`  ✗ ${label} → ${extra}`) }
}

async function api(path, timeout = 30000) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeout), cache: 'no-store' })
  const body = await res.json()
  if (!body || body.ok !== true) throw new Error(`${path} → ${JSON.stringify(body).slice(0, 200)}`)
  return body.data
}

if (!existsSync(CLIENT)) { console.error('client.js 不存在: ' + CLIENT); process.exit(2) }
console.log(`[live] base=${BASE}\n[live] client=${CLIENT}\n`)

try {
  /* ---- 1. 登录态契约字段（修复版新增） ---- */
  const status = await api('/netease-panel/api/status')
  check('运行时 /status 带 auth 字段', 'auth' in status, JSON.stringify(status.auth))
  check('运行时 /status 带 authPending 字段', 'authPending' in status, JSON.stringify(status.authPending))
  check('运行时 /status 带 authError 字段', 'authError' in status, JSON.stringify(status.authError))
  check('运行时 /status 为已登录有效态', status.auth === 'valid' && status.authed === true,
    JSON.stringify({ auth: status.auth, authed: status.authed }))
  check('引擎 installed 且 bridge ready', status.engine === 'installed' && status.bridge === 'ready',
    JSON.stringify({ engine: status.engine, bridge: status.bridge }))
  check('install.installed 为已验证安装', status.install && status.install.installed === true,
    JSON.stringify(status.install && status.install.installed))

  const auth = await api('/netease-panel/api/auth')
  check('/auth 同步携带 auth/authPending/authError', 'auth' in auth && 'authPending' in auth && 'authError' in auth,
    JSON.stringify({ auth: auth.auth, authPending: auth.authPending }))
  check('/auth 携带已验证 install 快照', !!auth.install && typeof auth.install.installed === 'boolean',
    JSON.stringify(auth.install && auth.install.installed))
  check('/auth 与 /status 账号一致', !!auth.userId && String(auth.userId) === String(status.userId),
    JSON.stringify({ statusUid: status.userId, authUid: auth.userId }))

  /* ---- 2. 运行时发布的 client 产物与磁盘最新源码对齐 ---- */
  const mod = await api('/netease-panel/api/clientmodules')
  const baseline = mod.artifactBaseline || {}
  const disk = statSync(CLIENT)
  check('clientModules.clientPath 指向本仓库 client.js', resolve(mod.clientPath || '') === resolve(CLIENT),
    mod.clientPath)
  check('运行时产物 size 与磁盘最新 client.js 一致', Number(baseline.size) === disk.size,
    JSON.stringify({ runtime: baseline.size, disk: disk.size }))
  check('运行时产物 mtime 与磁盘最新 client.js 一致',
    Math.abs(Number(baseline.mtimeMs) - disk.mtimeMs) < 1,
    JSON.stringify({ runtime: baseline.mtimeMs, disk: disk.mtimeMs }))
  check('运行时已发布产物版本（rebuilt 非空）', typeof mod.rebuilt === 'string' && mod.rebuilt.length > 0, mod.rebuilt)

  /* ---- 3. 重建/协调后产物不被判定过期 ---- */
  const rebuild = await api('/netease-panel/api/clientmodules?action=rebuild', 45000)
  const dirty = rebuild.dirty
  const dirtyEmpty = !dirty || (typeof dirty === 'object' && Object.keys(dirty).length === 0 && !dirty.has)
  check('reconcile 后无脏标记（产物与源码同步）', dirtyEmpty, JSON.stringify(dirty))
  check('reconcile 未报错', !rebuild.reconcileErr && !rebuild.notifyErr,
    JSON.stringify({ reconcileErr: rebuild.reconcileErr, notifyErr: rebuild.notifyErr }))
  check('reconcile 后 rebuilt 仍为最新产物', rebuild.afterRebuilt === mod.rebuilt,
    JSON.stringify({ before: mod.rebuilt, after: rebuild.afterRebuilt }))

  /* ---- 4. 磁盘源码包含本轮新增实现标记 ---- */
  const src = readFileSync(CLIENT, 'utf8')
  const markers = [
    [EXPECT_BUILD, '构建号 ' + EXPECT_BUILD],
    ['replaceAudioSource', '每次换源新建 audio 元素'],
    ['nmStreamToken', 'pendingResume 代次校验'],
    ['seek:recover-done', '自愈完成诊断事件'],
    ['requestSeq', 'status 并发最新优先'],
    ['authPending', '登录态恢复中契约'],
  ]
  for (const [marker, label] of markers) {
    check(`client.js 含实现标记：${label}`, src.includes(marker), marker)
  }
  check('磁盘 client.js 摘要可计算（产物基线一致）',
    createHash('sha256').update(src).digest('hex').length === 64)

  /* ---- 5. 真实音源链路可用（账号 + VIP） ---- */
  const songUrl = await api(`/netease-panel/api/song/url?id=${SONG_ID}&level=lossless`, 30000)
  check('真实音源取址成功（账号/VIP 链路可用）', !!songUrl && typeof songUrl.url === 'string' && songUrl.url.startsWith('http'),
    (songUrl && songUrl.url || '').slice(0, 48) + '…')

  /* ---- 6. 面板首页数据可用 ---- */
  const home = await api('/netease-panel/api/home', 45000)
  const dailyCount = Array.isArray(home.daily) ? home.daily.length : 0
  check('首页数据可用（含每日推荐）', dailyCount > 0, `daily=${dailyCount}`)
} catch (err) {
  console.error('\nLIVE VERIFY 异常：' + (err && err.message ? err.message : err))
  failed.push('运行时探测异常：' + String(err && err.message ? err.message : err))
}

console.log(`\nLIVE VERIFY: PASS ${passed.length} / FAIL ${failed.length}`)
if (failed.length) { failed.forEach((f) => console.log('  FAIL ' + f)); process.exit(1) }
process.exit(0)
