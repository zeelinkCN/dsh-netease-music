# Changelog

## v1.1.0 — 2026-11-06

修复「界面永远显示未登录」「进度条拖不动」两个真机问题，并在搜索页加醒目搜索框。

- **登录态显示修复（根因）**：`useStatus` 中误用了作用域外的 `adoptHttpBase`，每次读取 `/status` 都抛 `ReferenceError`，界面因此一直判定「登录态读取失败」→ 长期显示「扫码登录」按钮与登录横幅。改为 `player.adoptHttpBase(...)`，并用轻量 `/auth` 快照做兜底。
- **进度条无法拖动修复（根因）**：App 页面运行在 `dsh-app://` 自定义协议下，媒体请求经该协议转发会丢 `Content-Length`，浏览器因此判定 `<audio>` 不可 seek（`seekable=[0,0]`）。音频改为走真实 HTTP 绝对地址（`http://127.0.0.1:<port>/netease-panel/api/audio`，由 `/status.httpBase` 提供），并保留自愈重建、日志与 5s 节流。
- **音频代理**：整段请求回 200（不再回 206 全量）、`Cache-Control: no-store`、不转发 ETag、支持 CORS，避免浏览器复用被中断的局部缓存。
- **搜索页**：切到「搜索」tab 后内容区新增通栏大搜索框（自动聚焦、Enter 搜索、与顶部搜索框同步），不再只有空状态提示。
- **可维护性**：新增 `/httpbase`、`/auth`、`/clientmodules`（诊断/热重建客户端 bundle，无需重启 App）等本机接口；状态类响应统一 `no-store`。
- 验收：浏览器端 harness 全量回归（新增搜索页搜索框断言）。

## v1.0.2 — 2026-11-06

进度条拖动（音源被浏览器判定不可 seek）根因修复 + 自愈。

- **真机日志定位**：拖动时 `audio.seekable = [[0,0]]`（浏览器认为整首不可跳转），`currentTime` 被钳到 0，表现为「进度条动了声音还在旧位置 / 松手跳回 0:00」。
- **自愈式重建**：检测到 `seekable` 异常或 seeked 落地偏差 >3s 时，**新建 `<audio>` 元素**重建媒体管线（`pendingResume` 回到目标位置），旧元素移除；每 5s 最多一次，失败 toast「当前音源暂时无法跳转」。
- **缓存隔离**：音频 URL 每次加载追加 `&_=<timestamp>` 缓存击穿；Host 音频响应改为 `Cache-Control: no-store, no-transform` 且不再转发 ETag，避免复用被中断的局部媒体缓存。
- **可观测性**：`seek:recover / seek:recover-new-element / seek:recover-done / seek:recover-skip` 与 `media:loadedmetadata(seekable)` 走优先日志桶（不受 20 条/分钟普通配额限制）；Host 增加 `[audio-req]/[audio-resp]` 头日志。
- 验收：372/372 断言通过（新增新元素重建、缓存击穿、落点恢复、5s 节流、响应头 no-store、日志预算等断言）。

## v1.0.1 — 2026-11-06

进度条拖动兜底与真机诊断加固。

- **去掉会跳到 0:00 的兜底**：seek 超时不再重载 `audio.src`；6s 无 `seeked` 只重试一次 `currentTime`，12s 仍无则 toast 并恢复真实位置，绝不把进度重置到 0。
- **修掉 metadata 未就绪分支卡死**：`pendingSeek` 分支补齐 seek 监控，`seeking` 不会永远停在 true（避免「进度条停在目标位置、声音还在旧位置」）；`endSeekHold` 在 seek 在飞时不再用旧 `currentTime` 回写。
- **不可 seek 音源的友好提示**：`audio.seekable` 为空时提示「当前音源不支持拖动进度」并恢复位置。
- 新增客户端诊断日志（`POST /netease-panel/api/clientlog` → `~/.dsh/netease-panel/bridge.log`），上报 `seek:commit / seek:pending / seek:seeked / seek:timeout / audio:error / play:reject`；音频代理增加 Range 请求日志。
- 面板底部显示构建时间戳（`data-nm="build-stamp"`），便于确认页面是否为最新版。
- 验收：357/357 断言通过（新增 clientlog mock、无 reload 兜底、build-stamp、seekable=0 等场景）。

## v1.0.0 — 2026-11-06

首个正式版本：在 DeepSeek Harness 里边工作边听网易云音乐。

### 入口与界面
- 左侧栏官方网易云红标入口（图标为官方红底白音符 PNG，内联，深浅色不变色），点开是整页音乐界面。
- 首页「听歌模式」大 banner 无缝轮播：心动模式 / 漫游·私人 FM / 相似歌曲 / 相似艺人 / 每日推荐；6s 自动 + 箭头/圆点/滑动，悬停暂停，点卡片直接播放。
- 推荐（今日推荐 / 推荐歌单 / 收藏歌手）、歌单（我的/收藏，全量曲目 + 加载更多）、搜索（单曲/歌单/歌手/专辑）、歌单/专辑/歌手详情页。
- 扫码登录（面板内二维码 + 轮询状态）；账号区显示头像/昵称/VIP，可退出登录。

### 播放
- 音乐面板内页内播放条（不悬浮、不遮挡）：封面/歌名/上一首/播放/下一首/可拖拽进度条/音量/音质/队列/红心。
- 回到对话或其它面板：播放器收进**左侧栏 Settings 上方的迷你播放器**（通栏 255px、四个控件铺开、56px rail 只留封面）。
- 全屏播放页：黑胶（封面模糊背景 + 正圆黑胶，盘心封面 58%）与歌词（全屏滚动、当前行高亮、点行跳唱、翻译副行）**严格互斥**，切换记忆偏好；底部保留整条工具栏。
- 音质：自动 / 标准 / 较高 / 极高 / 无损 / Hi-Res，切换保持进度；显示实际码率与「试听」标记；实测会员账号无损 FLAC 1.51 Mbps 可播。
- 红心收藏：曲目行 hover、播放页歌名旁、播放条三处同步，写入「我喜欢的音乐」；未登录只提示不发请求。
- 进度条拖动修复：按下即跳、拖动节流提交、seek 期间不被旧进度覆盖、全局 pointerup 兜底、pendingSeek、失败重载。

### 对话里点歌（Agent）
- 新增 `netease_play`（搜索词 / 听歌模式 / 歌单 / 专辑）与 `netease_player`（状态 / 暂停 / 继续 / 切歌 / 跳进度 / 音量 / 收藏 / 搜索）两个 Harness 工具。
- 播放不切面板、不启动桌面客户端；`cloud_music_play` / `cloud_music_login` 被 `tools.guard` 拦截并引导改用插件；系统提示同步说明。
- 客户端常驻轮询 `/api/player/commands`（基线 cursor 防重放）执行播放/控制/红心指令，并每 2s 上报 `/api/player/state`。

### 数据引擎与安装
- 基于上游 [cloud-music-mcp](https://github.com/Code-MonkeyZhang/cloud-music-mcp) 的 Python 依赖（pyncm + 登录态）常驻 NDJSON 引擎：home / daily / playlist / artist / album / search / subscriptions / song_url / lyrics / login / like / mode。
- **装插件即自动装引擎**：首次激活自动 `git clone` + 建 `.venv` + `uv/pip install`，面板内显示阶段/日志/重试；登录态与 MCP 共享。
- 音频代理支持 Range/206，按真实编码返回 Content-Type（FLAC 无损可播）。
- 跨平台：macOS / Linux / Windows 的 venv（`bin/python` vs `Scripts/python.exe`）、`uv.exe`、`pip.exe` 路径自动适配。

### 验收
- 引擎自测 41/41（真实网络 + 真实登录态，含收藏回滚不污染用户数据）。
- 浏览器端 headless Chrome harness：**342/342 断言、39 张截图**，覆盖登录/播放/歌词/音质/红心/轮播真实指针/拖拽/播放页布局/Agent 命令/状态上报/主题/响应式/错误态。
