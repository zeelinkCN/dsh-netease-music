# 网易云音乐 DSH 插件 — 实现契约（唯一事实来源）

> 本文件由 Lead 编写，`bridge` / `ui` / `verify` 三方并行实现前必须先读。
> 任何偏离本契约的实现，都必须先改本文件并在群里说明。

## 1. 目标

在 DeepSeek Harness Web UI 里做一个「网易云音乐」插件：

- 左侧栏有独立入口图标（`sidebar.panellist`，id = `netease-music`），点开是整页音乐界面（`main` 插槽，key = `netease-music`）。
- 界面：登录（扫码）、今日推荐、推荐歌单、我的歌单、收藏歌手、搜索、歌单/专辑/歌手详情、播放列表、歌词。视觉参考 Apple Music：大封面、圆角、玻璃质感、深色为主、跟随主题 token。
- 登录后可以真正播放（HTML5 audio，走 host 音频代理），播放控件常驻在**整个 Harness 最底部**（`shell.overlay` 悬浮 dock）。
- 数据引擎 = 用户给的 MCP 项目 `https://github.com/Code-MonkeyZhang/cloud-music-mcp`（`pyncm` 底层能力，比 MCP 的文本返回更结构化）。同一套登录态。

## 2. 进程架构

```
浏览器 (client.js: main 面板 + shell.overlay 播放条 + sidebar 图标)
   │  fetch('/netease-panel/api/*')
   ▼
Host 插件 index.js  ── NDJSON stdin/stdout ──▶  engine/cloud-music-mcp/.venv/bin/python server/bridge.py
   │                                                 │ pyncm → 网易云 API
   └── 音频代理 /netease-panel/api/audio?id=… ◀──────┘ （bridge 只给 URL，Node 负责流式转发）
```

- bridge 是长驻子进程（懒启动、崩溃自动重启一次）；一行一个 JSON，**请求/响应配对靠自增 id**。
- bridge 内部单线程串行处理即可；**登录轮询不能阻塞**：`login_start` / `login_check` 都是快速命令，轮询由 Node 侧定时发起。
- 同一时刻只允许一个 `login_*` 会话。

## 3. 文件所有权（避免写冲突）

| 路径 | 负责人 | 说明 |
| --- | --- | --- |
| `dsh-netease-music/docs/CONTRACT.md` | Lead | 本文件 |
| `dsh-netease-music/engine/**` | bridge | 克隆的 MCP 仓库 + `.venv` |
| `dsh-netease-music/server/bridge.py` | bridge | NDJSON 引擎 |
| `dsh-netease-music/index.js` | Lead | Host 插件 |
| `dsh-netease-music/package.json` `cordis.patch.yml` `locale/*` `icon.svg` | Lead | |
| `dsh-netease-music/client.js` | ui | 面板 + 播放条 + 侧栏图标 |
| `netease-panel-selftest/**` | verify | 离线 mock 服务 + headless Chrome 截图断言 |

不要改别人的文件；需要对方改动就发消息。

## 4. Python bridge 协议

启动：`engine/cloud-music-mcp/.venv/bin/python server/bridge.py`
环境变量：`NETEASE_COOKIE_FILE`（cookie json 路径，默认 `~/.dsh/netease-panel/cookies.json`）。
stdout **只允许**输出 NDJSON 协议行；日志一律写 stderr（Host 会转发到 `~/.dsh/netease-panel/bridge.log`）。
启动后立刻：加载 cookie（若有）→ 无效时匿名登录（`LoginViaAnonymousAccount`）→ 输出一行
`{"event":"ready","data":{"authed":false,"anonymous":true}}`（Host 用它判活，不是响应）。

请求：`{"id":"1","cmd":"status","params":{}}`
成功：`{"id":"1","ok":true,"data":{…}}`
失败：`{"id":"1","ok":false,"error":"人类可读中文错误","code":"UNAUTHENTICATED|NOT_FOUND|NETWORK|INTERNAL"}`

### 4.1 命令表

| cmd | params | data |
| --- | --- | --- |
| `status` | — | `{authed, anonymous, nickname, avatar, userId, vipType, level}` |
| `login_start` | — | `{key, qr, expiresIn}` — `qr` 为 `data:image/png;base64,…`（自己用 qrcode 生成，**不要** `open` 弹窗） |
| `login_check` | `{key}` | `{state:'waiting'\|'scanned'\|'expired'\|'ok'\|'error', status?, nickname?, avatar?, vipType?, userId?}` |
| `logout` | — | `{ok:true}` |
| `home` | — | `{daily: Track[], playlists: Playlist[], artists: Artist[], recommended: Playlist[]}` |
| `daily` | — | `{songs: Track[]}` |
| `my_playlists` | — | `{playlists: Playlist[]}` |
| `playlist` | `{id}` | `{playlist: Playlist, songs: Track[]}` |
| `artist` | `{id}` | `{artist: Artist, songs: Track[], albums: Playlist[]}` |
| `album` | `{id}` | `{album: Album, songs: Track[]}` |
| `search` | `{q, type:'song'\|'artist'\|'playlist'\|'album', limit?}` | `{items: Track[]\|Artist[]\|Playlist[]\|Album[], type}` |
| `subscriptions` | `{category:'artists'\|'albums'}` | `{items: Artist[]\|Album[]}` |
| `song_url` | `{id, level?}` | `{url, br, size, type, level, trial, expiresAt}` |
| `lyrics` | `{id}` | `{lrc, tlyric}`（原始 LRC 文本） |
| `ping` | — | `{pong:true}` |

`level`：`auto`（默认，按账号 vip 选 `exhigh`→`standard` 逐级回退）| `standard` | `exhigh` | `lossless` | `hires`。
`auto` 时如果全部失败返回 `{code:'UNAUTHENTICATED'}` 或 `{url:null}`，由 Host 透传。

### 4.2 归一化数据形状（**Host 与 Client 都只认这个**）

```jsonc
// Track
{
  "id": 441491828,
  "name": "水星记",
  "artists": [{"id": 2843, "name": "郭顶"}],
  "artist": "郭顶",
  "album": "飞行器的执行周期",
  "albumId": 35005583,
  "cover": "https://p2.music.126.net/…/2946691248081599.jpg",  // 必须 https，没有则 null
  "duration": 325266,        // ms
  "fee": 1,                  // 0 免费 / 1 VIP / 4 付费专辑 / 8 低音质免费
  "pop": 100,
  "mv": null,
  "alias": null,             // 副标题（如 "(Live)"）
  "vip": true                // fee===1 或 privilege 判断：仅用于 UI 小标
}

// Playlist
{
  "id": 14060780068,
  "name": "分手伤感温柔emo歌单",
  "cover": "https://p2.music.126.net/…/109951171972125480.jpg",
  "trackCount": 447,
  "playCount": 235106,
  "description": "…",
  "creator": "网易云音乐",
  "mine": false,
  "updateTime": 1720000000000
}

// Artist（头像可能拿不到 → avatar=null，UI 用首字渐变占位）
{
  "id": 6452,
  "name": "周杰伦",
  "avatar": null,
  "alias": ["Jay Chou", "周董"],
  "fans": null,
  "albumCount": 30,
  "songCount": 500,
  "description": "…"   // 截断 200 字
}

// Album
{
  "id": 35005583,
  "name": "飞行器的执行周期",
  "cover": "https://…",
  "artist": "郭顶",
  "artistId": 2843,
  "publishDate": "2016-11-25",
  "trackCount": 10
}
```

要求：
- 所有图片 URL 统一 `http://` → `https://`；`coverImgUrl`/`picUrl`/`al.picUrl` 都映射到 `cover`。
- 缺失字段用 `null`，不要省略键。
- `cover` 允许为空；UI 必须有占位。
- 歌单详情用 `apis.playlist.GetPlaylistAllTracks(id)`（分页取全量）或 `GetPlaylistInfo` + `trackCount` 对齐，返回最多 500 首。

## 5. Host REST 路由（index.js）

前缀 `/netease-panel/api`。统一信封：

```jsonc
{ "ok": true, "data": {…} }
{ "ok": false, "error": "中文错误描述", "code": "UNAUTHENTICATED|BRIDGE|NOT_FOUND|NETWORK|INTERNAL" }
```

| 方法 | 路径 | 返回 data |
| --- | --- | --- |
| GET | `/status` | `{bridge:'ready'\|'starting'\|'error', authed, anonymous, nickname, avatar, userId, vipType, level, error?}` |
| POST | `/login/start` | `{key, qr, expiresIn}` |
| GET | `/login/check?key=` | `{state, nickname?, avatar?, vipType?, userId?}` |
| POST | `/logout` | `{authed:false}` |
| GET | `/home` | 同 bridge `home` |
| GET | `/daily` | `{songs:Track[]}` |
| GET | `/playlists` | `{playlists:Playlist[]}` |
| GET | `/playlist?id=` | `{playlist, songs}` |
| GET | `/artist?id=` | `{artist, songs, albums}` |
| GET | `/album?id=` | `{album, songs}` |
| GET | `/search?q=&type=&limit=` | `{items, type}` |
| GET | `/subscriptions?category=` | `{items}` |
| GET | `/song/url?id=&level=` | `{url, br, size, type, level, trial}` |
| GET | `/lyrics?id=` | `{lrc, tlyric}` |
| GET | `/audio?id=&level=` | **音频字节流**（非 JSON），支持 `Range`，转发上游 `Content-Type`/`Content-Length`/`Accept-Ranges` |
| GET | `/img?u=` | 图片代理（`u` 是 encodeURIComponent 过的 url），用于封面占位兜底 |
| POST | `/refresh` | `{cleared:true}` |

约束：
- `/audio` 必须支持 Range（audio 拖动进度条依赖 206 + `Content-Range`）；上游 302 时跟随；`Referer: https://music.163.com/`、`User-Agent` 用桌面 Chrome。
- 缓存：`home` 10 分钟、`daily` 10 分钟、`playlist`/`artist`/`album` 30 分钟、`song_url` 5 分钟、`lyrics` 60 分钟；`/refresh` 清空。
- 写操作（login/logout）用 POST；其余 GET。
- 所有图片/音频响应带 `Cache-Control: public, max-age=…`。
- 路由注册用 `ctx.webServer.register`（`kind:'exact'` 或 `'prefix'`），并用 `ctx.effect` 返回清理。

## 6. Client 契约（client.js）

### 6.1 模块外壳

```js
window.__ModuleLoader__.load({
  id: '@local/netease-music',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // …组件…
    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        // 1) 注入 <style>（ctx.effect 清理）
        // 2) 创建全局 <audio>（ctx.effect 清理：pause + src=''）
        // 3) 注册 locale（zh/en）
        // 4) ctx.slots.inject('main', () => ctx.slots.register({name:'main', key:'netease-music'}, Page))
        // 5) ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist', id:'netease-music', order:30, label:()=>t('app.title')}, PanelIcon))
        // 6) ctx.slots.inject('shell.overlay', () => ctx.slots.register({name:'shell.overlay', id:'netease-music-player'}, PlayerDock))
      },
    }
  },
})
```

- `PanelIcon` 接收 ownerProps `{size, active}`，画 18–22px 的矢量图标（音符/唱片），描边/填充用 `currentColor` 系列，选中态可用品牌色。
- `Page`：整页；根节点用 `height:100%; overflow:auto; padding-top: var(--dsh-frame-top-clearance,48px); padding-bottom: 96px`（给播放条留位置）。
- `PlayerDock`：`position:fixed; left:0; right:0; bottom:0; pointer-events:none` 外层，内部胶囊 `pointer-events:auto`；**没有 current 曲目时不渲染任何东西**（不占位）。

### 6.2 播放器 store（Panel 与 Dock 共用）

模块级单例，暴露：

```js
player.getState()        // 快照
player.subscribe(fn)     // 返回取消订阅
player.playQueue(tracks, startIndex, contextTitle)
player.toggle()
player.next()  player.prev()
player.seekRatio(0..1)   // 或 seekSeconds
player.setVolume(0..1)   player.toggleMute()
player.setQueueOpen(bool)
player.playOne(track)    // 单曲插入队尾并播放
```

State：`{current, queue, index, playing, loading, position, duration, volume, muted, error, contextTitle, queueOpen}`。
- 内部 `<audio>` 元素（`preload='metadata'`）由 apply() 创建；`src = '/netease-panel/api/audio?id='+id+'&level=auto'`。
- `timeupdate` 更新 position（React 状态每 250ms 节流即可）；`ended` → next；`error` → 显示重试（下一首/重试当前）。
- 播放失败（url 为空/401）要让 dock 显示简短错误并允许跳过。
- 组件用 `useSyncExternalStore(player.subscribe, player.getState)`（React 18 可用；准备 fallback `useState+useEffect`）。
- 页面卸载/插件 dispose 时 audio 清空。

### 6.3 视觉规范（Apple Music 风）

- 只用主题 token：`--dsw-alias-label-primary/secondary`、`bg-base/layer-1/layer-2/overlay`、`border-l1/l2`、`brand-primary`、`state-success/warn/error-primary`、`--dsw-specific-sidebar-fill`。允许 `color-mix()` 派生；专辑封面用自身颜色。
- 字体：`-apple-system, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif`；正文 13px，标题 20–30px，大字 hero 34–44px，字重 600/700，负字距 `letter-spacing:-0.02em`。
- 圆角：卡片 16–20px，封面 10–14px，胶囊按钮 999px。阴影柔和、低透明。
- 布局：`max-width:1480px; margin:0 auto; padding:0 28px`。
  - 顶部栏（sticky）：左侧「网易云音乐」标题 + 副标题；右侧搜索框（圆角胶囊、聚焦发光）、刷新按钮、账号区（头像/昵称/VIP 标/未登录时「扫码登录」按钮）。
  - 未登录：面板顶部一条精致登录引导卡（不是强制遮罩）；点击弹二维码 Modal。推荐/歌单等匿名也能看（真实 API 支持），所以不阻塞浏览。
  - Hero：今日推荐大卡（渐变 + 封面拼贴 + 「播放全部」主按钮）。宽屏左右 62/38，窄屏上下。
  - 推荐歌单：`grid` 自适应 `repeat(auto-fill,minmax(168px,1fr))`，封面方图、hover 显示播放浮层、右下角播放量、名称两行截断。
  - 收藏歌手：圆形头像横向滚动（`scroll-snap`），无头像用首字渐变。
  - 今日推荐列表：行式，序号/播放中音浪动画/封面/歌名+副标题/歌手/时长/更多。hover 高亮。行点击=播放整列表。
  - 详情页（歌单/专辑/歌手/搜索结果）：返回箭头 + 大封面（160–200px）+ 标题/副标题/统计 + 播放全部/收藏歌手；下方曲目表。
  - 搜索：顶部 tab 内联，输入 300ms 防抖，结果分「单曲/歌单/歌手/专辑」切换。
  - 骨架屏（loading）、空态（未登录/无结果/网络错误 + 重试）。
- 响应式：≥1200 三列以上；768–1200 两列；<768 单列、hero 上下、字体缩小。不要横向溢出。
- 播放条：居中胶囊，`width:min(1080px, calc(100vw - 40px))`，高 64px，`backdrop-filter: blur(24px)` + `bg-overlay` 半透明 + 细边框 + 大阴影；左封面 44px/标题歌手，中控制（上一首/播放暂停/下一首）+ 进度条（hover 变粗、可拖拽、显示时间），右音量、播放列表、收起箭头；上方细进度条或内部进度条二选一。点击歌曲信息可跳回面板（`ctx.layout.selectPanel('netease-music')`）。
- 动效：`transition: 160ms ease`；播放中封面轻微呼吸/唱片旋转（`@keyframes`，`prefers-reduced-motion` 关闭）。
- 无障碍：按钮 `aria-label`/`title`，`role="slider"` 的进度条键盘可操作，Esc 关闭 Modal，Modal 有遮罩点击关闭 + 焦点样式。
- 不使用任何 Harness Client 包（严禁 `@deepseek-ai/dsh-client-ui-primitives`），控件自己写。

### 6.4 文案

- 默认中文；通过 `ctx.locale.register('netease-music','zh',{...})` + `'en'` 注册，`bind` 取翻译；拿不到翻译就回退中文常量（`t(key) || fallback`）。
- 所有用户可见文案走 `t()`。

## 7. 引擎安装（bridge 负责，Lead 已试通）

```bash
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 ALL_PROXY=http://127.0.0.1:7897
export UV_CACHE_DIR="$PWD/../.uv-cache"   # 任意可写目录
cd dsh-netease-music/engine
git clone --depth 1 https://github.com/Code-MonkeyZhang/cloud-music-mcp.git
cd cloud-music-mcp
uv venv --python python3 .venv
uv pip install -p .venv/bin/python -e .
.venv/bin/python -c "import pyncm, qrcode; print('ok')"
```
注意：
- 系统 `~/.cache/uv` 不可写，必须 `UV_CACHE_DIR` 指到工作区。
- 该仓库 `src/cloud_music_mcp/api.py` 里 `from auth import load_session` 是坏的相对导入，**直接 import 会炸**；bridge 只用 `pyncm`，不要 import 仓库里的 api.py。
- 网易云接口需要代理才能访问（上面已设）。
- 登录态 cookie 由 bridge 自己存（`~/.dsh/netease-panel/cookies.json`），并**尽力镜像**一份到 `engine/cloud-music-mcp/src/cloud_music_mcp/storage/cookies.json`，让 MCP 服务器行共享登录态。

## 8. 验证

1. bridge：`node server/selftest.mjs` 或 python 自测脚本，覆盖 status/daily/playlists/playlist/search/song_url/lyrics 与错误路径。
2. host：routes 冒烟（bridge 真跑或 mock）。
3. client（verify 负责）：离线 harness = 本地静态服务（mock `/netease-panel/api/*`）+ React 18 UMD + `__ModuleLoader__` stub + headless Chrome CDP 截图。参考已有实现：`garmin-panel-selftest/`（server.mjs / harness.html / run.mjs）。断言：无 console.error、无页面异常、slot 注册、登录→首页→歌单详情→搜索→播放条出现/进度/切歌、浅色/深色主题、600px 窄屏无横向溢出。
4. 真实安装：`plugin_manager install_bundle` 后用 `cordis_inspect_query` 确认 3 个 slot 注册成功，再让用户扫码登录。

## 9. 离线 harness 约定（ui ↔ verify 共用）

`client.js` 必须带上这些稳定钩子（harness 只认它们，不认样式类名）：

| 钩子 | 位置 |
| --- | --- |
| `data-nm="root"` | Page 根容器 |
| `data-nm="tabs"` | 顶部 tab 容器 |
| `data-nm="tab"` `data-tab="recommend\|playlists\|artists\|search"` | 每个 tab 按钮 |
| `data-nm="hero"` | 今日推荐 Hero 卡 |
| `data-nm="play-all"` | Hero 的「播放全部」 |
| `data-nm="section"` `data-section="recommended\|mine\|daily\|artists\|results"` | 各区块 |
| `data-nm="cover-card"` `data-kind="playlist\|album\|artist"` `data-id="<id>"` | 网格卡片 |
| `data-nm="track"` `data-id="<songId>"` | 曲目行 |
| `data-nm="track-play"` | 曲目行内的播放按钮 |
| `data-nm="login-open"` | 打开二维码登录的按钮 |
| `data-nm="login-modal"` | 二维码 Modal |
| `data-nm="qr"` | 二维码 `<img>` |
| `data-nm="login-state"` `data-state="waiting\|scanned\|ok\|expired"` | 登录状态行 |
| `data-nm="detail"` | 歌单/专辑/歌手详情容器 |
| `data-nm="back"` | 详情页返回 |
| `data-nm="search-input"` | 搜索输入框 |
| `data-nm="search-results"` | 搜索结果容器 |
| `data-nm="skeleton"` / `data-nm="empty"` / `data-nm="error"` | 加载/空/错误态 |
| `data-nm="player"` | 底部播放条胶囊（无曲目时**整条不渲染**） |
| `data-nm="player-toggle"` | 播放/暂停 |
| `data-nm="player-next"` `data-nm="player-prev"` | 切歌 |
| `data-nm="player-progress"` | 进度条容器（内部 slider） |
| `data-nm="player-queue-toggle"` | 队列按钮 |
| `data-nm="player-state"` `data-playing="true\|false"` | 播放条根节点状态标记 |

harness 的 mock 服务必须与第 5 节路由/信封完全一致；`/audio` 返回一段可播放的短 WAV（静音或正弦波），并支持 Range。
登录 mock：`/login/start` 返回固定 QR SVG data URL；`/login/check` 前 2 次 `waiting`，第 3 次 `scanned`，第 4 次 `ok`。


## 10. v2 需求（用户第二轮反馈，2026-11-05）

### 10.1 Logo 统一（官方红标）
- 面板左上角 `.nm-logo` 必须使用官方网易云红底白音符 PNG（与侧栏图标同一份 `ICON_DATA`），不得再用自绘音符矢量。
- 尺寸 24–28px，圆角约 23%，深浅色不变色。

### 10.2 全屏播放页（Now Playing，像网易云桌面端）
- 入口：① 点击曲目行 → 播放该列表并进入播放页；② 点击底部播放条的封面/歌名 → 进入播放页；③ 播放页返回/Esc → 退出播放页，音乐不中断。
- 布局（≥900px 左右分栏）：左侧大黑胶/封面 + 歌名/歌手/专辑 + 控制 + 进度；右侧歌词滚动区（同步高亮、自动居中、点击行跳播）。窄屏上下堆叠。
- **两种展示模式，用户可切换并记住**：`vinyl`（旋转黑胶）/ `lyrics`（滚动歌词）。默认 `vinyl`；持久化 `localStorage['netease-music:np-mode']`。进入播放页时使用上次选择。
- 黑胶：圆形黑胶唱片 + 封面做盘心标签，播放时旋转（CSS animation，暂停即停），`prefers-reduced-motion` 关闭动画。
- 歌词：解析 `/lyrics` 的 LRC（`[mm:ss.xx]`），过滤无时间戳的头部行；当前行品牌红高亮，前后行降透明度；`tlyric` 有翻译时作为副行。
- 无歌词：显示「纯音乐 / 暂无歌词」占位。
- 播放页还要有：音质选择、音量、播放队列、上一首/播放暂停/下一首、进度拖拽。

### 10.3 播放条独占底部空间（不再悬浮遮挡输入框）
- 优先注册到 `shell.bottom`（root 级 single 槽：占位内容会压缩三栏高度，空内容不占空间）→ 输入框会被顶上去。
- 若 `shell.bottom` 注册抛错（被其它插件占用/单槽限制），自动回退注册 `shell.overlay`（旧悬浮胶囊），并在容器上加 `data-dock="float"`；正常停靠时 `data-dock="bottom"`。
- 停靠形态：整条全宽、高约 72px、顶部 1px 边框 + layer-1 玻璃、内容 max-width 1480 居中；不再用 fixed/圆角胶囊/大阴影。
- 没有当前曲目时渲染 null（不占空间）。
- 面板内容底部 padding：停靠时 16px，回退悬浮时 96px。
- 点击封面/歌名 → 进入播放页。

### 10.4 音质选择（用户抱怨音质低）
- Host 已支持 `/song/url?level=`、`/audio?level=`：`auto|standard|exhigh|lossless|hires`（登录会员账号实测 exhigh=320k、lossless/hires=1.5Mbps）。
- UI：播放条与播放页各有一个音质菜单（自动/标准/较高/极高/无损/Hi-Res），默认 `auto`，持久化 `localStorage['netease-music:quality']`。
- 切换音质：<audio> 的 src 换成新 level，保持播放进度与播放/暂停状态（loadedmetadata 后 seek + play）。
- 显示当前实际档位与码率（`/song/url` 返回 `level`/`br`/`trial`）；`trial:true` 时标「试听」。
- 未登录或非会员时，菜单里对不可用档位给「需登录/会员」提示；不要静默降级。

### 10.5 新增 harness 钩子
| 钩子 | 位置 |
| --- | --- |
| `data-nm="nowplaying"` | 播放页根 |
| `data-nm="np-back"` | 返回 |
| `data-nm="np-mode"` `data-mode="vinyl\|lyrics"` | 模式容器 |
| `data-nm="np-mode-vinyl"` / `data-nm="np-mode-lyrics"` | 模式切换按钮 |
| `data-nm="np-vinyl"`（播放中加 class `is-spinning`） | 黑胶 |
| `data-nm="np-lyrics"` | 歌词容器 |
| `data-nm="lyric-line"` `data-active="true\|false"` `data-time="<sec>"` | 歌词行 |
| `data-nm="np-quality"` / `data-nm="quality-menu"` / `data-nm="quality-option"` `data-level="<level>"` | 音质菜单 |
| `data-nm="dock"` `data-dock="bottom\|float"` | 播放条根 |
| `data-nm="dock-cover"` | 播放条封面（点击进播放页） |
| `data-nm-audio` `data-level="<current level>"` | <audio>，断言 src 里含 `level=` |

验收要求（verify）：点曲目行 → `nowplaying` 出现且 `audio` 在播；切「歌词」→ 歌词行 ≥5 且有 `data-active="true"`；切「黑胶」→ `np-vinyl` 有 `is-spinning`；切音质到 `lossless` → audio.src 含 `level=lossless` 且播放位置大致保持；点击 dock 封面 → 进入播放页；dock 根 `data-dock` 为 `bottom`；返回后列表仍在；深/浅色各一张播放页截图（vinyl + lyrics 各一张）。
