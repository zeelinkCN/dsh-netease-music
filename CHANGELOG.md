# Changelog

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
