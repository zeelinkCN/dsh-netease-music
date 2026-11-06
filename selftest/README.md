# netease-panel 离线验收（verify）

只验证 `dsh-netease-music/client.js`（不启动真实 host / bridge / 网易云 / LLM）。
真实 Chrome headless + React 18 UMD + 真实 client.js，后端全部走本地 mock。

## 运行

```bash
NODE="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"
cd netease-panel-selftest
"$NODE" run.mjs            # 验收 dsh-netease-music/client.js（不存在时退出码 2）
"$NODE" run.mjs; echo $?   # 0 = 全绿；1 = 有 FAIL；2 = client.js 未交付；3 = 无 Chrome；4 = watchdog
```

- 只写本目录：`shots/`（每次运行前清空）、`tmp/`（Chrome profile / 临时日志，结束清理）。
  不写 `~/.dsh`、不改插件源码。
- 每次运行输出 PASS/FAIL 清单、截图路径，并落盘 `last-run.log`（含页面 console 错误原文）。

## 文件

| 文件 | 作用 |
| --- | --- |
| `server.mjs` | 静态服务 + 全部 `/netease-panel/api/*` mock，严格按 CONTRACT 第 5 节信封 |
| `harness.html` | React 18 UMD + `__ModuleLoader__` stub + 假 ctx（捕获 main / sidebar.panellist / sidebar.footer.action；v3 起 client 不再注册 shell.bottom/overlay）+ 假三栏布局（侧栏可展开 280px / 收起 56px，footer 槽渲染迷你播放器，注入 `usePanelInfo` 模拟面板切换）+ 面板内 64px 假输入框 + DSH token 主题快照 |
| `run.mjs` | headless Chrome CDP 驱动：截图 + 脚本化断言 + PASS/FAIL 清单 |
| `assets/react.js` `assets/react-dom.js` | 离线 React 18 production UMD（与 garmin-panel-selftest 同一份） |
| `shots/*.png` | 验收截图（见下） |
| `last-run.log` | 最近一次运行的完整结果 |

## mock 数据 / 能力

- `/home`：`daily=30`、`recommended=18` 张歌单、`playlists/artists` 按登录态返回（未登录为空，贴真实 bridge 行为）。
- 歌单/专辑/歌手/搜索/歌词/`subscriptions`：契约 4.2 归一化形状；缺失字段为 `null`。
- 第一个推荐歌单是长列表（mock 详情 120 首，验证 100 行分页 + 「加载更多」）。
- 封面 = 本地生成的渐变 SVG data URL（离线、可截图）；封面缺失的曲目/歌手用于验证占位。
- `/audio` = **8s** 22050Hz mono PCM 正弦波 WAV，支持 `Range` / `206` / `Content-Range`，并按 `?level=` 回 `X-NM-Level` / `X-NM-Br` 头；
  client 的 `<audio src=/netease-panel/api/audio?...>` 可直接播放、推进 `currentTime`，并在 ended 后自动下一首。
- `/lyrics`：14 行密集时间戳 LRC（0–18.2s，每 1.4s 一行）+ `[ti:]/[ar:]/[al:]` 元数据头（非时间戳，UI 应过滤）+ `tlyric` 前 6 行翻译，用于验证歌词高亮/点击跳播。
- `/song/url?level=`：`auto→exhigh/320000`、`standard/128000`、`exhigh/320000`、`lossless/1512987`、`hires/1512987`；`trial` 可用 `/__config {trial:true}` 打开。
- `/img?u=` 返回本地 SVG 兜底（client 封面失败 fallback 用）。
- `/login/start` 返回固定 QR SVG data URL；`/login/check` 第 1、2 次 `waiting`、第 3 次 `scanned`、第 4 次 `ok`（契约第 9 节）。
- v4 `/mode?type=heart|roam|similar_song|similar_artist|daily&songId=&artistId=&limit=`：返回 `{type,title,subtitle,resolvedSeed,fallbackUsed,songs}`，5 种 type 各 12–20 首；`fallbackUsed` 在无 seed 的 roam/similar_song 时为「今日推荐第一首」；`/__config {modeError:'empty'|'error', modeHangMs}` 模拟空数据/接口错误/挂起超时（UI 应 toast + 可重试）。
- v4.1 收藏红心：`GET /like/status?ids=` 返回 `{liked:{id:bool}, authed}`（默认偶数 id 已收藏）；`POST /like {id, like}` 翻转并返回 `{ok,id,liked}`；`/__config {likeAuthed:false}` 模拟未登录（/status`authed:false` 需配合配置+reload），`{likeError:true}` 模拟收藏失败回滚。
- v5 Agent 播放桥：`GET /player/commands`（无 cursor 返回基线 `{cursor,commands:[]}`；带 cursor 返回 seq>cursor 的命令）；`GET/POST /player/state` 记录客户端上报的当前曲目/队列；`/__config {playerCommand:{...}}` 注入 `playQueue` / `control` / `refreshLike` 命令。
- v5.1 seek 加固诊断：`POST /clientlog` 存档请求体（`GET /__logs` 回读 `clientLogs`/`commandPosts`；`/__config {clearLogs:true}` 清空存档）；播放器面板底部 `[data-nm="build-stamp"]` 显示构建版本+时间（当前 `更新于 v1.0.2 · 2026-11-06 11:19`）。
- v5.2 自愈式 seek：mock `/audio` 响应头对齐 Host（`Cache-Control: no-store, no-transform`、不转发 ETag），URL 忽略 `&_=` 缓存击穿参数。
- v1.1 搜索页/全屏/播放模式：搜索 tab 大搜索框 `search-page-input` + `search-page-submit`；曲目行 `row-fullscreen`、播放页 `np-fullscreen`（原生 Fullscreen API）、`np-back`；`dock-expand`（打开播放页）；dock/NP `play-mode`（列表/顺序/单曲/随机循环，localStorage 持久化）；`build-stamp`；clientlog 仅保留 seek/recover 诊断（无 probe/media/audio/status 事件）。
- v3 引擎安装：`POST /setup/install` 启动状态机（clone→venv→pip→verify→done，约 3.2s），`GET /setup/install/log` 返回 `{state,phase,lines,error,installed}`；`/status` 带 `engine:'installed|missing|installing|failed'` 与 `install` 摘要。`/__config {installError:true}` 可模拟失败。
- 控制面：`POST /__config`（`authed` / `bridge:'ready'|'starting'|'error'` / `engine` / `installError` / `errorMode:null|'home'|'all'` / `slowMs` / `trial`），`GET /__calls`，`POST /__reset`。
  - `bridge:'error'` → `/status` 报 `bridge:'error'`，数据接口 503 `code:'BRIDGE'`（验证「引擎缺失」不白屏）。
  - `errorMode:'home'` → 数据接口 500 `code:'NETWORK'`（验证错误态 + 重试原地恢复）。

## 断言覆盖（432 项，v1–v1.1.0）

1. 模块：client.js 加载、`__ModuleLoader__.load`、3 个 slot 注册及 spec（`main.key`、`sidebar.panellist.id/order=30`、`shell.overlay.id`）、`<audio data-nm-audio>` 创建、无曲目时播放条不渲染。
   侧栏图标：`<img>`、`src` 为 `data:image/png;base64,`（官方红标）、`naturalWidth>0`、渲染尺寸 = 传入 size(20)，深/浅色各一张 4x 放大截图。
2. 未登录：登录引导可见、不强制遮罩；`.nm-btn.login` / 激活 tab 对比度；打开二维码 Modal；`login-state` `waiting→scanned→ok`；登录后昵称显示；轮询命中 mock 状态机。
3. 首页：hero、播放全部、推荐歌单卡 ≥6、今日推荐行 ≥10。
4. 播放：播放全部 → `player` 出现 / `data-playing=true`；`player-toggle` 内有 `svg` 且图标对比度 ≥2.5；`audio.src` 指向 mock `/audio` 且非 paused；3s 内进度前进；下一首切歌（audio src id 变化）；暂停后 false；队列面板展开/Esc 收起；点曲目行播放整列表；3s 试听 ended 后自动下一首。
5. 歌单详情：封面卡 → `detail` → 100 行 → 加载更多 120 行 → 返回。
6. 搜索：输入「周杰伦」→ 结果出现且命中；`/search` 请求发生；无结果关键词 → `data-nm="empty"` 空态。
7. 主题与响应式：深/浅色截图；`[data-nm="play-all"]` 对比度 ≥3、激活 tab ≥2.5；真实 DSH 默认主题（`brand-primary` 注入中性 `#f9fafb`）下「播放全部」仍可读；1440 / 1024 / 600 三档 `scrollWidth <= clientWidth+1`。
8. 错误模式：`/home` 500 → `data-nm="error"` + 后端中文错误文案（非 `Invalid status code`）；点「重试」原地恢复。
9. 引擎缺失：`/status bridge=error` → 页面不白屏 + 显示安装提示；恢复后首页重新渲染。
10. v2/v3 播放页（契约 §10.5 / §11）：
    - 停靠/槽位：client 不再注册 `shell.bottom` / `shell.overlay`；面板内 `[data-nm="dock"]` 在 `[data-nm="root"]` 内、`position != fixed`、dock.top ≥ scroll.bottom、不遮挡输入框；`sidebar.footer.action` spec（id=netease-mini、order=10）。
    - mini player：宽侧栏(280px) 时两行卡片，mini 占满 footer 宽度（差 <2px）、左右对齐（<1px）、高 78–92（实测 86）、不压 Settings、footer 无横向溢出；第一行 封面+歌名+右侧音量（音量中心 y 在第一行、右侧留白 11px），第二行仅 prev/播放/next 三个传输键水平居中对称（左右留白 62/61、播放键中心=卡片中心、相邻中心距 66/66）；`mini-prev/mini-toggle/mini-next/mini-volume` 存在且 prev/next 切歌；音量点击/聚焦出现浮层滑杆且卡片几何不变（宽高差 <1px）；56px rail 时只显示 34×78 封面（无 prev/next/toggle/volume）；面板切到 netease-music 时 mini 隐藏、面板内 dock 出现；点 mini 封面 → selectPanel + 播放页。
    - 播放页互斥：默认 vinyl 有 np-vinyl/is-spinning、无 np-lyrics；lyrics 有 lyric-line ≥5 且恰好一行 active、无 np-vinyl；切回 vinyl 恢复旋转；np-bg 存在且含封面 URL + blur；点黑胶只切换 data-playing、模式仍 vinyl。
    - 黑胶圆形：np-vinyl、盘心 label、封面 img 宽高相等 + border-radius/clip 50%。
    - 歌词：时间推进后 active 行变化；点击行 → audio.currentTime 跳到 data-time 附近且该行 active。
    - 音质：np-quality → quality-menu → lossless → audio.src 含 `level=lossless`、audio data-level=lossless、位置差 <2s。
    - 返回：np-back/Esc 回列表；dock-cover 重进播放页；浅色播放页截图。
11. v3 header：滚动 800px 后 `[data-nm="header"]` 贴面板顶（差 <2px）、背景 alpha ≥0.9、高度覆盖 clearance 且 ≤56px、sticky/fixed；header logo 为 PNG dataURL img（naturalWidth>0、≤26px）。
12. v3 引擎无感安装：engine missing → 出现安装 UI/日志/进度 → 点安装（或自动）→ done 后卡片消失、自动渲染首页、`/status.engine=installed`；失败态显示 error + `engine-retry`。
13. v4 Hero 轮播 + `/mode`：`hero-carousel`、7 张 `carousel-card`（5 真实 + 2 clone，clone `data-clone=true`）、5 种 mode；next/prev 换卡；7s 自动切换；hover 后 7s 暂停；transition 360ms；最后一张 → next 平滑回绕（中途 transform 位移、结束 activeDot=0），第一张 → prev 回绕到最后；6s 自动在最后一张平滑绕回第一张；点 similar_song 卡（无在播）请求带 `songId=今日推荐第一首`；点 daily 卡切换播放；`modeError:'error'/'empty'` 时 toast 出现且不崩溃。
14. v4 播放页布局纠正：进入 Now Playing 后底部 dock 必须存在（`dock=1`），**全页 `player-progress` 恰好 1 条且播放页内部 0 条**，传输键组只有底部一组（NP 内 0 组）；黑胶盘心 label 直径/盘面直径 ≈0.58（±0.03）且 label/img 正圆；返回列表 dock 恢复。
15. seek 回归：慢速 seek（`data-seeking=true` 保持、松手不回落、完成后 ≈70%）、真实时序拖拽 70%、点按 50%、pointerup 派发到 body 仍提交 30%、metadata 迟到 pendingSeek 生效 ≈60%、键盘 ArrowRight/Home/End、命中高度 22px。
16. v4.2 真实指针（CDP Input.dispatchMouseEvent，非合成 click）：五张卡 CTA 真实鼠标点击各发 1 次 `/mode` 且切歌、整卡非按钮区真实点击播放、拖拽 200px 只切卡不误播、clone 卡 aria-hidden/pointer-events:none 真实点击不播错 mode、`/mode` 挂起 9s→8s 超时 toast「请求超时，请重试」→卡片可重试→后续点卡仍播放。
17. v4.1 收藏红心：hover 曲目行出现可命中的 `track-like`；点击未收藏→`data-liked=true` 且 POST 恰好 1 次；再点→false；失败（likeError）→toast + data-liked 回滚且仍只 POST 1 次；未登录（/status authed=false + reload）点击→toast 且**不发 POST**；播放页 `np-like` 与当前曲目状态一致、点击翻转、切歌后随歌曲变化；`dock-like` 与 np-like 同步；`/like/status` 批量 ids、每批 ≤1 次。
18. v5 Agent 播放桥：页面加载先发一次不带 cursor 的基线请求、随后 1200ms 带 cursor 轮询（5s 内 4 次、最小间隔 1202ms，≤1 次/秒）；注入 `playQueue` 后 2s 内 audio 播放首曲、dock 出现、「开始播放」toast、**active panel 不切换**；POST `/player/state` 的 `current.id/name/artist/album/liked`、`queueLength/contextTitle/queue≤20` 正确且 `position` 递增；注入 `control` pause/resume/next/prev/seek(3s)/volume(0.3) 后 audio 状态相应变化、上报 playing/current.id 更新；注入 `refreshLike` 后 dock-like / np-like / 列表 track-like 三处 `data-liked=true`；对话页（面板隐藏）时左侧 mini-player 出现并显示曲目；重载后从基线重新轮询、无叠加。
19. v5.1 seek 加固：meta 未就绪（slowAudio 2.4s）时真实指针拖到 55% → metadata 到达后 `currentTime≈55%`、`aria 61` 不回 0、`data-seeking=false`；4.5s 后目标仍 ≈55%、无额外 `/audio` 整段重载、src 未换源（旧 4s reload 已删）；`audio.seekable.length=0` 时（测试内 monkeypatch 原型）拖拽 → toast「不支持拖动」+ 恢复真实位置不跳 80%；`build-stamp` 存在且含版本+日期；`POST /clientlog` 有上报且 `seek:commit/pending/seeked` 事件体合法（21 条/本轮）；`POST /player/commands`（如有）请求体合法。
20. v5.2 自愈式 seek（Chrome 把 audio 判定为不可 seek）：monkeypatch `seekable` 为 `[0,0]` 后真实鼠标拖到 60% → clientlog `seek:recover` / `seek:recover-new-element`；新 `/audio` 请求带新的 `&_=` 缓存击穿参数、`[data-nm-audio]` 元素实例被替换且旧元素移除（恰好 1 个）、新 src 含 `_=`；新元素 loadedmetadata 后 `currentTime≈4.6s`、`aria≈58` 不回 0、`data-seeking=false`、`seek:recover-done` + `seekable=[[0,8]]`；5s 内二次异常拖拽走 `seek:recover-skip` 且不再新建元素；`/audio` 响应头 `no-store` 且无 ETag；普通 clientlog ≤20 条/分钟（recover 优先桶独立）。
21. v1.1 搜索页大搜索框：搜索 tab 出现 `search-page-input`（高 46、圆角 12、左侧图标、通栏）与红色 `search-page-submit`；切 tab 自动 focus；双向 query 同步；Enter/按钮触发结果（debounce 320ms）；600px 小屏输入框占满且无横向溢出、顶部搜索框仍在。
22. v1.1 列表点歌只播放：点曲目行/`track-play`/播放全部不自动开 NP，dock 出现、tab/列表不变；点第二首仍切歌并停留列表；`dock-expand` 文案「打开播放页」、显式点击才进 NP（非全屏）；`row-fullscreen` 文案「全屏播放」。
23. v1.1 原生全屏：`row-fullscreen` 真实鼠标手势触发 requestFullscreen，全屏 root 宽高=视口、dock 可见、全页 progress 1 条；全屏中 Esc 不关 NP；`np-fullscreen` 退出/再进入且文案切换；**全屏中点 `np-back` 会 exitFullscreen + 关闭 NP + 回列表且播放不中断**；`.nm-np:fullscreen` CSS 存在。
24. v1.1 播放模式：dock 与 NP 各有 1 个 `play-mode`；列表→顺序→单曲→随机→列表循环、title/localStorage/toast 正确；单曲循环 ended 重播同一首；列表循环最后一首 ended 回第一首；顺序播放最后一首 ended 停止；随机 ended 切其它歌。
25. v1.1 清理：build-stamp 匹配「更新于 v1.1.0 ·」且无「登录态」；clientlog 无 probe:audio*/media:*/audio:created/audio:bind/status:auth/status:error；seek:recover* 仍保留；普通日志 ≤20/min。
26. 运行期：无 `console.error`、无未捕获页面异常；重新播放后播放条恢复。

## 截图

| 文件 | 内容 |
| --- | --- |
| `shots/00-sidebar-icon-dark.png` | 侧栏图标 4x 放大（深色，官方红标 PNG） |
| `shots/00-sidebar-icon-light.png` | 侧栏图标 4x 放大（浅色） |
| `shots/01-unlogged-home-dark.png` | 未登录首页（登录引导条、可浏览） |
| `shots/02-login-qr-waiting.png` | 扫码 Modal（waiting） |
| `shots/03-login-qr-scanned.png` | 已扫码（scanned） |
| `shots/04-logged-in-home-dark.png` | 登录成功后的首页（账号/VIP 标） |
| `shots/05-home-dark.png` | 首页 hero + 推荐歌单 + 今日推荐（深色） |
| `shots/06-player-playing.png` | 播放全部后的底部播放条（播放中） |
| `shots/06b-player-queue.png` | 播放队列面板展开 |
| `shots/07-playlist-detail.png` | 长歌单详情（120 首，已加载更多） |
| `shots/08-search-results.png` | 搜索结果（7 行） |
| `shots/09-home-light.png` | 首页浅色主题 |
| `shots/10a-narrow-1024.png` | 1024px 窄屏（无横向溢出） |
| `shots/10b-narrow-600.png` | 600px 窄屏（无横向溢出） |
| `shots/11-error-state.png` | `/home` 失败的错误态 + 重试 |
| `shots/12-engine-missing.png` | 引擎缺失模式（安装提示，不白屏） |
| `shots/13-nowplaying-vinyl-dark.png` | v2 全屏播放页·黑胶模式（深色） |
| `shots/14-nowplaying-lyrics-dark.png` | v2 全屏播放页·歌词模式（深色，高亮+翻译） |
| `shots/15-nowplaying-light.png` | v2 全屏播放页（浅色） |
| `shots/16-dock-bottom.png` | v2 历史截图（v3 已改为面板内 dock，不再全局停靠） |
| `shots/17-narrow-600.png` | 600px 窄屏（面板内 dock） |
| `shots/18-header-scrolled-dark.png` | v3 滚动 800px 后 header 吸顶不透明 |
| `shots/19-inpanel-dock.png` | v3 面板内 dock（列表不被遮挡、输入框在下方） |
| `shots/20-mini-sidebar.png` | v3 对话页左侧栏迷你播放器（280px 两行卡片：第一行封面/歌名/音量，第二行 prev/播放/next 居中对称） |
| `shots/20b-mini-sidebar-light.png` | v3 侧栏迷你播放器（浅色） |
| `shots/20c-mini-rail.png` | v3 56px rail 形态（仅封面按钮） |
| `shots/21-nowplaying-vinyl-circular.png` | v3 正圆黑胶（互斥模式） |
| `shots/22-install-progress.png` | v3 引擎安装中（进度/日志） |
| `shots/23-engine-installed.png` | v3 引擎装好、卡片消失后的首页 |
| `shots/24-hero-carousel.png` | v4 首页 Hero 轮播（5 模式 + clone） |
| `shots/24-carousel-1.png` / `24-carousel-2.png` / `24-carousel-3.png` | 轮播第 1/2/3 张卡 |
| `shots/24-carousel-wrap.png` | 轮播最后一张 → 第一张回绕动画中的一帧 |
| `shots/25-nowplaying-with-dock.png` | v4 播放页底部 dock 存在、无第二组进度/传输键 |
| `shots/26a-like-hover.png` | v4.1 列表行 hover 显示描边红心 |
| `shots/26-like-toggled.png` | v4.1 收藏后实心红心 |
| `shots/27-np-like.png` | v4.1 播放页 np-like 状态 |
| `shots/28-dock-like.png` | v4.1 dock-like 与播放页同步 |
| `shots/agent-play.png` | v5 对话页通过 Agent 命令播放后，左侧栏迷你播放器出现 |
| `shots/29-search-page.png` | v1.1 搜索 tab 大搜索框（自动 focus） |
| `shots/30-search-page-results.png` | v1.1 搜索页输入后结果 |
| `shots/31-build-stamp.png` | v1.1 页脚构建时间戳 |
| `shots/33-fullscreen-playback.png` | v1.1 原生全屏播放页（真实 Fullscreen API） |

## 主题 token 说明（与真实 Harness 的差异）

`harness.html` 里 light/dark 两套 token 是 DSH 主题的离线快照。按 Lead 要求：

- `--dsw-alias-brand-primary` 使用强调蓝 `#4d6bfe`（light/dark 同值），`--dsw-alias-bg-overlay` 深色 `#2c2c2e`、浅色 `#ffffff`。
- 但**真实 DSH 默认主题**（`app.asar` 里的主题定义）里：
  `--dsw-alias-brand-primary` = `var(--dsw-static-neutral-bluish-1000)`（浅色 `#0f1115`）/ `var(--dsw-static-neutral-bluish-50)`（深色 `#f9fafb`），
  `--dsh-boot-brand` 同样是中性色，`--dsw-alias-bg-overlay` 深色是 `#61666b`。真正偏蓝的品牌色在 `--dsw-alias-button-info-fill` / `--dsw-alias-brand-primary-new-colorprimary-new-color`（deepseek-400/450）。
- 因此 run.mjs 额外做一次「中性 brand 注入」回归：临时把 `--dsw-alias-brand-primary` 设为真实深色值 `#f9fafb`，断言 `[data-nm="play-all"]` 仍 ≥3:1；用于防止 accent 依赖 brand token 导致真机白底白字。若真实主题使用蓝色 accent，这条也会通过。
- 主题 token 随 DSH 版本变化时需要更新此处快照。

## 已知局限

- headless Chrome 必须 `--no-sandbox --disable-setuid-sandbox --disable-crash-reporter --disable-breakpad`：
  本机 DSH 沙箱不允许 Chrome 写 `~/Library/Application Support/Google/Chrome/Crashpad`，否则 Chrome 直接 `Trace/BPT trap`；
  `--user-data-dir` 固定放本目录 `tmp/chrome-profile`（工作区内）。CDP `send` 有 20s 超时、整轮有 8 分钟 watchdog。
- harness 只模拟 56px 左侧栏 + 全宽 main + 64px 假输入框，没有 DSH 的真实顶栏/标题栏/输入框；`--dsh-frame-top-clearance` 设为 20px。
- v3 假侧栏用 56px/280px 两种宽度模拟 DSH 侧栏；`sidebar.footer.action` 用固定 footer 容器 + 注入的 `usePanelInfo`（`window.__setActivePanel`）模拟真实槽位/面板切换；主区在 conversation 时切换为假对话页（`#fake-conversation`）。真实 Harness 的槽位宽度、注入 hook 形状可能不同，需真机复核。
- 面板内 dock 断言基于「dock 是 flex 布局行、scroll 在上」；真实 DSH 的 `--dsh-frame-top-clearance` 下 header 是否与框架顶栏严丝合缝**无法离线验证**，需真机目视。
- 引擎安装是本地 mock 状态机（clone→venv→pip→verify→done），不实际安装 Python 包；真实安装时长/网络错误形态需真机验证。
- v4 轮播依赖真实计时（自动 6s、hover 暂停、回绕动画 360ms），断言用真实时间采样，整轮耗时约 8–9 分钟；`/mode` 数据为 mock。
- v5 Agent 播放桥通过 mock 命令队列注入验证客户端轮询/执行/上报；真实 Host 工具（`netease_play` / `netease_player`）的注册与冒烟由 Lead 在 Host 侧验证（改 Host `index.js` 需重启 App）。
- v5.1/v5.2 `seekable=[0,0]` 用测试内改写 `HTMLMediaElement.prototype.seekable` 模拟，真实 Chrome「元素进入不可 seek 坏状态 + 缓存坏响应」需真机验证；clientlog 为 mock 存档，仅验证客户端上报格式/频率/事件。
- v1.1 原生 Fullscreen API 在 headless Chrome 下通过 CDP 真实鼠标手势进入（实测成功）；不可用环境的 monkeypatch 分支保留。播放模式 ended 行为部分用合成 `ended` 事件触发；真实播到结尾的路径在单曲循环用例中保留。
- v4 慢速 seek 用「首包只回 1/4 + Range 延迟 1200ms」模拟，本机 Chrome 若已缓冲仍可能瞬时完成；断言同时校验 data-seeking 保持与最终位置。
  真实安装后 `--dsh-frame-top-clearance` 是否存在、页面顶部是否被 Harness 顶栏遮挡，**本 harness 无法验证**（需在真实 Harness 里目视确认）。
- mock 音频是 3s 正弦波，与真实曲目时长无关；播放/切歌/进度/ended 只验证行为，不验证真实音质。
- 封面/头像是本地渐变 SVG，不是真实图片，视觉上只检查布局与占位。
- 登录态是 mock 状态机，不涉及真实扫码/cookie；错误/引擎缺失通过 `/__config` 切换。
- 对比度断言对 `color-mix()` 等计算色做近似（向上合成半透明背景层），阈值按 Lead 要求：正文 3:1、图标/辅助 2.5:1。
