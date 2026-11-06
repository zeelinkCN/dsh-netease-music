window.__ModuleLoader__.load({
  id: '@local/netease-music',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'netease-music'
    const API = '/netease-panel/api'
    const ENGINE_COMMAND = 'cd dsh-netease-music/engine && git clone --depth 1 https://github.com/Code-MonkeyZhang/cloud-music-mcp.git && cd cloud-music-mcp && uv venv --python python3 .venv && uv pip install -p .venv/bin/python -e .'

    /* ------------------------------------------------------------------ *
     * 文案：中文为默认与兜底，英文走 locale 注册；t() 永远返回可用文本
     * ------------------------------------------------------------------ */
    const ZH = {
      'app.title': '网易云音乐',
      'app.tagline': '音乐，让生活更美好',
      'tab.recommend': '推荐',
      'tab.playlists': '歌单',
      'tab.artists': '歌手',
      'tab.search': '搜索',
      'search.placeholder': '搜索歌曲、歌单、歌手或专辑',
      'search.prompt': '输入关键词，发现好音乐',
      'search.promptHint': '试试搜索喜欢的歌曲、歌手或专辑',
      'search.empty': '没有找到与「{q}」相关的内容',
      'search.loading': '正在搜索…',
      'search.type.song': '单曲',
      'search.type.playlist': '歌单',
      'search.type.artist': '歌手',
      'search.type.album': '专辑',
      'action.playAll': '播放全部',
      'action.play': '播放',
      'action.pause': '暂停',
      'action.next': '下一首',
      'action.prev': '上一首',
      'action.retry': '重试',
      'action.refresh': '刷新',
      'action.login': '扫码登录',
      'action.logout': '退出登录',
      'action.back': '返回',
      'action.close': '关闭',
      'action.queue': '播放队列',
      'action.volume': '音量',
      'action.mute': '静音',
      'action.unmute': '取消静音',
      'action.expand': '展开播放条',
      'action.collapse': '收起播放条',
      'action.reloadQr': '刷新二维码',
      'action.loginDone': '完成',
      'action.openPanel': '打开网易云音乐',
      'action.addQueue': '加入播放队列',
      'action.loginNow': '立即登录',
      'action.loadMore': '加载更多',
      'state.loading': '加载中',
      'state.error': '加载失败',
      'state.retryHint': '网络似乎不太稳定，请稍后再试',
      'state.empty': '暂无内容',
      'state.unknown': '未知',
      'state.unknownArtist': '未知歌手',
      'state.unauth': '登录后查看',
      'state.unauthPlaylist': '登录后查看你的歌单',
      'state.unauthArtist': '登录后查看收藏歌手',
      'state.unauthDaily': '今日推荐需要登录后查看',
      'state.unauthDesc': '扫码登录网易云音乐，同步你的歌单、收藏与每日推荐。',
      'state.noPlaylist': '还没有创建或收藏歌单',
      'state.noArtist': '还没有收藏的歌手',
      'state.noRecommended': '暂无推荐歌单',
      'state.noDaily': '今天还没有推荐歌曲',
      'state.noAlbums': '暂无专辑',
      'state.noSongs': '暂无歌曲',
      'login.title': '扫码登录',
      'login.desc': '打开网易云音乐 App，扫描二维码登录',
      'login.waiting': '等待扫码…',
      'login.scanned': '已扫描，请在手机上确认登录',
      'login.ok': '登录成功，欢迎回来',
      'login.expired': '二维码已过期，点击刷新',
      'login.error': '登录失败，请重试',
      'login.tip': '登录后可同步歌单、收藏歌手与每日推荐',
      'login.loadErr': '二维码加载失败',
      'login.retry': '重新获取',
      'login.secure': '扫码过程在本地完成，安全可靠',
      'section.daily': '今日推荐',
      'section.recommended': '推荐歌单',
      'section.mine': '我的歌单',
      'section.artists': '收藏歌手',
      'section.albums': '专辑',
      'section.hotSongs': '热门歌曲',
      'section.results': '搜索结果',
      'hero.eyebrow': '今日推荐 · {date}',
      'hero.title': '今天，听点不一样的',
      'hero.desc': '根据你的音乐口味，为你精选 {n} 首今日推荐。',
      'hero.descEmpty': '登录后，每天为你更新专属推荐。',
      'hero.count': '{n} 首歌曲',
      'meta.songs': '{n} 首',
      'meta.items': '{n} 个',
      'meta.albums': '{n} 张专辑',
      'meta.plays': '{n} 次播放',
      'meta.tracks': '{n} 首',
      'meta.loaded': '已加载 {n} 首',
      'meta.fans': '{n} 粉丝',
      'kind.playlist': '歌单',
      'kind.album': '专辑',
      'kind.artist': '歌手',
      'player.error': '播放失败，可能受版权限制',
      'player.retry': '重试',
      'player.skip': '跳过',
      'player.queue': '播放队列',
      'player.queueCount': '{n} 首',
      'player.queueEmpty': '队列是空的',
      'player.nowPlaying': '正在播放',
      'player.progress': '播放进度',
      'player.collapse': '收起',
      'player.expand': '展开',
      'vip': 'VIP',
      'status.online': '在线',
      'status.starting': '连接中',
      'status.offline': '离线',
      'status.anonymous': '未登录',
      'engine.title': '数据引擎未就绪',
      'engine.desc': '网易云数据引擎不可用，暂时无法加载内容。按下面的命令安装后重试。',
      'engine.fix': '修复方式',
      'engine.copy': '复制命令',
      'engine.copied': '已复制',
      'engine.hint': '会自动安装数据引擎，完成后页面自动刷新。',
      'engine.install': '一键安装',
      'engine.retryInstall': '重试安装',
      'engine.installingTitle': '正在安装数据引擎…',
      'engine.installingDesc': '安装会自动完成，期间可以继续浏览。',
      'engine.installFailed': '数据引擎安装失败',
      'engine.wait': '请稍候，首次安装可能需要几分钟…',
      'engine.phase.clone': '克隆源码',
      'engine.phase.venv': '创建环境',
      'engine.phase.pip': '安装依赖',
      'engine.phase.verify': '校验',
      'engine.phase.done': '完成',
      'engine.phase.failed': '失败',
      'fmt.locale': 'zh-CN',
      'toast.playlistError': '无法播放该内容，请稍后重试',
      'toast.logoutDone': '已退出登录',
      'toast.queueAdded': '已加入播放队列',
      'toast.loginExpired': '二维码已过期',
      'quality.title': '音质',
      'quality.auto': '自动',
      'quality.autoSub': '按账号自动选择最佳音质',
      'quality.standard': '标准',
      'quality.standardSub': '128 kbps',
      'quality.exhigh': '较高',
      'quality.exhighSub': '320 kbps',
      'quality.lossless': '无损',
      'quality.losslessSub': 'FLAC 无损',
      'quality.hires': 'Hi-Res',
      'quality.hiresSub': '高解析度音频',
      'quality.actual': '当前',
      'quality.needLogin': '需登录',
      'quality.needVip': '会员',
      'quality.trial': '试听',
      'quality.switching': '正在切换音质…',
      'quality.label': '音质',
      'np.title': '正在播放',
      'np.vinyl': '黑胶',
      'np.lyrics': '歌词',
      'np.liked': '我喜欢的音乐',
      'np.translated': '翻译',
      'np.noLyrics': '暂无歌词',
      'np.instrumental': '纯音乐',
      'np.lyricsLoading': '歌词加载中…',
      'np.lyricsError': '歌词加载失败',
      'np.album': '专辑',
      'np.retry': '重试',
      'np.open': '打开播放页',
      'np.back': '返回列表',
      'np.volume': '音量',
      'player.openNowPlaying': '展开播放页',
      'dock.quality': '音质',
      'action.like': '收藏到我喜欢',
      'action.unlike': '取消收藏',
      'like.needLogin': '请先登录网易云',
      'like.fail': '收藏操作失败，请稍后重试',
      'dock.expand': '展开播放页',
      'dock.collapse': '收起',
      'hero.heart': '心动模式',
      'hero.heartDesc': '围绕当前歌曲，为你心跳的旋律选歌',
      'hero.roam': '漫游 · 私人FM',
      'hero.roamDesc': '随机漫游，遇见下一首喜欢的歌',
      'hero.similarSong': '相似歌曲',
      'hero.similarSongDesc': '沿着这首歌，发现气质相近的好歌',
      'hero.similarArtist': '相似艺人',
      'hero.similarArtistDesc': '认识与这位歌手风格相近的音乐人',
      'hero.daily': '每日推荐',
      'hero.dailyDesc': '每天为你更新的专属 30 首',
      'hero.play': '立即播放',
      'hero.modeOf': '{index} / {total}',
      'hero.prev': '上一个',
      'hero.next': '下一个',
      'hero.carouselLabel': '听歌模式',
      'hero.retry': '重试',
      'hero.fallback': '已降级：{reason}',
      'toast.modeError': '暂时无法生成这个歌单，请稍后再试',
      'toast.modeTimeout': '请求超时，请重试',
      'toast.agentPlay': '开始播放：{title}',
      'toast.seekUnsupported': '当前音源不支持拖动进度',
      'toast.seekSlow': '跳转较慢，当前音源可能暂不支持跳转',
      'toast.seekFailed': '当前音源暂时无法跳转',
      'footer.updated': '更新于',
    }
    const EN = {
      'app.title': 'Netease Music',
      'app.tagline': 'Music makes life better',
      'tab.recommend': 'Listen Now',
      'tab.playlists': 'Playlists',
      'tab.artists': 'Artists',
      'tab.search': 'Search',
      'search.placeholder': 'Songs, playlists, artists, albums',
      'search.prompt': 'Type to discover music',
      'search.promptHint': 'Try a song, artist or album you love',
      'search.empty': 'No results for “{q}”',
      'search.loading': 'Searching…',
      'search.type.song': 'Songs',
      'search.type.playlist': 'Playlists',
      'search.type.artist': 'Artists',
      'search.type.album': 'Albums',
      'action.playAll': 'Play All',
      'action.play': 'Play',
      'action.pause': 'Pause',
      'action.next': 'Next',
      'action.prev': 'Previous',
      'action.retry': 'Retry',
      'action.refresh': 'Refresh',
      'action.login': 'Sign in',
      'action.logout': 'Sign out',
      'action.back': 'Back',
      'action.close': 'Close',
      'action.queue': 'Play queue',
      'action.volume': 'Volume',
      'action.mute': 'Mute',
      'action.unmute': 'Unmute',
      'action.expand': 'Expand player',
      'action.collapse': 'Collapse player',
      'action.reloadQr': 'Refresh QR code',
      'action.loginDone': 'Done',
      'action.openPanel': 'Open Netease Music',
      'action.addQueue': 'Add to queue',
      'action.loginNow': 'Sign in now',
      'action.loadMore': 'Load more',
      'state.loading': 'Loading',
      'state.error': 'Something went wrong',
      'state.retryHint': 'Network hiccup. Please try again.',
      'state.empty': 'Nothing here yet',
      'state.unknown': 'Unknown',
      'state.unknownArtist': 'Unknown artist',
      'state.unauth': 'Sign in to view',
      'state.unauthPlaylist': 'Sign in to see your playlists',
      'state.unauthArtist': 'Sign in to see favorite artists',
      'state.unauthDaily': 'Sign in to see your daily mix',
      'state.unauthDesc': 'Scan to sign in and sync your playlists, favorites and daily mix.',
      'state.noPlaylist': 'No playlists yet',
      'state.noArtist': 'No favorite artists yet',
      'state.noRecommended': 'No recommended playlists',
      'state.noDaily': 'No daily picks today',
      'state.noAlbums': 'No albums yet',
      'state.noSongs': 'No songs',
      'login.title': 'Scan to sign in',
      'login.desc': 'Open the Netease Music app and scan the QR code',
      'login.waiting': 'Waiting for scan…',
      'login.scanned': 'Scanned — confirm on your phone',
      'login.ok': 'Signed in. Welcome back!',
      'login.expired': 'QR code expired. Tap to refresh.',
      'login.error': 'Sign-in failed, please retry',
      'login.tip': 'Sign in to sync playlists, artists and your daily mix',
      'login.loadErr': 'Could not load the QR code',
      'login.retry': 'Try again',
      'login.secure': 'The scan happens locally and stays private',
      'section.daily': 'Made for You',
      'section.recommended': 'Recommended Playlists',
      'section.mine': 'My Playlists',
      'section.artists': 'Favorite Artists',
      'section.albums': 'Albums',
      'section.hotSongs': 'Top Songs',
      'section.results': 'Search Results',
      'hero.eyebrow': 'Made for You · {date}',
      'hero.title': 'Listen to something new today',
      'hero.desc': 'A daily mix picked from your taste — {n} songs.',
      'hero.descEmpty': 'Sign in for a fresh mix every day.',
      'hero.count': '{n} songs',
      'meta.songs': '{n} songs',
      'meta.items': '{n} items',
      'meta.albums': '{n} albums',
      'meta.plays': '{n} plays',
      'meta.tracks': '{n} tracks',
      'meta.loaded': '{n} loaded',
      'meta.fans': '{n} fans',
      'kind.playlist': 'Playlist',
      'kind.album': 'Album',
      'kind.artist': 'Artist',
      'player.error': 'Playback failed — maybe it is region locked',
      'player.retry': 'Retry',
      'player.skip': 'Skip',
      'player.queue': 'Play Queue',
      'player.queueCount': '{n} songs',
      'player.queueEmpty': 'Your queue is empty',
      'player.nowPlaying': 'Now playing',
      'player.progress': 'Playback position',
      'player.collapse': 'Collapse',
      'player.expand': 'Expand',
      'vip': 'VIP',
      'status.online': 'Online',
      'status.starting': 'Connecting',
      'status.offline': 'Offline',
      'status.anonymous': 'Signed out',
      'engine.title': 'Music engine is not ready',
      'engine.desc': 'The Netease data engine is unavailable, so content cannot load. Run the command below to install it.',
      'engine.fix': 'How to fix',
      'engine.copy': 'Copy command',
      'engine.copied': 'Copied',
      'engine.hint': 'The engine installs automatically and the page refreshes when done.',
      'engine.install': 'Install engine',
      'engine.retryInstall': 'Retry install',
      'engine.installingTitle': 'Installing the music engine…',
      'engine.installingDesc': 'Installation runs in the background; you can keep browsing.',
      'engine.installFailed': 'Engine installation failed',
      'engine.wait': 'This may take a few minutes on the first run…',
      'engine.phase.clone': 'Cloning source',
      'engine.phase.venv': 'Creating environment',
      'engine.phase.pip': 'Installing dependencies',
      'engine.phase.verify': 'Verifying',
      'engine.phase.done': 'Done',
      'engine.phase.failed': 'Failed',
      'fmt.locale': 'en-US',
      'toast.playlistError': 'Could not play this content. Try again later.',
      'toast.logoutDone': 'Signed out',
      'toast.queueAdded': 'Added to queue',
      'toast.loginExpired': 'QR code expired',
      'quality.title': 'Audio Quality',
      'quality.auto': 'Auto',
      'quality.autoSub': 'Pick the best quality for your account',
      'quality.standard': 'Standard',
      'quality.standardSub': '128 kbps',
      'quality.exhigh': 'Higher',
      'quality.exhighSub': '320 kbps',
      'quality.lossless': 'Lossless',
      'quality.losslessSub': 'FLAC lossless',
      'quality.hires': 'Hi-Res',
      'quality.hiresSub': 'High resolution audio',
      'quality.actual': 'Current',
      'quality.needLogin': 'Sign in',
      'quality.needVip': 'VIP',
      'quality.trial': 'Trial',
      'quality.switching': 'Switching quality…',
      'quality.label': 'Quality',
      'np.title': 'Now Playing',
      'np.vinyl': 'Vinyl',
      'np.lyrics': 'Lyrics',
      'np.liked': 'Liked Songs',
      'np.translated': 'Translation',
      'np.noLyrics': 'No lyrics',
      'np.instrumental': 'Instrumental',
      'np.lyricsLoading': 'Loading lyrics…',
      'np.lyricsError': 'Could not load lyrics',
      'np.album': 'Album',
      'np.retry': 'Retry',
      'np.open': 'Open Now Playing',
      'np.back': 'Back to list',
      'np.volume': 'Volume',
      'player.openNowPlaying': 'Open Now Playing',
      'dock.quality': 'Quality',
      'action.like': 'Add to Liked Songs',
      'action.unlike': 'Remove from Liked Songs',
      'like.needLogin': 'Please sign in to NetEase Cloud Music',
      'like.fail': 'Could not update liked songs, please retry',
      'dock.expand': 'Open Now Playing',
      'dock.collapse': 'Collapse',
      'hero.heart': 'Heartbeat',
      'hero.heartDesc': 'A mix tuned around the song you love',
      'hero.roam': 'Roam · Private FM',
      'hero.roamDesc': 'Wander and meet your next favorite song',
      'hero.similarSong': 'Similar Songs',
      'hero.similarSongDesc': 'Along this song, find kindred tracks',
      'hero.similarArtist': 'Similar Artists',
      'hero.similarArtistDesc': 'Meet artists with a kindred sound',
      'hero.daily': 'Daily Mix',
      'hero.dailyDesc': 'Thirty fresh picks for you every day',
      'hero.play': 'Play now',
      'hero.modeOf': '{index} / {total}',
      'hero.prev': 'Previous',
      'hero.next': 'Next',
      'hero.carouselLabel': 'Listening modes',
      'hero.retry': 'Retry',
      'hero.fallback': 'Fallback: {reason}',
      'toast.modeError': 'Could not build this mix, please try again',
      'toast.modeTimeout': 'Request timed out, please retry',
      'toast.agentPlay': 'Now playing: {title}',
      'toast.seekUnsupported': 'This audio source does not support seeking',
      'toast.seekSlow': 'Seeking is slow; this source may not support it',
      'toast.seekFailed': 'This audio source cannot seek right now',
      'footer.updated': 'Updated',
    }

    /* ------------------------------------------------------------------ *
     * 通用工具
     * ------------------------------------------------------------------ */
    function clamp(value, min, max) {
      const n = Number(value)
      if (!isFinite(n)) return min
      return Math.min(max, Math.max(min, n))
    }

    function cx() {
      const out = []
      for (let i = 0; i < arguments.length; i += 1) {
        const part = arguments[i]
        if (part) out.push(part)
      }
      return out.join(' ')
    }

    function isString(value) {
      return typeof value === 'string'
    }

    function toArray(value) {
      return Array.isArray(value) ? value : []
    }

    function httpsUrl(value) {
      if (!isString(value) || value === '') return null
      if (value.indexOf('http://') === 0) return 'https://' + value.slice(7)
      return value
    }

    function uniqById(list) {
      const seen = Object.create(null)
      const out = []
      toArray(list).forEach((item) => {
        if (!item || item.id === undefined || item.id === null) return
        const key = String(item.id)
        if (seen[key]) return
        seen[key] = true
        out.push(item)
      })
      return out
    }

    function trackArtists(track) {
      if (!track) return ''
      if (Array.isArray(track.artists) && track.artists.length) {
        const names = track.artists.map((a) => (a && a.name) || '').filter(Boolean)
        if (names.length) return names.join(' / ')
      }
      return track.artist || ''
    }

    function fmtTime(ms) {
      const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
      const m = Math.floor(total / 60)
      const s = total % 60
      return m + ':' + (s < 10 ? '0' + s : String(s))
    }

    function fmtCount(value, t) {
      const n = Number(value)
      if (!isFinite(n) || n <= 0) return '0'
      if (n < 1000) return String(Math.round(n))
      try {
        return new Intl.NumberFormat(t('fmt.locale') || 'zh-CN', {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(n)
      } catch (err) {
        if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
        return (n / 10000).toFixed(1) + '万'
      }
    }

    function initialOf(name) {
      const text = String(name || '').trim()
      if (!text) return '♪'
      return text.slice(0, 1).toUpperCase()
    }

    function hueOf(name) {
      const text = String(name || '')
      let hash = 0
      for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100000
      return hash % 360
    }

    function fmtToday(locale) {
      try {
        return new Date().toLocaleDateString(locale === 'en-US' ? 'en-US' : 'zh-CN', {
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        })
      } catch (err) {
        return ''
      }
    }

    function qs(params) {
      const out = []
      Object.keys(params || {}).forEach((key) => {
        const value = params[key]
        if (value === undefined || value === null || value === '') return
        out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
      })
      return out.join('&')
    }

    function isAbort(err) {
      return !!err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')
    }

    /* ------------------------------------------------------------------ *
     * HTTP：统一信封 {ok, data} / {ok:false, error, code}
     * ------------------------------------------------------------------ */
    function makeApiError(message, code, status) {
      const err = new Error(message || '请求失败')
      err.code = code || 'NETWORK'
      err.status = status || 0
      return err
    }

    async function readEnvelope(res) {
      let body = null
      try {
        body = await res.json()
      } catch (err) {
        body = null
      }
      if (!res.ok || !body || body.ok !== true) {
        const message = (body && (body.error || body.message)) || 'HTTP ' + res.status
        throw makeApiError(message, (body && body.code) || 'NETWORK', res.status)
      }
      return body.data
    }

    async function apiGet(path, signal) {
      let res
      try {
        res = await fetch(API + path, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal,
          credentials: 'same-origin',
        })
      } catch (err) {
        if (isAbort(err)) throw err
        throw makeApiError('网络连接失败，请稍后重试', 'NETWORK', 0)
      }
      return readEnvelope(res)
    }

    async function apiPost(path, payload, signal) {
      let res
      try {
        res = await fetch(API + path, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(payload || {}),
          signal,
          credentials: 'same-origin',
        })
      } catch (err) {
        if (isAbort(err)) throw err
        throw makeApiError('网络连接失败，请稍后重试', 'NETWORK', 0)
      }
      return readEnvelope(res)
    }

    const CLIENT_BUILD = 'v1.0.1 · 2026-11-06 11:12'
    const clientLogTimes = []
    const clientLogPriorityTimes = []

    function clientLog(event, data) {
      try {
        const name = String(event || '')
        const priority = /^seek:recover/.test(name)
        const now = Date.now()
        const bucket = priority ? clientLogPriorityTimes : clientLogTimes
        while (bucket.length && now - bucket[0].at > 60000) bucket.shift()
        /* 普通日志独立 20 条/分钟；seek:recover* 使用独立预算，绝不被 media:* 挤掉，也不挤占普通名额 */
        if (bucket.length >= 20) return
        bucket.push({ at: now, priority })
        apiPost('/clientlog', { event: String(event || ''), data: data && typeof data === 'object' ? data : {} }).catch(() => {
          /* 诊断上报失败静默 */
        })
      } catch (err) {
        /* ignore */
      }
    }

    async function loadDetail(kind, id, signal) {
      if (kind === 'artist') return apiGet('/artist?' + qs({ id }), signal)
      if (kind === 'album') return apiGet('/album?' + qs({ id }), signal)
      return apiGet('/playlist?' + qs({ id }), signal)
    }

    /* ------------------------------------------------------------------ *
     * 本地存储 / 音质 / 歌词解析（v2）
     * ------------------------------------------------------------------ */
    function safeRead(key) {
      try {
        if (typeof localStorage === 'undefined') return null
        return localStorage.getItem(key)
      } catch (err) {
        return null
      }
    }

    function safeWrite(key, value) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
      } catch (err) {
        /* 隐私模式或存储被禁用时忽略 */
      }
    }

    const QUALITY_LEVELS = [
      { key: 'auto', label: 'quality.auto', sub: 'quality.autoSub' },
      { key: 'standard', label: 'quality.standard', sub: 'quality.standardSub' },
      { key: 'exhigh', label: 'quality.exhigh', sub: 'quality.exhighSub' },
      { key: 'lossless', label: 'quality.lossless', sub: 'quality.losslessSub', member: true },
      { key: 'hires', label: 'quality.hires', sub: 'quality.hiresSub', member: true },
    ]

    function normalizeQuality(value) {
      for (let i = 0; i < QUALITY_LEVELS.length; i += 1) {
        if (QUALITY_LEVELS[i].key === value) return value
      }
      return 'auto'
    }

    function qualityLabel(level, t) {
      for (let i = 0; i < QUALITY_LEVELS.length; i += 1) {
        if (QUALITY_LEVELS[i].key === level) return t(QUALITY_LEVELS[i].label)
      }
      return t('quality.auto')
    }

    function fmtBitrate(br) {
      const value = Number(br) || 0
      if (!value) return ''
      if (value >= 1000000) return (Math.round(value / 10000) / 100) + ' Mbps'
      if (value >= 1000) return Math.round(value / 1000) + ' kbps'
      return value + ' bps'
    }

    function qualityActualText(snapshot, t) {
      const level = (snapshot && (snapshot.actualLevel || snapshot.quality)) || 'auto'
      let text = qualityLabel(level, t)
      const br = fmtBitrate(snapshot && snapshot.actualBr)
      if (br) text += ' · ' + br
      if (snapshot && snapshot.trial) text += ' · ' + t('quality.trial')
      return text
    }

    function parseLrcLines(text) {
      if (!isString(text) || !text.trim()) return []
      const lines = []
      text.split(/\r?\n/).forEach((raw) => {
        const matches = []
        const regexp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
        let match = regexp.exec(raw)
        while (match) {
          matches.push(match)
          match = regexp.exec(raw)
        }
        if (!matches.length) return
        const content = raw.replace(/\[[^\]]*\]/g, '').trim()
        if (!content) return
        matches.forEach((stamp) => {
          const minutes = Number(stamp[1]) || 0
          const seconds = Number(stamp[2]) || 0
          const frac = stamp[3] ? Number('0.' + stamp[3]) : 0
          const time = minutes * 60 + seconds + frac
          if (isFinite(time)) lines.push({ time: Math.round(time * 100) / 100, text: content })
        })
      })
      lines.sort((a, b) => a.time - b.time)
      return lines
    }

    function parseLyrics(data) {
      if (!data || typeof data !== 'object') return { lines: [], translated: false }
      const base = parseLrcLines(data.lrc)
      if (!base.length) return { lines: [], translated: false }
      const translation = parseLrcLines(data.tlyric)
      if (!translation.length) {
        return { lines: base.map((line) => ({ time: line.time, text: line.text, translation: null })), translated: false }
      }
      const dictionary = new Map()
      translation.forEach((line) => {
        const key = Math.round(line.time * 100)
        if (!dictionary.has(key)) dictionary.set(key, line.text)
      })
      let translated = false
      const lines = base.map((line) => {
        const key = Math.round(line.time * 100)
        const value = dictionary.get(key) || dictionary.get(key + 1) || dictionary.get(key - 1) || null
        if (value) translated = true
        return { time: line.time, text: line.text, translation: value }
      })
      return { lines, translated }
    }

    /* ------------------------------------------------------------------ *
     * 全局播放器 store（模块级单例，Page 与 PlayerDock 共享）
     * ------------------------------------------------------------------ */
    function createPlayer() {
      let audio = null
      let listeners = new Set()
      let disposed = false
      let lastTimeEmit = 0
      let lastVolume = 0.8
      let toastTimer = null
      let pendingResume = null
      let pendingSeek = null
      let pendingSeekRatio = null
      let lastSeekRecoveryAt = 0
      let recoveryLogTarget = null
      let lastSeekLogAt = 0
      let seekHoldCount = 0
      let seekFallbackTimer = null
      let seekRecoverTimer = null
      let urlRequestSeq = 0
      const audioHandlers = []

      let state = {
        current: null,
        queue: [],
        index: -1,
        playing: false,
        loading: false,
        position: 0,
        duration: 0,
        volume: 0.8,
        muted: false,
        error: null,
        contextTitle: '',
        queueOpen: false,
        toast: null,
        seeking: false,
        seekTarget: null,
        quality: normalizeQuality(safeRead('netease-music:quality')),
        actualLevel: null,
        actualBr: 0,
        trial: false,
        qualityLoading: false,
      }

      function emit() {
        const snapshot = Array.from(listeners)
        for (let i = 0; i < snapshot.length; i += 1) {
          try {
            snapshot[i]()
          } catch (err) {
            /* 订阅者异常不能拖垮播放器 */
          }
        }
      }

      function patch(next) {
        if (disposed) return
        state = Object.assign({}, state, next)
        emit()
      }

      function getState() {
        return state
      }

      function subscribe(fn) {
        if (typeof fn !== 'function') return function noop() {}
        listeners.add(fn)
        return function unsubscribe() {
          listeners.delete(fn)
        }
      }

      function notifyToast(key) {
        patch({ toast: key })
        if (toastTimer) clearTimeout(toastTimer)
        toastTimer = setTimeout(() => {
          toastTimer = null
          patch({ toast: null })
        }, 2400)
      }

      function buildAudioUrl(id, level) {
        /* 每次加载都带缓存击穿参数：避免浏览器复用被中断的局部缓存响应导致 audio 永久不可 seek */
        return API + '/audio?' + qs({ id, level: level || state.quality || 'auto', _: Date.now() })
      }

      function syncAudioLevel() {
        if (!audio) return
        try {
          audio.setAttribute('data-level', state.quality || 'auto')
        } catch (err) {
          /* ignore */
        }
      }

      function refreshUrlInfo() {
        const track = state.current
        if (!track) return
        const seq = ++urlRequestSeq
        apiGet('/song/url?' + qs({ id: track.id, level: state.quality })).then((info) => {
          if (seq !== urlRequestSeq || !state.current || String(state.current.id) !== String(track.id)) return
          patch({
            actualLevel: (info && info.level) || state.quality,
            actualBr: Number(info && info.br) || 0,
            trial: !!(info && info.trial),
            qualityLoading: false,
          })
        }).catch(() => {
          if (seq !== urlRequestSeq) return
          patch({ actualLevel: state.quality, actualBr: 0, trial: false, qualityLoading: false })
        })
      }

      function updateMediaSession(track) {
        if (typeof navigator === 'undefined' || !navigator.mediaSession || typeof MediaMetadata === 'undefined') return
        try {
          const artwork = []
          const cover = httpsUrl(track && track.cover)
          if (cover) artwork.push({ src: cover, sizes: '512x512', type: 'image/jpeg' })
          navigator.mediaSession.metadata = new MediaMetadata({
            title: (track && track.name) || '',
            artist: trackArtists(track),
            album: (track && track.album) || '',
            artwork,
          })
        } catch (err) {
          /* Media Session 只是增强，失败忽略 */
        }
      }

      function syncMediaState(playing) {
        if (typeof navigator === 'undefined' || !navigator.mediaSession) return
        try {
          navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
        } catch (err) {
          /* ignore */
        }
      }

      function syncDuration() {
        if (!audio) return
        const seconds = Number(audio.duration)
        if (isFinite(seconds) && seconds > 0) patch({ duration: Math.round(seconds * 1000) })
      }

      function clearSeekTimers() {
        if (seekFallbackTimer) {
          clearTimeout(seekFallbackTimer)
          seekFallbackTimer = null
        }
        if (seekRecoverTimer) {
          clearTimeout(seekRecoverTimer)
          seekRecoverTimer = null
        }
      }

      function audioDurationSeconds() {
        if (audio) {
          const value = Number(audio.duration)
          if (isFinite(value) && value > 0) return value
        }
        if (state.duration > 0) return state.duration / 1000
        return 0
      }

      function bindAudio(el) {
        if (!el) return
        unbindAudio()
        audio = el
        clientLog('audio:bind', { audioId: el.dataset ? el.dataset.nmAudioId : null })
        el.preload = 'metadata'
        el.volume = state.volume
        syncAudioLevel()
        const on = (name, fn) => {
          el.addEventListener(name, fn)
          audioHandlers.push([name, fn])
        }
        on('loadedmetadata', () => {
          syncDuration()
          if (pendingSeekRatio != null && isFinite(audio.duration) && audio.duration > 0) {
            const ratio = clamp(pendingSeekRatio, 0, 1)
            pendingSeekRatio = null
            clearSeekTimers()
            const target = Math.min(ratio * audio.duration, Math.max(0, audio.duration - 0.2))
            try {
              audio.currentTime = target
            } catch (err) {
              /* ignore */
            }
            lastTimeEmit = Date.now()
            clientLog('seek:commit', {
              target,
              duration: Number(audio.duration) || 0,
              readyState: audio.readyState,
              seekable: seekableCount(),
              currentTime: Number(audio.currentTime) || 0,
            })
            patch({ position: Math.round(target * 1000), seeking: true, seekTarget: target })
            armSeekWatch(target)
          }
          if (pendingSeek != null) {
            const limit = isFinite(audio.duration) && audio.duration > 0 ? Math.max(0, audio.duration - 0.2) : pendingSeek
            const target = Math.min(pendingSeek, limit)
            pendingSeek = null
            clearSeekTimers()
            try {
              audio.currentTime = target
            } catch (err) {
              /* ignore */
            }
            lastTimeEmit = Date.now()
            clientLog('seek:commit', {
              target,
              duration: Number(audio.duration) || 0,
              readyState: audio.readyState,
              seekable: seekableCount(),
              currentTime: Number(audio.currentTime) || 0,
            })
            patch({ position: Math.round(target * 1000), seeking: true, seekTarget: target })
            armSeekWatch(target)
          }
          if (!pendingResume) return
          const resume = pendingResume
          pendingResume = null
          const limit = isFinite(audio.duration) && audio.duration > 0 ? Math.max(0, audio.duration - 0.2) : resume.seconds
          const target = Math.min(resume.seconds, limit)
          const applyResume = (attempt) => {
            if (!audio) return
            if (recoveryLogTarget != null) {
              /* 自愈重载后给 seekable 一点恢复时间再落点；真实坏状态最终仍会走 skip/toast */
              let end = 0
              try {
                if (audio.seekable && audio.seekable.length) end = Number(audio.seekable.end(audio.seekable.length - 1)) || 0
              } catch (err) {
                end = 0
              }
              const usable = seekableCount() > 0 && end >= (Number(audio.duration) || 0) - 2
              if (!usable && attempt < 10) {
                setTimeout(() => applyResume(attempt + 1), 150)
                return
              }
            }
            try {
              audio.currentTime = target
            } catch (err) {
              /* ignore */
            }
            lastTimeEmit = Date.now()
            patch({ position: Math.round(target * 1000) })
            if (recoveryLogTarget != null) {
              clientLog('seek:recover-done', {
                currentTime: Number(audio.currentTime) || 0,
                seekable: rangeSnapshot('seekable'),
              })
              recoveryLogTarget = null
            }
            if (resume.playing) requestPlay()
            else patch({ playing: false, loading: false })
          }
          applyResume(0)
        })
        on('durationchange', syncDuration)
        ;['loadstart', 'emptied', 'loadedmetadata', 'abort', 'error', 'stalled', 'suspend', 'waiting', 'canplay'].forEach((eventName) => {
          on(eventName, () => {
            if (eventName === 'error') return
            /* 只在 seek 活跃期记录 media 事件，避免正常播放时刷爆诊断预算 */
            if (!state.seeking && Date.now() - lastSeekLogAt > 2500) return
            try {
              clientLog('media:' + eventName, {
                audioId: audio && audio.dataset ? audio.dataset.nmAudioId : null,
                currentTime: audio ? Number(audio.currentTime) || 0 : 0,
                readyState: audio ? audio.readyState : -1,
                networkState: audio ? audio.networkState : -1,
                paused: audio ? !!audio.paused : null,
                seekable: eventName === 'loadedmetadata' ? rangeSnapshot('seekable') : undefined,
              })
            } catch (err) { /* ignore */ }
          })
        })
        on('timeupdate', () => {
          if (!audio) return
          const now = Date.now()
          if (now - lastTimeEmit < 250) return
          lastTimeEmit = now
          const seconds = Number(audio.duration)
          const next = {}
          if (isFinite(seconds) && seconds > 0) next.duration = Math.round(seconds * 1000)
          /* seeking 期间不能用旧 currentTime 覆盖 UI 进度，否则松手会跳回旧位置 */
          if (!state.seeking) next.position = Math.round((audio.currentTime || 0) * 1000)
          if (Object.keys(next).length) patch(next)
        })
        on('seeking', () => {
          if (!state.seeking) patch({ seeking: true })
        })
        on('seeked', () => {
          if (!audio) return
          const landedTarget = state.seekTarget
          const actual = Number(audio.currentTime) || 0
          clearSeekTimers()
          pendingSeek = null
          pendingSeekRatio = null
          lastTimeEmit = Date.now()
          clientLog('seek:seeked', {
            currentTime: actual,
            target: Number.isFinite(Number(landedTarget)) ? Number(landedTarget) : null,
          })
          /* seekable 异常时浏览器会把目标钳回 0：明显没落地则重建 audio 上下文自愈 */
          if (Number.isFinite(Number(landedTarget)) && Number(landedTarget) > 3 && Math.abs(actual - Number(landedTarget)) > 3) {
            beginSeekRecovery(Number(landedTarget), 'seeked-miss')
            return
          }
          recoveryLogTarget = null
          patch({
            seeking: seekHoldCount > 0,
            seekTarget: null,
            position: Math.round(actual * 1000),
            loading: false,
          })
        })
        on('playing', () => {
          syncMediaState(true)
          patch({ playing: true, loading: false, error: null })
        })
        on('pause', () => {
          syncMediaState(false)
          patch({ playing: false })
        })
        on('waiting', () => patch({ loading: true }))
        on('canplay', () => patch({ loading: false }))
        on('ended', () => {
          patch({ playing: false })
          next(true)
        })
        on('error', () => {
          const code = audio && audio.error ? audio.error.code : 'x'
          clientLog('audio:error', {
            code,
            message: audio && audio.error ? String(audio.error.message || '').slice(0, 200) : '',
            src: { id: state.current ? state.current.id : null, level: state.quality },
          })
          if (!audio || !state.current) return
          patch({ error: 'playback', playing: false, loading: false })
        })
        if (typeof navigator !== 'undefined' && navigator.mediaSession) {
          try {
            navigator.mediaSession.setActionHandler('play', () => { if (!state.playing) toggle() })
            navigator.mediaSession.setActionHandler('pause', () => { if (state.playing) toggle() })
            navigator.mediaSession.setActionHandler('previoustrack', () => prev())
            navigator.mediaSession.setActionHandler('nexttrack', () => next(false))
          } catch (err) {
            /* ignore */
          }
        }
      }

      function unbindAudio() {
        if (audio) {
          try {
            audio.pause()
          } catch (err) {
            /* ignore */
          }
          audioHandlers.forEach((entry) => {
            try {
              audio.removeEventListener(entry[0], entry[1])
            } catch (err) {
              /* ignore */
            }
          })
          audioHandlers.length = 0
        }
        audio = null
      }

      function requestPlay() {
        if (!audio || !state.current) return
        patch({ loading: true })
        let promise = null
        try {
          promise = audio.play()
        } catch (err) {
          patch({ playing: false, loading: false, error: 'playback' })
          return
        }
        if (promise && typeof promise.catch === 'function') {
          promise.catch((err) => {
            clientLog('play:reject', {
              name: (err && err.name) || '',
              message: (err && err.message) ? String(err.message).slice(0, 200) : '',
            })
            if (isAbort(err)) return
            if (err && err.name === 'NotAllowedError') {
              patch({ playing: false, loading: false })
              return
            }
            patch({ playing: false, loading: false, error: 'playback' })
          })
        }
      }

      function loadCurrent(autoplay) {
        const track = state.queue[state.index]
        if (!audio || !track) {
          patch({ current: null, playing: false })
          return
        }
        pendingResume = null
        pendingSeek = null
        pendingSeekRatio = null
        recoveryLogTarget = null
        lastSeekRecoveryAt = 0
        clearSeekTimers()
        patch({
          current: track,
          loading: true,
          error: null,
          seeking: false,
          seekTarget: null,
          position: 0,
          duration: Number(track.duration) || 0,
          actualLevel: null,
          actualBr: 0,
          trial: false,
          qualityLoading: !!state.quality,
        })
        try {
          audio.pause()
        } catch (err) {
          /* ignore */
        }
        syncAudioLevel()
        try {
          audio.src = buildAudioUrl(track.id, state.quality)
          audio.load()
        } catch (err) {
          patch({ error: 'playback', loading: false })
          return
        }
        updateMediaSession(track)
        refreshUrlInfo()
        if (autoplay) requestPlay()
        else patch({ playing: false })
      }

      function setQuality(level) {
        const next = normalizeQuality(level)
        if (next === state.quality && state.current) return
        state = Object.assign({}, state, { quality: next })
        safeWrite('netease-music:quality', next)
        syncAudioLevel()
        patch({ quality: next, qualityLoading: true, error: null })
        const track = state.current
        if (!audio || !track) {
          refreshUrlInfo()
          return
        }
        const shouldPlay = state.playing
        pendingResume = {
          seconds: audio.currentTime || state.position / 1000 || 0,
          playing: shouldPlay,
        }
        patch({ seeking: false, seekTarget: null })
        patch({ loading: true })
        refreshUrlInfo()
        try {
          audio.src = buildAudioUrl(track.id, next)
          audio.load()
        } catch (err) {
          pendingResume = null
          patch({ error: 'playback', loading: false, playing: false })
        }
      }

      function playQueue(tracks, startIndex, contextTitle) {
        const list = uniqById(toArray(tracks).filter(Boolean))
        if (!list.length) return
        const index = Math.floor(clamp(startIndex || 0, 0, list.length - 1))
        patch({
          queue: list,
          index,
          contextTitle: contextTitle || '',
          queueOpen: false,
          error: null,
        })
        loadCurrent(true)
      }

      function playOne(track) {
        if (!track) return
        let index = -1
        for (let i = 0; i < state.queue.length; i += 1) {
          if (String(state.queue[i].id) === String(track.id)) {
            index = i
            break
          }
        }
        if (index >= 0) {
          patch({ index })
          loadCurrent(true)
          return
        }
        const queue = state.queue.concat([track])
        patch({ queue, index: queue.length - 1 })
        loadCurrent(true)
      }

      function enqueue(track) {
        if (!track) return
        for (let i = 0; i < state.queue.length; i += 1) {
          if (String(state.queue[i].id) === String(track.id)) {
            notifyToast('queueAdded')
            return
          }
        }
        const queue = state.queue.concat([track])
        patch({ queue })
        if (!state.current) {
          patch({ index: 0 })
          loadCurrent(true)
          return
        }
        notifyToast('queueAdded')
      }

      function jump(index) {
        const target = Math.floor(clamp(index, 0, state.queue.length - 1))
        if (target < 0 || target === state.index) {
          if (target === state.index && state.current && audio && audio.paused) requestPlay()
          return
        }
        patch({ index: target })
        loadCurrent(true)
      }

      function toggle() {
        if (!state.current) return
        if (!audio) return
        if (state.error) {
          loadCurrent(true)
          return
        }
        if (state.playing) {
          try {
            audio.pause()
          } catch (err) {
            /* ignore */
          }
        } else {
          requestPlay()
        }
      }

      function pause() {
        if (!state.current || !audio) return
        try {
          audio.pause()
        } catch (err) {
          /* ignore */
        }
        patch({ playing: false })
      }

      function resume() {
        if (!state.current) return
        if (state.error) {
          loadCurrent(true)
          return
        }
        requestPlay()
      }

      function next(auto) {
        const queue = state.queue
        if (!queue.length) return
        let index = state.index + 1
        if (index >= queue.length) {
          if (auto) {
            patch({ playing: false, position: state.duration })
            return
          }
          index = 0
        }
        patch({ index })
        loadCurrent(true)
      }

      function prev() {
        const queue = state.queue
        if (!queue.length) return
        if (audio && audio.currentTime > 3) {
          seekSeconds(0)
          return
        }
        let index = state.index - 1
        if (index < 0) index = queue.length - 1
        patch({ index })
        loadCurrent(true)
      }

      function seekableCount() {
        return audio && audio.seekable ? audio.seekable.length : 0
      }

      /* 统一的 seek 监控：6s 未落地重试一次；12s 仍无 seeked 则 toast 并恢复真实位置。
         绝不 reload audio，避免进度被重置到 0。 */
      function armSeekWatch(target) {
        clearSeekTimers()
        if (!audio) return
        const targetSec = Number.isFinite(Number(target)) ? Math.max(0, Number(target)) : null
        if (targetSec !== null) {
          seekFallbackTimer = setTimeout(() => {
            seekFallbackTimer = null
            if (!audio || !state.seeking) return
            try {
              if (seekableCount() > 0) audio.currentTime = targetSec
            } catch (err) {
              /* ignore */
            }
          }, 6000)
        }
        seekRecoverTimer = setTimeout(() => {
          seekRecoverTimer = null
          if (!audio || !state.seeking) return
          clientLog('seek:timeout', {
            target: targetSec,
            currentTime: Number(audio.currentTime) || 0,
            seekable: seekableCount(),
          })
          pendingSeek = null
          pendingSeekRatio = null
          notifyToast('seekSlow')
          patch({
            seeking: false,
            seekTarget: null,
            position: Math.round((audio.currentTime || 0) * 1000),
          })
        }, 12000)
      }

      function rangeSnapshot(prop) {
        try {
          const list = audio && audio[prop]
          if (!list || typeof list.length !== 'number') return []
          const out = []
          const count = Math.min(list.length, 4)
          for (let i = 0; i < count; i += 1) out.push([Number(list.start(i)) || 0, Number(list.end(i)) || 0])
          return out
        } catch (err) {
          return []
        }
      }

      /* 自愈：Chrome 把 audio 元素标记为不可 seek 时，重建 src/上下文，loadedmetadata 的 pendingResume 会落回目标。
         每 5 秒最多恢复一次；恢复后仍失败则提示并回到真实位置。 */
      function beginSeekRecovery(targetSeconds, reason) {
        lastSeekLogAt = Date.now()
        const track = state.current
        const target = Math.max(0, Number(targetSeconds) || 0)
        const snapshot = {
          target,
          seekable: rangeSnapshot('seekable'),
          buffered: rangeSnapshot('buffered'),
          reason: String(reason || ''),
        }
        if (!audio || !track) return false
        /* 恢复已发起但新元素 metadata 还没到：忽略旧元素的 seeked miss，避免取消 recoveryLogTarget */
        if (recoveryLogTarget != null && Date.now() - lastSeekRecoveryAt < 2500) {
          clientLog('seek:recover-skip', Object.assign({}, snapshot, { reason: 'inflight' }))
          return false
        }
        if (Date.now() - lastSeekRecoveryAt < 5000) {
          clientLog('seek:recover-skip', snapshot)
          pendingSeek = null
          pendingSeekRatio = null
          notifyToast('seekFailed')
          patch({
            seeking: false,
            seekTarget: null,
            position: Math.round((audio.currentTime || 0) * 1000),
          })
          return false
        }
        lastSeekRecoveryAt = Date.now()
        recoveryLogTarget = target
        clientLog('seek:recover', snapshot)
        pendingSeek = null
        pendingSeekRatio = null
        clearSeekTimers()
        pendingResume = { seconds: target, playing: !!state.playing }
        patch({
          seeking: true,
          seekTarget: target,
          position: Math.round(target * 1000),
          loading: true,
        })
        const oldAudio = audio
        let nextAudio = null
        try {
          /* 不复用旧 audio 元素：重建一个新的 media pipeline，彻底甩掉「不可 seek」的坏状态 */
          nextAudio = document.createElement('audio')
          nextAudio.preload = 'metadata'
          nextAudio.setAttribute('data-nm-audio', '')
          nextAudio.setAttribute('data-nm-audio-id', String(track.id))
          nextAudio.style.display = 'none'
          document.body.appendChild(nextAudio)
          bindAudio(nextAudio)
          nextAudio.src = buildAudioUrl(track.id, state.quality)
          nextAudio.load()
          if (oldAudio && oldAudio !== nextAudio) {
            try {
              oldAudio.pause()
            } catch (err) {
              /* ignore */
            }
            if (oldAudio.parentNode) oldAudio.parentNode.removeChild(oldAudio)
          }
          clientLog('seek:recover-new-element', { target, seekableBefore: snapshot.seekable })
          armSeekWatch(target)
          return true
        } catch (err) {
          if (nextAudio && nextAudio.parentNode) nextAudio.parentNode.removeChild(nextAudio)
          recoveryLogTarget = null
          notifyToast('seekFailed')
          patch({
            seeking: false,
            seekTarget: null,
            position: Math.round(((audio && Number(audio.currentTime)) || 0) * 1000),
          })
          return false
        }
      }

      function seekSeconds(seconds) {
        if (!audio) return
        lastSeekLogAt = Date.now()
        const wanted = Math.max(0, Number(seconds) || 0)
        const duration = audioDurationSeconds()
        const metadataReady = audio.readyState >= 1 && isFinite(Number(audio.duration)) && Number(audio.duration) > 0
        if (!duration || !metadataReady) {
          /* 元数据未到：记 pending，并挂统一的 6s/12s 监控，避免永远卡在 seeking */
          pendingSeekRatio = null
          pendingSeek = wanted / 1000
          lastTimeEmit = Date.now()
          clientLog('seek:pending', {
            target: pendingSeek,
            readyState: audio.readyState,
            duration: Number(audio.duration) || 0,
            seekable: seekableCount(),
          })
          patch({ seeking: true, seekTarget: pendingSeek, position: Math.round(pendingSeek * 1000) })
          armSeekWatch(pendingSeek)
          return
        }
        const target = clamp(wanted, 0, duration * 1000) / 1000
        clearSeekTimers()
        lastTimeEmit = Date.now()
        const rangesOf = (list) => {
          const out = []
          try {
            for (let i = 0; i < Math.min(list.length, 3); i += 1) out.push([Math.round(list.start(i) * 10) / 10, Math.round(list.end(i) * 10) / 10])
          } catch (err) { /* ignore */ }
          return out
        }
        let srcHint = ''
        try {
          const match = /[?&]id=(\d+).*?[?&]level=([a-z]+)/.exec(String(audio.currentSrc || ''))
          if (match) srcHint = match[1] + '/' + match[2]
        } catch (err) { /* ignore */ }
        clientLog('seek:commit', {
          target,
          duration: Number(audio.duration) || 0,
          readyState: audio.readyState,
          networkState: audio.networkState,
          seekable: rangesOf(audio.seekable),
          buffered: rangesOf(audio.buffered),
          audioId: audio.dataset ? audio.dataset.nmAudioId : null,
          srcHint,
          currentTime: Number(audio.currentTime) || 0,
        })
        let seekEnd = 0
        try {
          if (audio.seekable && audio.seekable.length) seekEnd = Number(audio.seekable.end(audio.seekable.length - 1)) || 0
        } catch (err) {
          seekEnd = 0
        }
        if (seekableCount() === 0 || seekEnd < Number(audio.duration) - 2) {
          /* 检测到不可 seek 的坏状态：直接重建 audio 上下文自愈，避免先跳目标再被钳回 0 */
          beginSeekRecovery(target, seekableCount() === 0 ? 'seekable-empty' : 'seekable-short')
          return
        }
        patch({ seeking: true, seekTarget: target, position: Math.round(target * 1000) })
        try {
          audio.currentTime = target
        } catch (err) {
          /* armSeekWatch 会兜底重试 */
        }
        armSeekWatch(target)
      }

      function beginSeekHold() {
        seekHoldCount += 1
        patch({ seeking: true })
      }

      function endSeekHold() {
        seekHoldCount = Math.max(0, seekHoldCount - 1)
        if (seekHoldCount > 0) return
        /* seek 还没落地（等元数据 / 音源确认中）：保持目标位置，绝不用旧 currentTime 回写 */
        if (pendingSeek != null || pendingSeekRatio != null || state.seeking) return
        clearSeekTimers()
        lastTimeEmit = Date.now()
        patch({
          seeking: false,
          seekTarget: null,
          position: audio ? Math.round((audio.currentTime || 0) * 1000) : state.position,
        })
      }

      function seekRatio(ratio) {
        const value = clamp(ratio, 0, 1)
        const hasAudioDuration = !!audio && audio.readyState >= 1 && isFinite(Number(audio.duration)) && Number(audio.duration) > 0
        if (hasAudioDuration) {
          seekSeconds(value * Number(audio.duration) * 1000)
          return
        }
        /* 元数据还没到：按比例记录，metadata 到达后换算真实时长；同样挂 12s 监控 */
        pendingSeek = null
        pendingSeekRatio = value
        clientLog('seek:pending', {
          target: null,
          ratio: value,
          readyState: audio.readyState,
          seekable: seekableCount(),
        })
        patch({ seeking: true, seekTarget: null })
        armSeekWatch(null)
      }

      function setVolume(value) {
        const volume = clamp(value, 0, 1)
        if (volume > 0) lastVolume = volume
        if (audio) {
          try {
            audio.muted = volume === 0
            audio.volume = volume
          } catch (err) {
            /* ignore */
          }
        }
        patch({ volume, muted: volume === 0 })
      }

      function toggleMute() {
        if (state.muted) {
          const volume = state.volume > 0 ? state.volume : lastVolume || 0.8
          if (audio) {
            try {
              audio.muted = false
              audio.volume = volume
            } catch (err) {
              /* ignore */
            }
          }
          patch({ volume, muted: false })
          return
        }
        if (state.volume > 0) lastVolume = state.volume
        if (audio) {
          try {
            audio.volume = 0
            audio.muted = true
          } catch (err) {
            /* ignore */
          }
        }
        patch({ muted: true })
      }

      function setQueueOpen(open) {
        patch({ queueOpen: !!open })
      }

      function toggleQueue() {
        patch({ queueOpen: !state.queueOpen })
      }

      function retryCurrent() {
        if (!state.current) return
        loadCurrent(true)
      }

      function dispose() {
        disposed = true
        if (toastTimer) clearTimeout(toastTimer)
        toastTimer = null
        clearSeekTimers()
        pendingSeek = null
        pendingSeekRatio = null
        recoveryLogTarget = null
        lastSeekRecoveryAt = 0
        seekHoldCount = 0
        unbindAudio()
        listeners.clear()
        state = Object.assign({}, state, { current: null, queue: [], index: -1, playing: false, loading: false, error: null, queueOpen: false, toast: null, seeking: false, seekTarget: null })
      }

      return {
        getState,
        subscribe,
        bindAudio,
        playQueue,
        playOne,
        enqueue,
        toggle,
        pause,
        resume,
        next,
        prev,
        jump,
        seekSeconds,
        seekRatio,
        beginSeekHold,
        endSeekHold,
        setVolume,
        toggleMute,
        setQueueOpen,
        toggleQueue,
        retryCurrent,
        setQuality,
        dispose,
      }
    }

    const player = createPlayer()

    /* ------------------------------------------------------------------ *
     * React 兼容 hooks
     * ------------------------------------------------------------------ */
    const useSyncStore = typeof React.useSyncExternalStore === 'function'
      ? React.useSyncExternalStore
      : function useSyncStoreFallback(subscribe, getSnapshot) {
        const [snapshot, setSnapshot] = React.useState(getSnapshot)
        React.useEffect(() => {
          let alive = true
          const update = () => {
            if (alive) setSnapshot(getSnapshot())
          }
          update()
          const unsubscribe = subscribe(update)
          return () => {
            alive = false
            unsubscribe()
          }
        }, [subscribe, getSnapshot])
        return snapshot
      }

    /* 播放器选择器：只订阅需要的字段，避免整页 4 次/秒重渲染 */
    function usePlayerSelector(selector) {
      return useSyncStore(player.subscribe, () => selector(player.getState()))
    }

    function usePlayerState() {
      return useSyncStore(player.subscribe, player.getState)
    }

    /* locale：applied 时替换 t，locale 变化时触发重渲染 */
    let translate = function fallbackTranslate(key, params) {
      const fallback = ZH[key] || key
      if (!params) return fallback
      return fallback.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }
    let localeVersion = 0
    const localeListeners = new Set()

    function subscribeLocale(fn) {
      localeListeners.add(fn)
      return function unsubscribeLocale() {
        localeListeners.delete(fn)
      }
    }

    function getLocaleVersion() {
      return localeVersion
    }

    function bumpLocale() {
      localeVersion += 1
      Array.from(localeListeners).forEach((fn) => {
        try {
          fn()
        } catch (err) {
          /* ignore */
        }
      })
    }

    function useT() {
      useSyncStore(subscribeLocale, getLocaleVersion)
      return translate
    }

    function useDebounced(value, delay) {
      const [debounced, setDebounced] = React.useState(value)
      React.useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay)
        return () => clearTimeout(timer)
      }, [value, delay])
      return debounced
    }

    function useResource(loader, key, enabled) {
      const enabledFlag = enabled !== false
      const loaderRef = React.useRef(loader)
      loaderRef.current = loader
      const [state, setState] = React.useState({ loading: enabledFlag, error: null, data: null })
      const [nonce, setNonce] = React.useState(0)

      React.useEffect(() => {
        if (!enabledFlag) {
          setState({ loading: false, error: null, data: null })
          return undefined
        }
        let alive = true
        const controller = new AbortController()
        setState((prev) => ({ loading: true, error: null, data: prev.data }))
        Promise.resolve()
          .then(() => loaderRef.current(controller.signal))
          .then((data) => {
            if (!alive) return
            setState({ loading: false, error: null, data })
          })
          .catch((err) => {
            if (!alive || isAbort(err)) return
            setState({
              loading: false,
              error: (err && err.message) || '加载失败',
              data: null,
            })
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [key, enabledFlag, nonce])

      const reload = React.useCallback(() => setNonce((n) => n + 1), [])
      return { loading: state.loading, error: state.error, data: state.data, reload }
    }

    function useStatus() {
      const [state, setState] = React.useState({ loading: true, data: null, error: null })
      const alive = React.useRef(true)
      const request = React.useCallback(async () => {
        try {
          const data = await apiGet('/status')
          if (alive.current) setState({ loading: false, data, error: null })
        } catch (err) {
          if (alive.current) setState((prev) => ({ loading: false, data: prev.data, error: (err && err.message) || '连接失败' }))
        }
      }, [])
      React.useEffect(() => {
        alive.current = true
        request()
        const timer = setInterval(request, 20000)
        return () => {
          alive.current = false
          clearInterval(timer)
        }
      }, [request])
      return { loading: state.loading, data: state.data, error: state.error, refresh: request }
    }

    function useAutoFocus(ref, active) {
      React.useEffect(() => {
        if (!active) return
        const node = ref && ref.current
        if (!node || typeof node.focus !== 'function') return
        const timer = setTimeout(() => {
          try {
            node.focus()
          } catch (err) {
            /* ignore */
          }
        }, 30)
        return () => clearTimeout(timer)
      }, [active, ref])
    }

    /* ------------------------------------------------------------------ *
     * v2 全局 UI store：dock 形态 / Now Playing / 播放页模式 / 登录态
     * ------------------------------------------------------------------ */
    /* 音乐面板是否挂载：侧栏迷你播放器据此判断是否让位给面板内 dock */
    let pageMounted = false
    const pageMountedListeners = new Set()

    function setPageMounted(next) {
      const value = !!next
      if (pageMounted === value) return
      pageMounted = value
      Array.from(pageMountedListeners).forEach((fn) => {
        try {
          fn()
        } catch (err) {
          /* ignore */
        }
      })
    }

    function subscribePageMounted(fn) {
      pageMountedListeners.add(fn)
      return () => pageMountedListeners.delete(fn)
    }

    function usePageMounted() {
      return useSyncStore(subscribePageMounted, () => pageMounted)
    }

    let npOpen = false
    const npOpenListeners = new Set()

    function emitNpOpen() {
      Array.from(npOpenListeners).forEach((fn) => {
        try {
          fn()
        } catch (err) {
          /* ignore */
        }
      })
    }

    function openNowPlaying() {
      if (npOpen) return
      npOpen = true
      emitNpOpen()
    }

    function closeNowPlaying() {
      if (!npOpen) return
      npOpen = false
      emitNpOpen()
    }

    function subscribeNpOpen(fn) {
      npOpenListeners.add(fn)
      return () => npOpenListeners.delete(fn)
    }

    function getNpOpen() {
      return npOpen
    }

    function useNpOpen() {
      return useSyncStore(subscribeNpOpen, getNpOpen)
    }

    let npMode = safeRead('netease-music:np-mode') === 'lyrics' ? 'lyrics' : 'vinyl'
    const npModeListeners = new Set()

    function setNpMode(next) {
      const value = next === 'lyrics' ? 'lyrics' : 'vinyl'
      if (npMode === value) return
      npMode = value
      safeWrite('netease-music:np-mode', value)
      Array.from(npModeListeners).forEach((fn) => {
        try {
          fn()
        } catch (err) {
          /* ignore */
        }
      })
    }

    function subscribeNpMode(fn) {
      npModeListeners.add(fn)
      return () => npModeListeners.delete(fn)
    }

    function useNpMode() {
      return useSyncStore(subscribeNpMode, () => npMode)
    }

    let authInfo = { authed: false, vip: false }
    const authListeners = new Set()

    function setAuthInfo(next) {
      const value = { authed: !!(next && next.authed), vip: !!(next && next.vip) }
      if (authInfo.authed === value.authed && authInfo.vip === value.vip) return
      const authedChanged = authInfo.authed !== value.authed
      authInfo = value
      if (authedChanged) resetLikeCache()
      Array.from(authListeners).forEach((fn) => {
        try {
          fn()
        } catch (err) {
          /* ignore */
        }
      })
    }

    function subscribeAuth(fn) {
      authListeners.add(fn)
      return () => authListeners.delete(fn)
    }

    function useAuthInfo() {
      return useSyncStore(subscribeAuth, () => authInfo)
    }

    /* ------------------------------------------------------------------ *
     * 歌曲收藏（红心）：模块级缓存 + 批量状态查询，列表 / 播放页 / dock 共享
     * ------------------------------------------------------------------ */
    const likeCache = new Map()
    const likeCheckedAt = new Map()
    const likePending = new Set()
    const likeListeners = new Set()
    const likeQueue = new Set()
    let likeFlushTimer = null
    let likeGlobalToast = null
    let uiToastSink = null
    /* 服务端 /like/status 返回的登录态；false 时红心置灰、点击只提示登录，绝不发 POST */
    let likeServerAuthed = null

    function setLikeToast(fn) {
      likeGlobalToast = fn || null
      uiToastSink = fn || null
    }

    function setUiToast(fn) {
      uiToastSink = fn || null
    }

    function pushLikeToast(message) {
      if (typeof likeGlobalToast === 'function' && message) likeGlobalToast(message)
    }

    function pushUiToast(message) {
      if (typeof uiToastSink === 'function' && message) uiToastSink(message)
    }

    function notifyLike(changedId) {
      Array.from(likeListeners).forEach((fn) => {
        try {
          fn(changedId)
        } catch (err) {
          /* ignore */
        }
      })
    }

    function resetLikeCache() {
      likeCache.clear()
      likeCheckedAt.clear()
      likePending.clear()
      likeQueue.clear()
      likeServerAuthed = null
      if (likeFlushTimer) {
        clearTimeout(likeFlushTimer)
        likeFlushTimer = null
      }
      notifyLike('')
    }

    function ensureLikeStatus(ids) {
      const list = Array.isArray(ids) ? ids : [ids]
      list.forEach((raw) => {
        const id = String(raw === undefined || raw === null ? '' : raw)
        if (!id) return
        const checkedAt = likeCheckedAt.get(id) || 0
        if (likeCheckedAt.has(id) && Date.now() - checkedAt < 60000) return
        likeQueue.add(id)
      })
      if (!likeQueue.size || likeFlushTimer) return
      likeFlushTimer = setTimeout(flushLikeStatus, 40)
    }

    function flushLikeStatus() {
      likeFlushTimer = null
      const ids = Array.from(likeQueue).slice(0, 50)
      ids.forEach((id) => likeQueue.delete(id))
      if (!ids.length) return
      apiGet('/like/status?ids=' + ids.join(',')).then((data) => {
        likeServerAuthed = !!(data && data.authed)
        const liked = (data && data.liked) || {}
        ids.forEach((id) => {
          likeCache.set(id, liked[id] === true)
          likeCheckedAt.set(id, Date.now())
        })
        notifyLike('')
        if (likeQueue.size && !likeFlushTimer) likeFlushTimer = setTimeout(flushLikeStatus, 40)
      }).catch(() => {
        /* 状态查询失败保持未知，不打扰用户 */
      })
    }

    function getLikeCached(trackId) {
      return likeCache.get(String(trackId === undefined || trackId === null ? '' : trackId)) === true
    }

    function applyServerLike(trackId, liked) {
      const id = String(trackId === undefined || trackId === null ? '' : trackId)
      if (!id) return
      likeCache.set(id, !!liked)
      likeCheckedAt.set(id, Date.now())
      notifyLike(id)
    }

    function toggleLike(trackId, t) {
      const id = String(trackId === undefined || trackId === null ? '' : trackId)
      if (!id) return
      if (!authInfo.authed || likeServerAuthed === false) {
        pushLikeToast(t('like.needLogin'))
        return
      }
      if (likePending.has(id)) return
      const previous = likeCache.get(id) === true
      const next = !previous
      likeCache.set(id, next)
      likeCheckedAt.set(id, Date.now())
      likePending.add(id)
      notifyLike(id)
      apiPost('/like', { id: Number(id) || id, like: next }).then((data) => {
        const value = data && typeof data.liked === 'boolean' ? data.liked : next
        likeCache.set(id, value)
      }).catch((err) => {
        likeCache.set(id, previous)
        pushLikeToast((err && err.message) || t('like.fail'))
      }).then(() => {
        likePending.delete(id)
        notifyLike(id)
      })
    }

    function useLike(trackId) {
      const id = String(trackId === undefined || trackId === null ? '' : trackId)
      const [, setVersion] = React.useState(0)
      const auth = useAuthInfo()
      React.useEffect(() => {
        const listener = (changedId) => {
          if (!changedId || changedId === id) setVersion((value) => value + 1)
        }
        likeListeners.add(listener)
        if (id) ensureLikeStatus(id)
        return () => likeListeners.delete(listener)
      }, [id, auth.authed])
      return {
        liked: likeCache.get(id) === true,
        known: likeCheckedAt.has(id),
        pending: likePending.has(id),
        canLike: auth.authed && likeServerAuthed !== false,
      }
    }

    function LikeButton(props) {
      const t = useT()
      const trackId = props.id
      const info = useLike(trackId)
      const size = props.size || 14
      const liked = info.liked
      return h('button', {
        type: 'button',
        className: cx('nm-like', liked && 'is-liked', info.pending && 'is-pending', !info.canLike && 'is-disabled', props.className),
        'data-nm': props.nm || 'track-like',
        'data-id': String(trackId === undefined || trackId === null ? '' : trackId),
        'data-liked': liked ? 'true' : 'false',
        'aria-pressed': liked ? 'true' : 'false',
        title: liked ? t('action.unlike') : t('action.like'),
        'aria-label': (liked ? t('action.unlike') : t('action.like')) + (props.label ? ' ' + props.label : ''),
        onClick: (event) => {
          event.stopPropagation()
          toggleLike(trackId, t)
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            toggleLike(trackId, t)
          }
        },
      }, h(Icon, { name: liked ? 'heart' : 'heartO', size }))
    }

    /* 点击 dock 封面/歌名：先确保面板在前台，再进入播放页 */
    function enterNowPlayingFromDock() {
      openPanel()
      openNowPlaying()
    }

    /* 全局 pointerup 派发：进度条在元素外松开也能提交最终位置 */
    const seekPointerHandlers = new Set()

    function notifySeekPointerUp() {
      Array.from(seekPointerHandlers).forEach((fn) => {
        try {
          fn()
        } catch (err) {
          /* ignore */
        }
      })
    }

    function useSeekPointerGuard(handler) {
      React.useEffect(() => {
        seekPointerHandlers.add(handler)
        return () => seekPointerHandlers.delete(handler)
      }, [handler])
    }

    /* ------------------------------------------------------------------ *
     * 图标
     * ------------------------------------------------------------------ */
    const ICON_DEFS = {
      play: { paths: ['M8.2 5.1c0-.85.93-1.37 1.66-.92l10 6.4a1.1 1.1 0 0 1 0 1.85l-10 6.4c-.73.45-1.66-.07-1.66-.92z'] },
      pause: { paths: ['M7 4.6h3.3v14.8H7z', 'M13.7 4.6H17v14.8h-3.3z'] },
      next: { paths: ['M5.6 6.1c0-.9.98-1.45 1.75-.97l8.6 5.4c.77.48.77 1.6 0 2.08l-8.6 5.4c-.77.48-1.75-.07-1.75-.97z', 'M18.6 5h2v14h-2z'] },
      prev: { paths: ['M18.4 6.1c0-.9-.98-1.45-1.75-.97l-8.6 5.4c-.77.48-.77 1.6 0 2.08l8.6 5.4c.77.48 1.75-.07 1.75-.97z', 'M3.4 5h2v14h-2z'] },
      search: { stroke: true, paths: ['M10.5 4.2a6.3 6.3 0 1 0 0 12.6 6.3 6.3 0 0 0 0-12.6z', 'M15.2 15.2 20 20'] },
      refresh: { stroke: true, paths: ['M20 11.3a8 8 0 1 0-2.4 6.3', 'M20 5v6.3h-6.3'] },
      back: { stroke: true, paths: ['M15 5l-7 7 7 7'] },
      right: { stroke: true, paths: ['M9 5l7 7-7 7'] },
      down: { stroke: true, paths: ['M6 9.5l6 6 6-6'] },
      up: { stroke: true, paths: ['M6 14.5l6-6 6 6'] },
      close: { stroke: true, paths: ['M6.2 6.2l11.6 11.6', 'M17.8 6.2L6.2 17.8'] },
      volume: { stroke: true, paths: ['M4 9.4h3l4.3-3.5v12.2L7 14.6H4z', 'M15.2 9.3a4 4 0 0 1 0 5.4', 'M17.9 6.8a7.5 7.5 0 0 1 0 10.4'] },
      mute: { stroke: true, paths: ['M4 9.4h3l4.3-3.5v12.2L7 14.6H4z', 'M15.8 9.6l4.4 4.8', 'M20.2 9.6l-4.4 4.8'] },
      queue: { stroke: true, paths: ['M4 7h10.5', 'M4 12h10.5', 'M4 17h7', 'M18.2 7.4v9.1', 'M18.2 16.5a2.1 2.1 0 1 0-2.1-2.1'] },
      qr: { stroke: true, paths: ['M4.5 4.5h4.8v4.8H4.5z', 'M14.7 4.5h4.8v4.8h-4.8z', 'M4.5 14.7h4.8v4.8H4.5z', 'M14.7 14.7h4.8v4.8h-4.8z'] },
      note: { paths: ['M9 18a2.6 2.6 0 1 1-2.6-2.6c.47 0 .92.13 1.3.35V6.5l9.9-2.1v9.3a2.6 2.6 0 1 1-2.6-2.6c.47 0 .92.13 1.3.35V7.4l-7.3 1.55z'] },
      heart: { paths: ['M12 21.2 10.55 19.9C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.4z'] },
      heartO: { stroke: true, w: 1.75, paths: ['M12 20.15 10.9 19.2C5.9 14.8 2.6 11.85 2.6 8.35c0-2.7 2.1-4.8 4.8-4.8 1.56 0 3.07.73 4.6 2.08 1.53-1.35 3.04-2.08 4.6-2.08 2.7 0 4.8 2.1 4.8 4.8 0 3.5-3.3 6.45-8.3 10.85z'] },
      alert: { stroke: true, paths: ['M12 4.4 21 20H3z', 'M12 10v4.2', 'M12 17.2h.01'] },
      plus: { stroke: true, paths: ['M12 5v14', 'M5 12h14'] },
      disc: { stroke: true, paths: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'] },
      lyrics: { stroke: true, paths: ['M4.5 7h9', 'M4.5 12h9', 'M4.5 17h5.5', 'M18.4 6.2v7.1', 'M18.4 13.3a2.1 2.1 0 1 0-2.1-2.1'] },
      expand: { stroke: true, paths: ['M9.5 4.5H4.5v5', 'M14.5 4.5h5v5', 'M9.5 19.5H4.5v-5', 'M14.5 19.5h5v-5'] },
      check: { stroke: true, paths: ['M5 12.6l4.6 4.6L19 7.2'], w: 2.2 },
      logout: { stroke: true, paths: ['M15 5h3.2A1.8 1.8 0 0 1 20 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H15', 'M10.5 8 6.5 12l4 4', 'M6.5 12H15.5'] },
    }

    function Icon(props) {
      const def = ICON_DEFS[props.name]
      if (!def) return null
      const size = props.size || 16
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        className: cx('nm-ico', props.className),
        style: props.style,
        'aria-hidden': 'true',
        focusable: 'false',
      }, def.stroke
        ? h('g', {
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: def.w || 1.9,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }, def.paths.map((d, i) => h('path', { key: i, d })))
        : h('g', { fill: 'currentColor' }, def.paths.map((d, i) => h('path', { key: i, d }))))
    }

    function Spinner(props) {
      return h('span', { className: cx('nm-spinner', props && props.className), 'aria-hidden': 'true' })
    }

    /* ------------------------------------------------------------------ *
     * 基础展示组件
     * ------------------------------------------------------------------ */
    function Cover(props) {
      const [stage, setStage] = React.useState(0)
      React.useEffect(() => {
        setStage(0)
      }, [props.src])
      const good = httpsUrl(props.src)
      let url = null
      if (good && stage === 0) url = good
      else if (good && stage === 1) url = API + '/img?u=' + encodeURIComponent(good)
      return h('span', {
        className: cx('nm-cover', props.rounded && 'is-round', props.className),
        style: { '--nm-h': String(hueOf(props.name || '')) },
      },
      h('span', { className: 'nm-cover-ph', 'aria-hidden': 'true' }, h('span', null, initialOf(props.name))),
      url ? h('img', {
        src: url,
        alt: props.name || '',
        loading: props.eager ? 'eager' : 'lazy',
        draggable: false,
        onError: () => setStage((value) => (value < 2 ? value + 1 : 2)),
      }) : null,
      props.children)
    }

    function Equalizer(props) {
      return h('span', { className: cx('nm-wave', props.playing && 'is-playing'), 'aria-hidden': 'true' },
        h('i', { key: 0 }), h('i', { key: 1 }), h('i', { key: 2 }), h('i', { key: 3 }))
    }

    function SectionHead(props) {
      return h('div', { className: 'nm-section-head' },
        h('div', { className: 'nm-section-titles' },
          h('h2', null, props.title),
          props.sub ? h('span', { className: 'nm-section-sub' }, props.sub) : null),
        props.action ? h('div', { className: 'nm-section-action' }, props.action) : null)
    }

    function StateBox(props) {
      const kind = props.kind || 'empty'
      const isError = kind === 'error'
      return h('div', {
        className: cx('nm-state', kind),
        'data-nm': isError ? 'error' : 'empty',
        role: isError ? 'alert' : undefined,
      },
      h('span', { className: 'nm-state-icon' }, h(Icon, { name: isError ? 'alert' : kind === 'login' ? 'qr' : 'note', size: 20 })),
      h('span', { className: 'nm-state-msg' }, props.message || ''),
      props.action ? h('button', { type: 'button', className: 'nm-btn sm', onClick: props.onAction }, props.action) : null)
    }

    function AsyncBody(props) {
      if (props.loading) return props.skeleton || h(TracksSkeleton, { rows: 5 })
      if (props.error) {
        return h(StateBox, {
          kind: 'error',
          message: props.error || '',
          action: props.t('action.retry'),
          onAction: props.onRetry,
        })
      }
      if (props.isEmpty) return props.empty || h(StateBox, { message: props.t('state.empty') })
      return props.children
    }

    function SkeletonCards(props) {
      const count = props.count || 6
      const round = props.kind === 'artist'
      const items = []
      for (let i = 0; i < count; i += 1) {
        items.push(h('div', { key: i, className: 'nm-skel-card' },
          h('div', { className: cx('nm-skel', 'nm-skel-art', round && 'is-round') }),
          h('div', { className: 'nm-skel nm-skel-line', style: { width: '74%' } }),
          round ? null : h('div', { className: 'nm-skel nm-skel-line sm', style: { width: '46%' } })))
      }
      return h('div', { 'data-nm': 'skeleton', className: cx('nm-grid', round && 'nm-grid-artists', props.className) }, items)
    }

    function TracksSkeleton(props) {
      const rows = props.rows || 5
      const items = []
      for (let i = 0; i < rows; i += 1) {
        items.push(h('div', { key: i, className: 'nm-skel-track' },
          h('div', { className: 'nm-skel', style: { width: 38, height: 38, borderRadius: 10 } }),
          h('div', { className: 'nm-skel-stack' },
            h('div', { className: 'nm-skel', style: { width: '34%', height: 11 } }),
            h('div', { className: 'nm-skel', style: { width: '20%', height: 9 } }))))
      }
      return h('div', { 'data-nm': 'skeleton', className: 'nm-skel-tracks' }, items)
    }

    function DetailSkeleton() {
      return h('div', { 'data-nm': 'skeleton', className: 'nm-skel-detail' },
        h('div', { className: 'nm-skel', style: { width: 190, height: 190, borderRadius: 18 } }),
        h('div', { className: 'nm-skel-detail-lines' },
          h('div', { className: 'nm-skel', style: { width: 80, height: 10 } }),
          h('div', { className: 'nm-skel', style: { width: '52%', height: 30 } }),
          h('div', { className: 'nm-skel', style: { width: '34%', height: 12 } }),
          h('div', { className: 'nm-skel', style: { width: 148, height: 36, borderRadius: 999 } })))
    }

    /* 详情页/歌单的曲目表：超过 100 行先截断，避免 400+ 行一次挂载 */
    const TRACK_PAGE = 100

    function TrackList(props) {
      const t = props.t
      const tracks = toArray(props.tracks)
      const contextTitle = props.contextTitle || ''
      const [shown, setShown] = React.useState(TRACK_PAGE)
      React.useEffect(() => {
        setShown(TRACK_PAGE)
      }, [tracks])
      const currentId = usePlayerSelector((snapshot) => (snapshot.current ? String(snapshot.current.id) : ''))
      const playing = usePlayerSelector((snapshot) => snapshot.playing)
      const onOpenArtist = props.onOpenArtist
      if (!tracks.length) {
        return h(StateBox, { message: props.emptyText || t('state.noSongs') })
      }
      const visible = tracks.slice(0, shown)
      return h('div', { className: 'nm-tracklist' },
        h('div', { className: 'nm-tracks', role: 'list' },
          visible.map((track, index) => h(TrackRow, {
            key: String(track.id) + '-' + index,
            t,
            track,
            index,
            active: currentId !== '' && currentId === String(track.id),
            playing: playing && currentId === String(track.id),
            onOpenArtist,
            onPlay: () => {
              player.playQueue(tracks, index, contextTitle)
              openNowPlaying()
            },
            onQueue: () => player.enqueue(track),
          }))),
        tracks.length > shown
          ? h('div', { className: 'nm-load-more' },
            h('button', {
              type: 'button',
              className: 'nm-btn',
              onClick: () => setShown((value) => value + TRACK_PAGE),
            }, t('action.loadMore') + ' · ' + (tracks.length - shown)))
          : null)
    }

    function TrackRow(props) {
      const t = props.t
      const track = props.track
      return h('div', {
        className: cx('nm-track', props.active && 'is-active'),
        'data-nm': 'track',
        'data-id': String(track.id),
        role: 'listitem',
        tabIndex: 0,
        'aria-label': track.name + ' - ' + trackArtists(track),
        onClick: props.onPlay,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            props.onPlay()
          }
        },
      },
      h('div', { className: 'nm-track-idx' },
        props.active ? h(Equalizer, { playing: props.playing }) : h('span', { className: 'nm-track-num' }, String(props.index + 1))),
      h('div', { className: 'nm-track-cover' }, h(Cover, { src: track.cover, name: track.name })),
      h('div', { className: 'nm-track-main' },
        h('div', { className: 'nm-track-title' },
          h('span', { className: 'nm-track-name', title: track.name }, track.name),
          track.vip ? h('span', { className: 'nm-badge vip' }, t('vip')) : null),
        h('div', { className: 'nm-track-artist' }, renderArtists(track, props.onOpenArtist, t))),
      h('div', { className: 'nm-track-album', title: track.album || '' }, track.album || ''),
      h('div', { className: 'nm-track-time' }, fmtTime(track.duration)),
      h('div', { className: 'nm-track-actions' },
        h('button', {
          type: 'button',
          className: 'nm-icon-btn nm-track-play',
          'data-nm': 'track-play',
          title: t('action.play'),
          'aria-label': t('action.play') + ' ' + track.name,
          onClick: (event) => {
            event.stopPropagation()
            props.onPlay()
          },
        }, h(Icon, { name: props.active && props.playing ? 'pause' : 'play', size: 14 })),
        h(LikeButton, {
          id: track.id,
          nm: 'track-like',
          size: 15,
          className: 'nm-track-like',
          label: track.name,
        }),
        h('button', {
          type: 'button',
          className: 'nm-icon-btn nm-track-add',
          title: t('action.addQueue'),
          'aria-label': t('action.addQueue') + ' ' + track.name,
          onClick: (event) => {
            event.stopPropagation()
            props.onQueue()
          },
        }, h(Icon, { name: 'plus', size: 14 }))))
    }

    function renderArtists(track, onOpenArtist, t) {
      const list = Array.isArray(track && track.artists)
        ? track.artists.filter((artist) => artist && artist.id !== undefined && artist.name)
        : []
      if (!list.length) return trackArtists(track) || (t ? t('state.unknownArtist') : '未知歌手')
      if (typeof onOpenArtist !== 'function') return list.map((artist) => artist.name).join(' / ')
      const nodes = []
      list.forEach((artist, index) => {
        if (index > 0) nodes.push(h('span', { key: 'sep' + index, className: 'nm-sep' }, ' / '))
        nodes.push(h('span', {
          key: 'artist-' + String(artist.id) + '-' + index,
          className: 'nm-inline-link',
          role: 'link',
          tabIndex: 0,
          onClick: (event) => {
            event.stopPropagation()
            onOpenArtist(artist)
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              onOpenArtist(artist)
            }
          },
        }, artist.name))
      })
      return nodes
    }

    function CoverCard(props) {
      const t = props.t
      const item = props.item || {}
      const kind = props.kind || 'playlist'
      const isArtist = kind === 'artist'
      const title = item.name || t('state.unknown')
      let sub = ''
      if (kind === 'playlist') {
        sub = item.trackCount ? t('meta.tracks', { n: fmtCount(item.trackCount, t) }) : item.creator || ''
      } else if (kind === 'album') {
        sub = item.artist || ''
      } else {
        const alias = Array.isArray(item.alias) ? item.alias : isString(item.alias) ? [item.alias] : []
        sub = alias.length ? alias[0] : (item.songCount ? t('meta.songs', { n: fmtCount(item.songCount, t) }) : '')
      }
      return h('article', {
        className: cx('nm-card', isArtist && 'is-artist', props.className),
        'data-nm': 'cover-card',
        'data-kind': kind,
        'data-id': String(item.id),
        role: 'button',
        tabIndex: 0,
        'aria-label': title,
        onClick: props.onOpen,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            props.onOpen()
          }
        },
      },
      h('div', { className: 'nm-card-art' },
        h(Cover, { src: isArtist ? item.avatar : item.cover, name: title, rounded: isArtist }),
        isArtist ? null : h('div', { className: 'nm-card-play' },
          h('button', {
            type: 'button',
            className: 'nm-card-play-btn',
            title: t('action.play') + ' ' + title,
            'aria-label': t('action.play') + ' ' + title,
            onClick: (event) => {
              event.stopPropagation()
              if (typeof props.onPlay === 'function') props.onPlay()
              else props.onOpen()
            },
          }, h(Icon, { name: 'play', size: 17 }))),
        !isArtist && item.playCount
          ? h('span', { className: 'nm-card-count' }, h(Icon, { name: 'play', size: 9 }), fmtCount(item.playCount, t))
          : null),
      h('div', { className: 'nm-card-title', title }, title),
      sub ? h('div', { className: 'nm-card-sub', title: sub }, sub) : null)
    }

    function CardGrid(props) {
      return h('div', { className: cx('nm-grid', props.kind === 'artist' && 'nm-grid-artists', props.className) },
        toArray(props.items).map((item) => h(CoverCard, {
          key: String(item.id),
          t: props.t,
          kind: props.kind,
          item,
          onOpen: () => props.onOpen(props.kind, item),
          onPlay: () => props.onPlay(props.kind, item),
        })))
    }

    /* ------------------------------------------------------------------ *
     * Hero / 登录引导 / 顶栏 / Tabs
     * ------------------------------------------------------------------ */
    function EngineProgressBar(props) {
      const t = props.t
      const install = props.install || {}
      const phase = install.phase || 'clone'
      const phaseKey = 'engine.phase.' + (['clone', 'venv', 'pip', 'verify', 'done'].indexOf(phase) >= 0 ? phase : 'clone')
      return h('div', { className: 'nm-engine-progress', 'data-nm': 'engine-progress', role: 'status' },
        h(Spinner),
        h('span', { className: 'nm-engine-progress-title' }, t('engine.installingTitle')),
        h('span', { className: 'nm-engine-progress-phase' }, t(phaseKey)),
        h('span', { className: 'nm-engine-progress-bar' }, h('i', null)))
    }

    function EngineSetupCard(props) {
      const t = props.t
      const install = props.install || {}
      const running = install.state === 'running'
      const failed = install.state === 'failed'
      const lines = toArray(install.lines).slice(-160)
      const logRef = React.useRef(null)
      React.useEffect(() => {
        const node = logRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [lines.length, install.state])
      const phase = install.phase || ''
      const phaseKey = phase && phase !== 'done' && phase !== 'failed' ? 'engine.phase.' + phase : ''
      return h('div', { className: 'nm-engine', 'data-nm': 'engine-setup', role: 'alert' },
        h('div', { className: 'nm-engine-head' },
          h('span', { className: 'nm-engine-icon' }, h(Icon, { name: 'alert', size: 18 })),
          h('div', { className: 'nm-engine-titles' },
            h('div', { className: 'nm-engine-title' },
              running ? t('engine.installingTitle') : failed ? t('engine.installFailed') : t('engine.title')),
            h('div', { className: 'nm-engine-desc' },
              running ? t('engine.installingDesc') : failed ? (install.error || t('engine.installFailed')) : t('engine.desc')))),
        (running || failed || lines.length)
          ? h('div', { className: 'nm-engine-body' },
            h('div', { className: 'nm-engine-label' }, phaseKey ? t(phaseKey) : t('engine.installFailed')),
            h('pre', {
              className: 'nm-engine-log',
              'data-nm': 'engine-log',
              ref: logRef,
            }, lines.length ? lines.join('\n') : (running ? t('engine.wait') : (install.error || t('engine.wait')))),
            running ? h('span', { className: 'nm-engine-progress-bar is-inline' }, h('i', null)) : null)
          : null,
        h('div', { className: 'nm-engine-foot' },
          h('span', { className: 'nm-engine-hint' }, running ? t('engine.installingDesc') : t('engine.hint')),
          running
            ? null
            : h('button', {
              type: 'button',
              className: 'nm-btn sm accent',
              'data-nm': failed ? 'engine-retry' : 'engine-install',
              disabled: !!props.starting,
              onClick: props.onInstall,
            }, failed ? t('engine.retryInstall') : t('engine.install'))))
    }

    const HERO_MODES = [
      { key: 'heart', title: 'hero.heart', desc: 'hero.heartDesc' },
      { key: 'roam', title: 'hero.roam', desc: 'hero.roamDesc' },
      { key: 'similar_song', title: 'hero.similarSong', desc: 'hero.similarSongDesc' },
      { key: 'similar_artist', title: 'hero.similarArtist', desc: 'hero.similarArtistDesc' },
      { key: 'daily', title: 'hero.daily', desc: 'hero.dailyDesc' },
    ]

    function HeroCarousel(props) {
      const t = props.t
      const currentSong = usePlayerSelector((snapshot) => snapshot.current)
      const daily = toArray(props.daily)
      const total = HERO_MODES.length
      const [pos, setPos] = React.useState(1)
      const [noTransition, setNoTransition] = React.useState(false)
      const [hover, setHover] = React.useState(false)
      const [dragging, setDragging] = React.useState(false)
      const [dragX, setDragX] = React.useState(0)
      const [pending, setPending] = React.useState('')
      const [modeMeta, setModeMeta] = React.useState({})
      const pendingRef = React.useRef('')
      const dragRef = React.useRef({ active: false, startX: 0, dx: 0, moved: false, captured: false })
      const suppressRef = React.useRef(false)
      const suppressTimer = React.useRef(null)
      const animatingRef = React.useRef(false)
      const animTimer = React.useRef(null)
      const posRef = React.useRef(pos)
      posRef.current = pos
      const trackRef = React.useRef(null)
      const realIndex = ((pos - 1) % total + total) % total

      const clearAnimTimer = () => {
        if (animTimer.current) {
          clearTimeout(animTimer.current)
          animTimer.current = null
        }
      }

      /* 到克隆端点后：关 transition 瞬间归位，再恢复，形成无缝无限轮播 */
      const snapIfEdge = () => {
        const current = posRef.current
        if (current === 0 || current === total + 1) {
          setNoTransition(true)
          setPos(current === 0 ? total : 1)
        }
        animatingRef.current = false
        clearAnimTimer()
      }

      React.useEffect(() => () => {
        if (suppressTimer.current) clearTimeout(suppressTimer.current)
        clearAnimTimer()
      }, [])

      React.useEffect(() => {
        if (!noTransition) return undefined
        let second = 0
        const first = requestAnimationFrame(() => {
          second = requestAnimationFrame(() => setNoTransition(false))
        })
        return () => {
          cancelAnimationFrame(first)
          if (second) cancelAnimationFrame(second)
        }
      }, [noTransition])

      React.useEffect(() => {
        if (hover || dragging || props.loading) return undefined
        const timer = setTimeout(() => step(1), 6000)
        return () => clearTimeout(timer)
      }, [hover, dragging, props.loading, pos])

      const go = (delta) => {
        step(delta)
      }

      const step = (delta) => {
        if (animatingRef.current) return
        animatingRef.current = true
        clearAnimTimer()
        setPos((value) => {
          const next = value + delta
          if (next < 0 || next > total + 1) return value
          return next
        })
        animTimer.current = setTimeout(() => {
          if (!animatingRef.current) return
          snapIfEdge()
        }, 520)
      }

      const jumpTo = (index) => {
        if (animatingRef.current) return
        animatingRef.current = true
        clearAnimTimer()
        setPos(index + 1)
        animTimer.current = setTimeout(() => {
          animatingRef.current = false
          clearAnimTimer()
        }, 460)
      }

      const onTrackTransitionEnd = (event) => {
        if (!event || event.target !== trackRef.current) return
        if (event.propertyName && event.propertyName !== 'transform') return
        if (!animatingRef.current) return
        const current = posRef.current
        if (current === 0 || current === total + 1) snapIfEdge()
        else {
          animatingRef.current = false
          clearAnimTimer()
        }
      }

      const covers = []
      daily.forEach((song) => {
        const cover = httpsUrl(song && song.cover)
        if (cover && covers.length < 8) covers.push(cover)
      })

      const seedSong = currentSong || daily[0] || null
      const seedSongId = seedSong && seedSong.id != null ? String(seedSong.id) : ''
      let seedArtistId = ''
      if (seedSong) {
        if (Array.isArray(seedSong.artists) && seedSong.artists.length && seedSong.artists[0] && seedSong.artists[0].id != null) {
          seedArtistId = String(seedSong.artists[0].id)
        } else if (seedSong.artistId != null) {
          seedArtistId = String(seedSong.artistId)
        }
      }

      const playMode = (mode) => {
        if (pendingRef.current || suppressRef.current) return
        pendingRef.current = mode.key
        setPending(mode.key)
        const params = { type: mode.key, limit: 50 }
        if (mode.key !== 'daily') {
          if (seedSongId) params.songId = seedSongId
          if (seedArtistId) params.artistId = seedArtistId
        }
        let controller = null
        try {
          if (typeof AbortController === 'function') controller = new AbortController()
        } catch (err) {
          controller = null
        }
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          if (controller) {
            try {
              controller.abort()
            } catch (err) {
              /* ignore */
            }
          }
          const message = t('toast.modeTimeout')
          setModeMeta((prev) => Object.assign({}, prev, {
            [mode.key]: { title: t(mode.title), subtitle: t(mode.desc), error: message, fallbackUsed: '' },
          }))
          if (props.onToast) props.onToast(message)
          pendingRef.current = ''
          setPending('')
        }, 8000)
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          pendingRef.current = ''
          setPending('')
        }
        apiGet('/mode?' + qs(params), controller ? controller.signal : undefined).then((data) => {
          const songs = Array.isArray(data && data.songs) ? data.songs.filter(Boolean) : []
          if (!songs.length) {
            const message = (data && data.error) || t('toast.modeError')
            setModeMeta((prev) => Object.assign({}, prev, {
              [mode.key]: { title: t(mode.title), subtitle: t(mode.desc), error: message, fallbackUsed: '' },
            }))
            if (props.onToast) props.onToast(message)
            finish()
            return
          }
          setModeMeta((prev) => Object.assign({}, prev, {
            [mode.key]: {
              title: (data && data.title) || t(mode.title),
              subtitle: (data && data.subtitle) || t(mode.desc),
              fallbackUsed: (data && data.fallbackUsed) || '',
              error: '',
            },
          }))
          try {
            try {
            player.playQueue(songs, 0, (data && data.title) || t(mode.title))
          } catch (playErr) {
            throw playErr
          }
          } catch (err) {
            const message = (err && err.message) || t('toast.modeError')
            if (props.onToast) props.onToast(message)
          }
          finish()
        }).catch((err) => {
          if (settled) return
          const aborted = !!err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')
          const message = aborted ? t('toast.modeTimeout') : ((err && err.message) || t('toast.modeError'))
          setModeMeta((prev) => Object.assign({}, prev, {
            [mode.key]: { title: t(mode.title), subtitle: t(mode.desc), error: message, fallbackUsed: '' },
          }))
          if (props.onToast) props.onToast(message)
          finish()
        })
      }

      const playAll = () => {
        if (props.loading || !daily.length) return
        player.playQueue(daily, 0, t('section.daily'))
      }

      const onTrackPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return
        dragRef.current = { active: true, startX: event.clientX, dx: 0, moved: false, captured: false }
        setDragging(true)
      }

      const onTrackPointerMove = (event) => {
        const state = dragRef.current
        if (!state.active) return
        const dx = event.clientX - state.startX
        state.dx = dx
        if (Math.abs(dx) > 8 && !state.moved) {
          state.moved = true
          /* 只有确认是拖拽后才捕获指针，避免把纯点击的 click 吞掉 */
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
            state.captured = true
          } catch (err) {
            /* ignore */
          }
        }
        setDragX(dx)
      }

      const suppressNextClick = () => {
        suppressRef.current = true
        if (suppressTimer.current) clearTimeout(suppressTimer.current)
        suppressTimer.current = setTimeout(() => {
          suppressRef.current = false
        }, 60)
      }

      const finishDrag = (event) => {
        const state = dragRef.current
        if (!state.active) return
        state.active = false
        const dx = event && event.clientX !== undefined ? event.clientX - state.startX : state.dx
        if (state.moved && Math.abs(dx) > 40) {
          go(dx < 0 ? 1 : -1)
          suppressNextClick()
        } else if (!state.moved && event && event.clientX !== undefined && typeof document !== 'undefined') {
          /* 兜底：某些浏览器/捕获场景下 click 可能丢失，pointerup 时主动找卡片播放 */
          try {
            const hit = document.elementFromPoint(event.clientX, event.clientY)
            const card = hit && hit.closest ? hit.closest('[data-nm="carousel-card"]') : null
            if (card && !card.classList.contains('is-clone')) {
              const modeKey = card.getAttribute('data-mode')
              const targetMode = HERO_MODES.filter((item) => item.key === modeKey)[0]
              if (targetMode) {
                playMode(targetMode)
                suppressNextClick()
              }
            }
          } catch (err) {
            /* ignore */
          }
        }
        setDragging(false)
        setDragX(0)
      }

      const renderCard = (mode, modeIndex, clone, key) => {
        const meta = modeMeta[mode.key] || {}
        return h('article', {
        key,
        className: cx('nm-carousel-card', clone && 'is-clone'),
        'data-nm': 'carousel-card',
        'data-mode': mode.key,
        'data-clone': clone ? 'true' : undefined,
        'aria-hidden': clone ? 'true' : undefined,
        role: clone ? undefined : 'button',
        tabIndex: clone ? -1 : 0,
        'aria-label': copyLabel(t, mode),
        'aria-busy': pending === mode.key ? 'true' : 'false',
        onClick: () => {
          if (suppressRef.current || pending) return
          playMode(mode)
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (!suppressRef.current) playMode(mode)
          }
        },
      },
      h('div', { className: 'nm-carousel-bg', 'aria-hidden': 'true' }),
      h('div', { className: 'nm-carousel-shade', 'aria-hidden': 'true' }),
      h('div', { className: 'nm-carousel-collage', 'aria-hidden': 'true' },
        h('span', { className: 'nm-carousel-index' }, t('hero.modeOf', { index: modeIndex + 1, total })),
        [0, 1, 2, 3].map((slot) => {
          const src = covers.length ? covers[(modeIndex * 2 + slot) % covers.length] : null
          return h('span', { key: slot, className: 'nm-carousel-cover c' + (slot + 1) },
            src ? h('img', { src, alt: '', loading: modeIndex === realIndex ? 'eager' : 'lazy', draggable: false })
              : h('span', { className: 'nm-carousel-cover-ph' }, h(Icon, { name: 'note', size: 18 })))
        })),
      h('div', { className: 'nm-carousel-copy' },
        h('div', { className: 'nm-carousel-eyebrow' }, t('hero.carouselLabel')),
        h('h2', { className: 'nm-carousel-title' }, meta.title || t(mode.title)),
        h('p', { className: 'nm-carousel-desc' }, meta.error || meta.subtitle || t(mode.desc)),
        meta.fallbackUsed ? h('p', { className: 'nm-carousel-fallback' }, t('hero.fallback', { reason: meta.fallbackUsed })) : null,
        h('button', {
          type: 'button',
          className: 'nm-carousel-cta',
          'data-nm': 'carousel-play',
          'data-mode': mode.key,
          tabIndex: clone ? -1 : 0,
          onClick: (event) => {
            event.stopPropagation()
            if (suppressRef.current) return
            playMode(mode)
          },
        },
        pending === mode.key ? h(Spinner) : h(Icon, { name: 'play', size: 13 }),
        pending === mode.key ? t('state.loading') : (meta.error ? t('hero.retry') : t('hero.play')))))
      }

      const slides = [
        { mode: HERO_MODES[total - 1], modeIndex: total - 1, clone: true, key: 'clone-last' },
      ]
      HERO_MODES.forEach((mode, index) => slides.push({ mode, modeIndex: index, clone: false, key: mode.key }))
      slides.push({ mode: HERO_MODES[0], modeIndex: 0, clone: true, key: 'clone-first' })

      return h('section', { className: 'nm-hero-carousel', 'data-nm': 'hero' },
        h('div', { className: 'nm-carousel-head' },
          h('div', { className: 'nm-carousel-heading-wrap' },
            h('div', { className: 'nm-eyebrow' },
              h('span', { className: 'nm-eyebrow-dot' }),
              t('hero.eyebrow', { date: fmtToday(t('fmt.locale')) })),
            h('h1', { className: 'nm-carousel-heading' }, t('hero.title'))),
          h('button', {
            type: 'button',
            className: 'nm-btn accent',
            'data-nm': 'play-all',
            disabled: !!props.loading || !daily.length,
            onClick: playAll,
            title: t('action.playAll'),
          }, h(Icon, { name: 'play', size: 14 }), t('action.playAll'))),
        h('div', {
          className: 'nm-carousel',
          'data-nm': 'hero-carousel',
          'aria-roledescription': 'carousel',
          'aria-label': t('hero.carouselLabel'),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
        },
        h('div', {
          ref: trackRef,
          className: 'nm-carousel-track',
          'data-pos': String(pos),
          style: {
            transform: 'translate3d(calc(' + (-pos * 100) + '% + ' + dragX + 'px), 0, 0)',
            transition: noTransition || dragging ? 'none' : 'transform 360ms cubic-bezier(.22,.61,.36,1)',
          },
          onPointerDown: onTrackPointerDown,
          onPointerMove: onTrackPointerMove,
          onPointerUp: finishDrag,
          onPointerCancel: finishDrag,
          onTransitionEnd: onTrackTransitionEnd,
        },
        slides.map((slide) => renderCard(slide.mode, slide.modeIndex, slide.clone, slide.key))),
        h('button', {
          type: 'button',
          className: 'nm-carousel-arrow is-prev',
          'data-nm': 'carousel-prev',
          'aria-label': t('hero.prev'),
          title: t('hero.prev'),
          onClick: () => go(-1),
        }, h(Icon, { name: 'back', size: 17 })),
        h('button', {
          type: 'button',
          className: 'nm-carousel-arrow is-next',
          'data-nm': 'carousel-next',
          'aria-label': t('hero.next'),
          title: t('hero.next'),
          onClick: () => go(1),
        }, h(Icon, { name: 'right', size: 17 })),
        h('div', { className: 'nm-carousel-dots', role: 'tablist', 'aria-label': t('hero.carouselLabel') },
          HERO_MODES.map((mode, dotIndex) => h('button', {
            key: mode.key,
            type: 'button',
            role: 'tab',
            'aria-selected': dotIndex === realIndex ? 'true' : 'false',
            className: cx('nm-carousel-dot', dotIndex === realIndex && 'is-active'),
            'data-nm': 'carousel-dot',
            'data-index': dotIndex,
            'aria-label': t(mode.title),
            onClick: () => jumpTo(dotIndex),
          })))))
    }

    function copyLabel(t, mode) {
      return t(mode.title) + ' · ' + t('hero.play')
    }

    function LoginBanner(props) {
      const t = props.t
      return h('div', { className: 'nm-login-banner' },
        h('span', { className: 'nm-login-banner-icon' }, h(Icon, { name: 'qr', size: 20 })),
        h('div', { className: 'nm-login-banner-text' },
          h('div', { className: 'nm-login-banner-title' }, t('login.title')),
          h('div', { className: 'nm-login-banner-desc' }, t('state.unauthDesc'))),
        h('button', {
          type: 'button',
          className: 'nm-btn accent',
          'data-nm': 'login-open',
          onClick: props.onLogin,
        }, t('action.loginNow')))
    }

    function Account(props) {
      const t = props.t
      const data = props.status && props.status.data
      if (data && data.authed) {
        const vip = data.vipType && Number(data.vipType) > 0
        return h('div', { className: 'nm-account' },
          h('span', { className: 'nm-account-profile', title: data.nickname || '' },
            httpsUrl(data.avatar)
              ? h('img', { className: 'nm-avatar', src: httpsUrl(data.avatar), alt: '' })
              : h('span', { className: 'nm-avatar nm-avatar-fb' }, initialOf(data.nickname)),
            h('span', { className: 'nm-account-name' }, data.nickname || t('action.login')),
            vip ? h('span', { className: 'nm-badge vip' }, t('vip')) : null),
          h('button', {
            type: 'button',
            className: 'nm-icon-btn',
            title: t('action.logout'),
            'aria-label': t('action.logout'),
            onClick: props.onLogout,
          }, h(Icon, { name: 'logout', size: 15 })))
      }
      return h('button', {
        type: 'button',
        className: 'nm-btn login',
        'data-nm': 'login-open',
        title: t('action.login'),
        onClick: props.onLogin,
      }, h(Icon, { name: 'qr', size: 15 }), h('span', { className: 'nm-btn-label' }, t('action.login')))
    }

    function Header(props) {
      const t = props.t
      const status = props.status || {}
      let sub = t('app.tagline')
      if (status.error) sub = t('status.offline')
      else if (status.data && status.data.bridge === 'starting') sub = t('status.starting')
      return h('div', { className: 'nm-header' },
        h('div', { className: 'nm-header-row' },
          h('div', { className: 'nm-brand' },
            h('span', { className: 'nm-logo' },
              h('img', {
                'data-nm': 'np-logo',
                src: ICON_DATA,
                alt: '',
                'aria-hidden': 'true',
                draggable: false,
              })),
            h('div', { className: 'nm-brand-text' },
              h('div', { className: 'nm-brand-title' }, t('app.title')),
              h('div', { className: 'nm-brand-sub' }, sub))),
          h('div', { className: 'nm-header-tools' },
            h('label', { className: 'nm-search' },
              h(Icon, { name: 'search', size: 15 }),
              h('input', {
                className: 'nm-search-input',
                type: 'search',
                value: props.query,
                placeholder: t('search.placeholder'),
                'aria-label': t('search.placeholder'),
                'data-nm': 'search-input',
                spellCheck: false,
                onChange: (event) => props.onQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') props.onQuery('')
                  if (event.key === 'Enter') props.onSearch && props.onSearch()
                },
              }),
              props.query
                ? h('button', {
                  type: 'button',
                  className: 'nm-search-clear',
                  title: t('action.close'),
                  'aria-label': t('action.close'),
                  onClick: () => props.onQuery(''),
                }, h(Icon, { name: 'close', size: 12 }))
                : null),
            h('button', {
              type: 'button',
              className: 'nm-icon-btn nm-refresh',
              title: t('action.refresh'),
              'aria-label': t('action.refresh'),
              onClick: props.onRefresh,
            }, h(Icon, { name: 'refresh', size: 16, className: props.refreshing ? 'is-spin' : '' })),
            h(Account, {
              t,
              status: props.status,
              onLogin: props.onLogin,
              onLogout: props.onLogout,
            })))) 
    }

    const TAB_DEFS = [
      ['recommend', 'tab.recommend'],
      ['playlists', 'tab.playlists'],
      ['artists', 'tab.artists'],
      ['search', 'tab.search'],
    ]

    function Tabs(props) {
      const t = props.t
      return h('div', { className: 'nm-tabs', 'data-nm': 'tabs', role: 'tablist' },
        TAB_DEFS.map((def) => h('button', {
          key: def[0],
          type: 'button',
          role: 'tab',
          'aria-selected': props.tab === def[0] ? 'true' : 'false',
          'data-nm': 'tab',
          'data-tab': def[0],
          className: cx('nm-tab', props.tab === def[0] && 'is-active'),
          onClick: () => props.onChange(def[0]),
        }, t(def[1]))))
    }

    /* ------------------------------------------------------------------ *
     * 扫码登录 Modal
     * ------------------------------------------------------------------ */
    function SkeletonQr() {
      return h('div', { 'data-nm': 'skeleton', className: 'nm-qr-skel' },
        h('div', { className: 'nm-skel', style: { width: '100%', height: '100%', borderRadius: 14 } }),
        h('div', { className: 'nm-qr-skel-ring' }, h(Spinner)))
    }

    function LoginModal(props) {
      const t = props.t
      const closeRef = React.useRef(null)
      const onCloseRef = React.useRef(props.onClose)
      onCloseRef.current = props.onClose
      const onAuthedRef = React.useRef(props.onAuthed)
      onAuthedRef.current = props.onAuthed
      const [qr, setQr] = React.useState({ loading: true, error: null, qr: null, key: null })
      const [login, setLogin] = React.useState({ state: 'waiting' })
      const [nonce, setNonce] = React.useState(0)
      const [session, setSession] = React.useState(0)

      useAutoFocus(closeRef, true)

      React.useEffect(() => {
        let alive = true
        const controller = new AbortController()
        setQr({ loading: true, error: null, qr: null, key: null })
        setLogin({ state: 'waiting' })
        apiPost('/login/start', {}, controller.signal).then((data) => {
          if (!alive) return
          setQr({
            loading: false,
            error: null,
            qr: (data && data.qr) || null,
            key: (data && data.key) || null,
          })
          setSession((value) => value + 1)
        }).catch((err) => {
          if (!alive || isAbort(err)) return
          setQr({ loading: false, error: (err && err.message) || t('login.loadErr'), qr: null, key: null })
        })
        return () => {
          alive = false
          controller.abort()
        }
      }, [nonce])

      React.useEffect(() => {
        if (!qr.key) return undefined
        let alive = true
        let timer = null
        let closeTimer = null
        let first = true
        const poll = () => {
          const delay = first ? 800 : 2000
          first = false
          timer = setTimeout(() => {
            if (!alive) return
            apiGet('/login/check?' + qs({ key: qr.key })).then((data) => {
              if (!alive) return
              const next = data || { state: 'waiting' }
              setLogin(next)
              if (next.state === 'ok') {
                if (typeof onAuthedRef.current === 'function') onAuthedRef.current(next)
                closeTimer = setTimeout(() => {
                  if (typeof onCloseRef.current === 'function') onCloseRef.current()
                }, 2200)
                return
              }
              if (next.state === 'expired' || next.state === 'error') return
              poll()
            }).catch((err) => {
              if (!alive) return
              setLogin({ state: 'error', message: (err && err.message) || t('login.error') })
            })
          }, delay)
        }
        poll()
        return () => {
          alive = false
          if (timer) clearTimeout(timer)
          if (closeTimer) clearTimeout(closeTimer)
        }
      }, [qr.key, session])

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            if (typeof onCloseRef.current === 'function') onCloseRef.current()
          }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])

      const rawState = login.state
      const stateName = ['waiting', 'scanned', 'ok', 'expired'].indexOf(rawState) >= 0 ? rawState : 'expired'
      let stateText = t('login.waiting')
      if (stateName === 'scanned') stateText = t('login.scanned')
      else if (stateName === 'ok') stateText = t('login.ok')
      else if (stateName === 'expired') stateText = rawState === 'error' ? t('login.error') : t('login.expired')

      let qrNode
      if (qr.loading) {
        qrNode = h(SkeletonQr)
      } else if (qr.error) {
        qrNode = h('div', { className: 'nm-qr-error' },
          h('p', null, qr.error),
          h('button', { type: 'button', className: 'nm-btn sm', onClick: () => setNonce((n) => n + 1) }, t('login.retry')))
      } else {
        qrNode = h('div', { className: 'nm-qr-frame' },
          qr.qr ? h('img', { 'data-nm': 'qr', src: qr.qr, alt: t('login.title'), draggable: false }) : null,
          stateName === 'ok' ? h('div', { className: 'nm-qr-veil ok' }, h(Icon, { name: 'check', size: 30 })) : null,
          rawState === 'error' ? h('div', { className: 'nm-qr-veil' }, h(Icon, { name: 'alert', size: 26 })) : null,
          stateName === 'expired' ? h('div', { className: 'nm-qr-veil expired' },
            h('button', {
              type: 'button',
              className: 'nm-btn sm',
              onClick: () => setNonce((n) => n + 1),
            }, h(Icon, { name: 'refresh', size: 14 }), t('action.reloadQr'))) : null)
      }

      return h('div', {
        className: 'nm-modal-root',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) props.onClose()
        },
      },
      h('div', {
        className: 'nm-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('login.title'),
        'data-nm': 'login-modal',
      },
      h('button', {
        ref: closeRef,
        type: 'button',
        className: 'nm-icon-btn nm-modal-close',
        title: t('action.close'),
        'aria-label': t('action.close'),
        onClick: props.onClose,
      }, h(Icon, { name: 'close', size: 16 })),
      h('div', { className: 'nm-modal-head' },
        h('div', { className: 'nm-modal-eyebrow' }, h(Icon, { name: 'note', size: 12 }), 'NETEASE CLOUD MUSIC'),
        h('h2', { className: 'nm-modal-title' }, t('login.title')),
        h('p', { className: 'nm-modal-desc' }, t('login.desc'))),
      h('div', { className: 'nm-qr-wrap' }, qrNode),
      h('div', {
        className: 'nm-login-state ' + stateName,
        'data-nm': 'login-state',
        'data-state': stateName,
        role: 'status',
      },
      h('span', { className: 'nm-login-dot' }),
      h('span', { className: 'nm-login-state-text' }, stateText),
      stateName === 'ok' && login.nickname ? h('span', { className: 'nm-login-user' }, login.nickname) : null),
      h('p', { className: 'nm-modal-tip' }, t('login.tip')),
      h('p', { className: 'nm-modal-secure' }, t('login.secure'))))
    }

    /* ------------------------------------------------------------------ *
     * 搜索结果
     * ------------------------------------------------------------------ */
    const SEARCH_TYPES = [
      ['song', 'search.type.song'],
      ['playlist', 'search.type.playlist'],
      ['artist', 'search.type.artist'],
      ['album', 'search.type.album'],
    ]

    function SearchView(props) {
      const t = props.t
      const query = props.query
      const type = props.type
      const resource = props.resource
      const items = toArray(resource.data && resource.data.items)
      const hasQuery = !!String(query || '').trim()
      let body = null
      if (!hasQuery) {
        body = h('div', { className: 'nm-state empty', 'data-nm': 'empty' },
          h('span', { className: 'nm-state-icon' }, h(Icon, { name: 'search', size: 20 })),
          h('span', { className: 'nm-state-msg' }, t('search.prompt')),
          h('span', { className: 'nm-state-hint' }, t('search.promptHint')))
      } else if (resource.loading) {
        body = type === 'song' ? h(TracksSkeleton, { rows: 6 }) : h(SkeletonCards, { count: 6, kind: type === 'artist' ? 'artist' : null })
      } else if (resource.error) {
        body = h(StateBox, {
          kind: 'error',
          message: resource.error,
          action: t('action.retry'),
          onAction: resource.reload,
        })
      } else if (!items.length) {
        body = h(StateBox, { message: t('search.empty', { q: query }) })
      } else if (type === 'song') {
        body = h(TrackList, {
          t,
          tracks: items,
          contextTitle: t('search.type.song') + ' · ' + query,
          onOpenArtist: props.onOpenArtist,
        })
      } else {
        body = h(CardGrid, {
          t,
          items,
          kind: type,
          onOpen: props.onOpen,
          onPlay: props.onPlay,
        })
      }
      return h('div', { className: 'nm-search-view', 'data-nm': 'search-results' },
        h('div', { className: 'nm-pill-tabs' },
          SEARCH_TYPES.map((def) => h('button', {
            key: def[0],
            type: 'button',
            className: cx('nm-pill-tab', type === def[0] && 'is-active'),
            'data-nm': 'search-type',
            'data-type': def[0],
            'aria-pressed': type === def[0] ? 'true' : 'false',
            onClick: () => props.onType(def[0]),
          }, t(def[1])))),
        h('div', { className: 'nm-search-body' }, body))
    }

    /* ------------------------------------------------------------------ *
     * 歌单 / 专辑 / 歌手详情
     * ------------------------------------------------------------------ */
    function DetailView(props) {
      const t = props.t
      const item = props.item || {}
      const kind = item.kind || 'playlist'
      const meta = item.meta || {}
      const resource = useResource((signal) => loadDetail(kind, item.id, signal), kind + ':' + item.id)
      const data = resource.data || {}
      const songs = toArray(data.songs)
      const albums = toArray(data.albums)
      const detail = kind === 'playlist' ? (data.playlist || {}) : kind === 'album' ? (data.album || {}) : (data.artist || {})
      const title = detail.name || meta.name || t('state.unknown')
      const description = kind === 'artist' ? detail.description : detail.description
      const cover = kind === 'artist' ? (detail.avatar || meta.avatar) : (detail.cover || meta.cover)
      const kindLabel = kind === 'playlist' ? t('kind.playlist') : kind === 'album' ? t('kind.album') : t('kind.artist')

      const metaParts = []
      if (kind === 'playlist') {
        metaParts.push(t('kind.playlist'))
        if (detail.creator || meta.creator) metaParts.push(detail.creator || meta.creator)
        const count = detail.trackCount || meta.trackCount || songs.length
        if (count) metaParts.push(t('meta.tracks', { n: fmtCount(count, t) }))
        if (detail.playCount || meta.playCount) metaParts.push(t('meta.plays', { n: fmtCount(detail.playCount || meta.playCount, t) }))
      } else if (kind === 'album') {
        metaParts.push(t('kind.album'))
        if (detail.artist || meta.artist) metaParts.push(detail.artist || meta.artist)
        if (detail.publishDate) metaParts.push(detail.publishDate)
        const count = detail.trackCount || meta.trackCount || songs.length
        if (count) metaParts.push(t('meta.tracks', { n: fmtCount(count, t) }))
      } else {
        metaParts.push(t('kind.artist'))
        const rawAlias = detail.alias !== undefined && detail.alias !== null ? detail.alias : meta.alias
        const alias = Array.isArray(rawAlias) ? rawAlias : isString(rawAlias) ? [rawAlias] : []
        if (alias.length) metaParts.push(alias.filter(Boolean).join(' / '))
        if (detail.songCount) metaParts.push(t('meta.songs', { n: fmtCount(detail.songCount, t) }))
        if (detail.albumCount) metaParts.push(t('meta.albums', { n: fmtCount(detail.albumCount, t) }))
      }

      const playAll = () => {
        if (songs.length) player.playQueue(songs, 0, title)
      }

      let content
      if (resource.loading && !resource.data) {
        content = h(DetailSkeleton)
      } else if (resource.error) {
        content = h(StateBox, {
          kind: 'error',
          message: resource.error,
          action: t('action.retry'),
          onAction: resource.reload,
        })
      } else {
        content = h(React.Fragment, null,
          h('div', { className: 'nm-detail-row' },
            h('div', { className: 'nm-detail-art' },
              h(Cover, { src: cover, name: title, rounded: kind === 'artist', eager: true })),
            h('div', { className: 'nm-detail-info' },
              h('div', { className: 'nm-eyebrow' }, h('span', { className: 'nm-eyebrow-dot' }), kindLabel),
              h('h1', { className: 'nm-detail-title' }, title),
              h('div', { className: 'nm-detail-meta' },
                metaParts.map((part, index) => h('span', { key: index, className: 'nm-detail-meta-item' }, part))),
              description ? h('p', { className: 'nm-detail-desc' }, String(description).replace(/\s+/g, ' ')) : null,
              h('div', { className: 'nm-detail-actions' },
                h('button', {
                  type: 'button',
                  className: 'nm-btn accent lg',
                  disabled: !songs.length,
                  onClick: playAll,
                }, h(Icon, { name: 'play', size: 16 }), t('action.playAll'))))),
          kind === 'artist'
            ? h(React.Fragment, null,
              h('div', { className: 'nm-section' },
                h(SectionHead, { title: t('section.hotSongs'), sub: songs.length ? t('meta.loaded', { n: songs.length }) : '' }),
                h(TrackList, {
                  t,
                  tracks: songs,
                  contextTitle: title,
                  onOpenArtist: props.onOpenArtist,
                })),
              h('div', { className: 'nm-section' },
                h(SectionHead, { title: t('section.albums'), sub: t('meta.albums', { n: albums.length }) }),
                albums.length
                  ? h(CardGrid, {
                    t,
                    items: albums,
                    kind: 'album',
                    onOpen: props.onOpen,
                    onPlay: props.onPlay,
                  })
                  : h(StateBox, { message: t('state.noAlbums') })))
            : h('div', { className: 'nm-section' },
              h(SectionHead, { title: t('section.hotSongs'), sub: songs.length ? t('meta.loaded', { n: songs.length }) : '' }),
              h(TrackList, {
                t,
                tracks: songs,
                contextTitle: title,
                onOpenArtist: props.onOpenArtist,
              })))
      }

      return h('div', { className: 'nm-detail', 'data-nm': 'detail' },
        h('div', { className: 'nm-detail-top' },
          h('button', {
            type: 'button',
            className: 'nm-back',
            'data-nm': 'back',
            onClick: props.onBack,
          }, h(Icon, { name: 'back', size: 15 }), t('action.back'))),
        content)
    }

    /* ------------------------------------------------------------------ *
     * 播放器：进度条 / 队列 / 底部常驻播放条
     * ------------------------------------------------------------------ */
    function Slider(props) {
      const [drag, setDrag] = React.useState(null)
      const dragRef = React.useRef(null)
      const lastRatioRef = React.useRef(0)
      const lastCommitRef = React.useRef(0)
      const railRef = React.useRef(null)
      const onCommitRef = React.useRef(props.onCommit)
      onCommitRef.current = props.onCommit
      const disabledRef = React.useRef(props.disabled)
      disabledRef.current = props.disabled
      const holdSeekRef = React.useRef(!!props.holdSeek)
      holdSeekRef.current = !!props.holdSeek
      const value = clamp(props.value === undefined ? 0 : props.value, 0, 1)
      const shown = drag === null ? value : drag

      const ratioFrom = (event) => {
        const node = railRef.current
        if (!node) return lastRatioRef.current
        const rect = node.getBoundingClientRect()
        if (!rect || !rect.width) return lastRatioRef.current
        return clamp((event.clientX - rect.left) / rect.width, 0, 1)
      }

      const commit = (ratio) => {
        if (disabledRef.current) return
        if (typeof onCommitRef.current === 'function') onCommitRef.current(clamp(ratio, 0, 1))
      }

      /* 全局 pointerup 兜底：指针移出进度条/在窗口外松开时也要提交 */
      useSeekPointerGuard(() => {
        if (dragRef.current === null) return
        const ratio = lastRatioRef.current
        dragRef.current = null
        setDrag(null)
        if (holdSeekRef.current) player.endSeekHold()
        if (disabledRef.current) return
        if (typeof onCommitRef.current === 'function') onCommitRef.current(ratio)
      })

      /* 组件在拖动中被卸载（例如关闭播放页）时释放 seeking 状态 */
      React.useEffect(() => () => {
        if (dragRef.current !== null && holdSeekRef.current) player.endSeekHold()
        dragRef.current = null
      }, [])

      const onPointerDown = (event) => {
        if (props.disabled) return
        if (event.button !== undefined && event.button !== 0) return
        event.preventDefault()
        const node = railRef.current
        if (node && node.setPointerCapture) {
          try {
            node.setPointerCapture(event.pointerId)
          } catch (err) {
            /* ignore */
          }
        }
        const ratio = ratioFrom(event)
        dragRef.current = ratio
        lastRatioRef.current = ratio
        lastCommitRef.current = Date.now()
        setDrag(ratio)
        if (props.holdSeek) player.beginSeekHold()
        /* 按下立即 seek：点进度条任意位置立刻跳过去 */
        commit(ratio)
      }

      const onPointerMove = (event) => {
        if (dragRef.current === null || props.disabled) return
        const ratio = ratioFrom(event)
        lastRatioRef.current = ratio
        setDrag(ratio)
        const now = Date.now()
        /* 拖动中 120ms 节流提交，避免每帧都 seek */
        if (now - lastCommitRef.current >= 120) {
          lastCommitRef.current = now
          commit(ratio)
        }
      }

      const onPointerUp = (event) => {
        if (dragRef.current === null) return
        const ratio = ratioFrom(event)
        dragRef.current = null
        setDrag(null)
        if (props.holdSeek) player.endSeekHold()
        commit(ratio)
      }

      const onKeyDown = (event) => {
        if (props.disabled) return
        let next = null
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = clamp(shown + (props.step || 0.025), 0, 1)
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clamp(shown - (props.step || 0.025), 0, 1)
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = 1
        if (next === null) return
        event.preventDefault()
        commit(next)
      }

      return h('div', {
        className: cx('nm-slider', props.className, drag !== null && 'is-dragging'),
        role: 'slider',
        tabIndex: props.disabled ? -1 : 0,
        'aria-label': props.label || '',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(shown * 100),
        'aria-valuetext': props.valueText,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: () => {
          if (dragRef.current !== null && props.holdSeek) player.endSeekHold()
          dragRef.current = null
          setDrag(null)
        },
        onKeyDown,
      },
      h('div', { className: 'nm-slider-rail', ref: railRef },
        h('div', { className: 'nm-slider-fill', style: { width: (shown * 100) + '%' } }),
        h('div', { className: 'nm-slider-thumb', style: { left: (shown * 100) + '%' } })))
    }

    function PlayerProgress(props) {
      const t = props.t
      const duration = props.duration || 0
      const position = duration ? Math.min(props.position || 0, duration) : props.position || 0
      return h('div', {
        className: 'nm-progress-wrap',
        'data-nm': 'player-progress',
        'data-seeking': props.seeking ? 'true' : 'false',
      },
        h('span', { className: 'nm-progress-time' }, fmtTime(position)),
        h(Slider, {
          value: duration ? position / duration : 0,
          label: t('player.progress'),
          valueText: fmtTime(position) + ' / ' + fmtTime(duration),
          holdSeek: true,
          onCommit: (ratio) => player.seekRatio(ratio),
        }),
        h('span', { className: 'nm-progress-time is-right' }, fmtTime(duration)))
    }

    function QueuePanel(props) {
      const t = props.t
      const snapshot = usePlayerState()
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') player.setQueueOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])
      return h('div', {
        className: 'nm-queue',
        'data-nm': 'player-queue',
        role: 'dialog',
        'aria-label': t('player.queue'),
      },
      h('div', { className: 'nm-queue-head' },
        h('div', { className: 'nm-queue-title' },
          t('player.queue'),
          h('span', { className: 'nm-queue-count' }, t('player.queueCount', { n: snapshot.queue.length }))),
        h('button', {
          type: 'button',
          className: 'nm-icon-btn',
          title: t('action.close'),
          'aria-label': t('action.close'),
          onClick: () => player.setQueueOpen(false),
        }, h(Icon, { name: 'close', size: 14 }))),
      snapshot.queue.length
        ? h('div', { className: 'nm-queue-list' },
          snapshot.queue.map((track, index) => h('button', {
            key: String(track.id) + '-' + index,
            type: 'button',
            className: cx('nm-queue-row', index === snapshot.index && 'is-active'),
            onClick: () => player.jump(index),
          },
          h('span', { className: 'nm-queue-idx' },
            index === snapshot.index
              ? h(Equalizer, { playing: snapshot.playing && index === snapshot.index })
              : String(index + 1)),
          h(Cover, { src: track.cover, name: track.name }),
          h('span', { className: 'nm-queue-text' },
            h('span', { className: 'nm-queue-name' }, track.name),
            h('span', { className: 'nm-queue-artist' }, trackArtists(track))),
          h('span', { className: 'nm-queue-dur' }, fmtTime(track.duration)))))
        : h('div', { className: 'nm-queue-empty' }, t('player.queueEmpty')))
    }

    function QualityMenu(props) {
      const t = props.t
      const snapshot = usePlayerState()
      const auth = props.auth || authInfo
      const current = snapshot.quality || 'auto'
      const pick = (level) => {
        player.setQuality(level)
        if (typeof props.onClose === 'function') props.onClose()
      }
      return h('div', {
        className: cx('nm-quality-menu', props.className),
        'data-nm': 'quality-menu',
        role: 'menu',
        'aria-label': t('quality.title'),
      },
      h('div', { className: 'nm-quality-head' },
        h('div', { className: 'nm-quality-title' }, t('quality.title')),
        h('div', { className: 'nm-quality-actual' }, t('quality.actual') + ' · ' + qualityActualText(snapshot, t))),
      QUALITY_LEVELS.map((def) => {
        let tag = null
        if (def.member) tag = !auth.authed ? t('quality.needLogin') : auth.vip ? null : t('quality.needVip')
        return h('button', {
          key: def.key,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': current === def.key ? 'true' : 'false',
          'data-nm': 'quality-option',
          'data-level': def.key,
          className: cx('nm-quality-option', current === def.key && 'is-active'),
          onClick: () => pick(def.key),
        },
        h('span', { className: 'nm-quality-labels' },
          h('span', { className: 'nm-quality-name' }, t(def.label)),
          h('span', { className: 'nm-quality-sub' }, t(def.sub))),
        tag ? h('span', { className: 'nm-quality-tag' }, tag) : null,
        current === def.key ? h(Icon, { name: 'check', size: 13 }) : null)
      }))
    }

    function PlayerDock() {
      const t = useT()
      const snapshot = usePlayerState()
      const auth = useAuthInfo()
      const [collapsed, setCollapsed] = React.useState(false)
      const [qualityOpen, setQualityOpen] = React.useState(false)
      const qualityAnchorRef = React.useRef(null)

      React.useEffect(() => {
        if (!qualityOpen) return undefined
        const onDown = (event) => {
          const node = qualityAnchorRef.current
          if (node && !node.contains(event.target)) setQualityOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [qualityOpen])

      React.useEffect(() => {
        if (!qualityOpen) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setQualityOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [qualityOpen])

      if (!snapshot.current) return null
      const track = snapshot.current
      const duration = snapshot.duration || Number(track.duration) || 0
      const playing = snapshot.playing
      const toastKey = snapshot.toast
      const toggleLabel = playing ? t('action.pause') : t('action.play')
      const qualityShort = snapshot.actualBr
        ? fmtBitrate(snapshot.actualBr)
        : qualityLabel(snapshot.quality || 'auto', t)

      return h('div', {
        className: cx('nm-dock-root', 'is-inline', snapshot.queueOpen && 'queue-open'),
        'data-nm': 'player-state',
        'data-playing': playing ? 'true' : 'false',
        'data-dock': 'panel',
      },
      snapshot.queueOpen ? h(QueuePanel, { t }) : null,
      toastKey ? h('div', { className: 'nm-dock-toast', role: 'status' }, t('toast.' + toastKey)) : null,
      h('div', {
        className: 'nm-dock is-inline',
        'data-nm': 'dock',
        'data-dock': 'panel',
      },
      h('div', { className: 'nm-dock-inner', 'data-nm': 'player' },
        h('button', {
          type: 'button',
          className: 'nm-dock-info',
          'data-nm': 'dock-cover',
          title: t('np.open'),
          'aria-label': t('np.open'),
          onClick: enterNowPlayingFromDock,
        },
        h('span', { className: cx('nm-dock-cover', playing && 'is-playing') },
          h(Cover, { src: track.cover, name: track.name, eager: true })),
        h('span', { className: 'nm-dock-text' },
          h('span', { className: 'nm-dock-name', title: track.name }, track.name),
          h('span', { className: cx('nm-dock-artist', snapshot.error && 'is-error') },
            snapshot.error ? t('player.error') : trackArtists(track) || t('player.nowPlaying')))),
        h(LikeButton, {
          id: track.id,
          nm: 'dock-like',
          size: 14,
          className: 'nm-dock-like',
          label: track.name,
        }),
        collapsed
          ? null
          : h('div', { className: 'nm-dock-center' },
            h('div', { className: 'nm-dock-controls' },
              h('button', {
                type: 'button',
                className: 'nm-icon-btn',
                title: t('action.prev'),
                'aria-label': t('action.prev'),
                'data-nm': 'player-prev',
                onClick: () => player.prev(),
              }, h(Icon, { name: 'prev', size: 16 })),
              h('button', {
                type: 'button',
                className: cx('nm-dock-play', snapshot.loading && 'is-loading'),
                title: toggleLabel,
                'aria-label': toggleLabel,
                'aria-pressed': playing ? 'true' : 'false',
                'data-nm': 'player-toggle',
                onClick: () => player.toggle(),
              }, snapshot.loading && !playing ? h(Spinner) : h(Icon, { name: playing ? 'pause' : 'play', size: 17 })),
              h('button', {
                type: 'button',
                className: 'nm-icon-btn',
                title: t('action.next'),
                'aria-label': t('action.next'),
                'data-nm': 'player-next',
                onClick: () => player.next(false),
              }, h(Icon, { name: 'next', size: 16 }))),
            snapshot.error
              ? h('div', { className: 'nm-dock-error', role: 'alert' },
                h('span', { className: 'nm-dock-error-text' }, t('player.error')),
                h('button', { type: 'button', className: 'nm-link-btn', onClick: () => player.retryCurrent() }, t('player.retry')),
                h('button', { type: 'button', className: 'nm-link-btn', onClick: () => player.next(false) }, t('player.skip')))
              : h(PlayerProgress, { t, position: snapshot.position, duration, seeking: snapshot.seeking })),
        h('div', { className: 'nm-dock-right' },
          collapsed
            ? null
            : h('div', { className: 'nm-dock-volume' },
              h('button', {
                type: 'button',
                className: 'nm-icon-btn',
                title: snapshot.muted ? t('action.unmute') : t('action.mute'),
                'aria-label': snapshot.muted ? t('action.unmute') : t('action.mute'),
                onClick: () => player.toggleMute(),
              }, h(Icon, { name: snapshot.muted ? 'mute' : 'volume', size: 15 })),
              h(Slider, {
                value: snapshot.muted ? 0 : snapshot.volume,
                step: 0.05,
                label: t('action.volume'),
                className: 'nm-volume-slider',
                onCommit: (ratio) => player.setVolume(ratio),
              })),
          h('div', { className: 'nm-dock-quality-anchor', ref: qualityAnchorRef },
            h('button', {
              type: 'button',
              className: cx('nm-dock-quality-btn', qualityOpen && 'is-on'),
              title: t('quality.label') + ' · ' + qualityActualText(snapshot, t),
              'aria-label': t('quality.label'),
              'data-nm': 'dock-quality',
              onClick: () => setQualityOpen((value) => !value),
            },
            h(Icon, { name: 'disc', size: 13 }),
            h('span', { className: 'nm-dock-quality-text' }, snapshot.trial ? t('quality.trial') : qualityShort)),
            qualityOpen ? h(QualityMenu, { t, auth, className: 'is-dock', onClose: () => setQualityOpen(false) }) : null),
          h('button', {
            type: 'button',
            className: cx('nm-icon-btn nm-dock-queue-btn', snapshot.queueOpen && 'is-on'),
            title: t('action.queue'),
            'aria-label': t('action.queue'),
            'data-nm': 'player-queue-toggle',
            onClick: () => player.toggleQueue(),
          },
          h(Icon, { name: 'queue', size: 16 }),
          snapshot.queue.length ? h('span', { className: 'nm-dock-queue-count' }, snapshot.queue.length > 99 ? '99+' : snapshot.queue.length) : null),
          h('button', {
            type: 'button',
            className: 'nm-icon-btn nm-dock-np-btn',
            title: t('player.openNowPlaying'),
            'aria-label': t('player.openNowPlaying'),
            'data-nm': 'dock-expand',
            onClick: enterNowPlayingFromDock,
          }, h(Icon, { name: 'expand', size: 14 })),
          null))))
    }

    /* ------------------------------------------------------------------ *
     * 全屏播放页（黑胶 / 歌词）
     * ------------------------------------------------------------------ */
    function Vinyl(props) {
      return h('div', { className: 'nm-vinyl-wrap' },
        h('div', {
          'data-nm': 'np-vinyl',
          className: cx('nm-vinyl', props.playing && 'is-spinning'),
        },
        h('div', { className: 'nm-vinyl-disc' },
          h('div', { className: 'nm-vinyl-grooves' }),
          h('div', { className: 'nm-vinyl-label' },
            h(Cover, { src: props.track.cover, name: props.track.name, eager: true })),
          h('span', { className: 'nm-vinyl-hole' }))),
        h('div', { className: cx('nm-tonearm', props.playing && 'is-on') },
          h('span', { className: 'nm-tonearm-base' }),
          h('span', { className: 'nm-tonearm-arm' }),
          h('span', { className: 'nm-tonearm-head' })))
    }

    function NowPlaying(props) {
      const t = props.t
      const snapshot = usePlayerState()
      const mode = useNpMode()
      const auth = useAuthInfo()
      const [qualityOpen, setQualityOpen] = React.useState(false)
      const qualityAnchorRef = React.useRef(null)
      const scrollRef = React.useRef(null)
      const lineRefs = React.useRef([])
      const backRef = React.useRef(null)
      const track = snapshot.current
      const trackId = track ? String(track.id) : ''
      const lyricsResource = useResource(
        (signal) => apiGet('/lyrics?' + qs({ id: trackId }), signal),
        'lyrics:' + trackId,
        !!trackId
      )
      const parsed = React.useMemo(() => parseLyrics(lyricsResource.data), [lyricsResource.data])
      const lines = parsed.lines
      const position = snapshot.position || 0
      const activeIndex = React.useMemo(() => {
        if (!lines.length) return -1
        const seconds = position / 1000
        let index = 0
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i].time <= seconds + 0.12) index = i
          else break
        }
        return index
      }, [lines, position])

      useAutoFocus(backRef, true)

      React.useEffect(() => {
        if (!track) closeNowPlaying()
      }, [track])

      const qualityOpenRef = React.useRef(qualityOpen)
      qualityOpenRef.current = qualityOpen
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          if (qualityOpenRef.current) {
            setQualityOpen(false)
            return
          }
          if (player.getState().queueOpen) {
            player.setQueueOpen(false)
            return
          }
          closeNowPlaying()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])

      React.useEffect(() => {
        if (!qualityOpen) return undefined
        const onDown = (event) => {
          const node = qualityAnchorRef.current
          if (node && !node.contains(event.target)) setQualityOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [qualityOpen])

      React.useEffect(() => {
        const box = scrollRef.current
        const node = lineRefs.current[activeIndex]
        if (!box || !node) return
        let behavior = 'smooth'
        try {
          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) behavior = 'auto'
        } catch (err) {
          behavior = 'auto'
        }
        try {
          const top = node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2
          box.scrollTo({ top: Math.max(0, top), behavior })
        } catch (err) {
          box.scrollTop = Math.max(0, node.offsetTop - box.clientHeight / 2)
        }
      }, [activeIndex, mode, lines.length])

      if (!track) return null

      const duration = snapshot.duration || Number(track.duration) || 0
      const playing = snapshot.playing
      const cover = httpsUrl(track.cover)
      const toggleLabel = playing ? t('action.pause') : t('action.play')
      const qualityText = qualityActualText(snapshot, t)
      lineRefs.current = []

      const lyricsBody = (() => {
        if (lyricsResource.loading && !lines.length) {
          return h('div', { className: 'nm-np-lyrics-note' }, h(Spinner), h('span', null, t('np.lyricsLoading')))
        }
        if (lyricsResource.error && !lines.length) {
          return h('div', { className: 'nm-np-lyrics-note' },
            h(Icon, { name: 'alert', size: 20 }),
            h('span', null, t('np.lyricsError')),
            h('button', { type: 'button', className: 'nm-link-btn', onClick: lyricsResource.reload }, t('np.retry')))
        }
        if (!lines.length) {
          return h('div', { className: 'nm-np-lyrics-note' },
            h(Icon, { name: 'note', size: 24 }),
            h('span', { className: 'nm-np-lyrics-note-title' }, t('np.instrumental')),
            h('span', { className: 'nm-np-lyrics-note-sub' }, t('np.noLyrics')))
        }
        return lines.map((line, index) => h('div', {
          key: index + '-' + line.time,
          className: cx('nm-lyric-line', index === activeIndex && 'is-active'),
          'data-nm': 'lyric-line',
          'data-active': index === activeIndex ? 'true' : 'false',
          'data-time': String(line.time),
          role: 'button',
          tabIndex: 0,
          ref: (node) => {
            if (node) lineRefs.current[index] = node
          },
          onClick: () => player.seekSeconds(line.time * 1000),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              player.seekSeconds(line.time * 1000)
            }
          },
        },
        h('span', { className: 'nm-lyric-text' }, line.text),
        line.translation ? h('span', { className: 'nm-lyric-translation' }, line.translation) : null))
      })()

      const metaBlock = h('div', { className: 'nm-np-meta' },
        h('div', { className: 'nm-np-eyebrow' },
          h('span', { className: 'nm-np-eyebrow-dot' }),
          track.vip ? t('vip') : t('np.title')),
        h('div', { className: 'nm-np-title-row' },
          h('h1', { className: 'nm-np-title', title: track.name }, track.name || t('state.unknown')),
          h(LikeButton, {
            id: track.id,
            nm: 'np-like',
            size: 18,
            className: 'nm-np-like',
            label: track.name,
          })),
        h('div', { className: 'nm-np-sub' }, trackArtists(track) || ''),
        track.album ? h('div', { className: 'nm-np-album' }, t('np.album') + ' · ' + track.album) : null)

      const topBar = h('div', { className: 'nm-np-top' },
        h('button', {
          ref: backRef,
          type: 'button',
          className: 'nm-back nm-np-back',
          'data-nm': 'np-back',
          title: t('np.back'),
          'aria-label': t('action.back'),
          onClick: closeNowPlaying,
        }, h(Icon, { name: 'back', size: 15 }), t('action.back')),
        h('div', { className: 'nm-np-brand' },
          h('img', {
            'data-nm': 'np-logo',
            className: 'nm-np-logo',
            src: ICON_DATA,
            alt: '',
            'aria-hidden': 'true',
            draggable: false,
          }),
          h('span', { className: 'nm-np-brand-name' }, t('np.title'))),
        h('div', { className: 'nm-np-top-tools' },
          h('div', { className: 'nm-np-mode-switch', role: 'tablist', 'aria-label': t('np.title') },
            h('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': mode === 'vinyl' ? 'true' : 'false',
              className: cx('nm-np-mode-btn', mode === 'vinyl' && 'is-active'),
              'data-nm': 'np-mode-vinyl',
              onClick: () => setNpMode('vinyl'),
            }, h(Icon, { name: 'disc', size: 14 }), t('np.vinyl')),
            h('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': mode === 'lyrics' ? 'true' : 'false',
              className: cx('nm-np-mode-btn', mode === 'lyrics' && 'is-active'),
              'data-nm': 'np-mode-lyrics',
              onClick: () => setNpMode('lyrics'),
            }, h(Icon, { name: 'lyrics', size: 14 }), t('np.lyrics'))),
          h('div', { className: 'nm-np-quality-anchor', ref: qualityAnchorRef },
            h('button', {
              type: 'button',
              className: cx('nm-btn nm-np-quality-btn', qualityOpen && 'is-open'),
              'data-nm': 'np-quality',
              title: qualityText,
              onClick: () => setQualityOpen((value) => !value),
            }, h(Icon, { name: 'disc', size: 14 }), h('span', null, qualityText)),
            qualityOpen ? h(QualityMenu, { t, auth, className: 'is-np', onClose: () => setQualityOpen(false) }) : null),
          h('button', {
            type: 'button',
            className: cx('nm-icon-btn', snapshot.queueOpen && 'is-on'),
            'data-nm': 'np-queue',
            title: t('action.queue'),
            'aria-label': t('action.queue'),
            onClick: () => player.toggleQueue(),
          }, h(Icon, { name: 'queue', size: 16 }))))

      const stage = mode === 'vinyl'
        ? h('div', { className: 'nm-np-stage is-vinyl', 'data-nm': 'np-mode', 'data-mode': 'vinyl' },
          h('div', { className: 'nm-np-vinyl-col' },
            h('div', {
              className: 'nm-np-art',
              role: 'button',
              tabIndex: 0,
              title: toggleLabel,
              'aria-label': toggleLabel,
              onClick: () => player.toggle(),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  player.toggle()
                }
              },
            }, h(Vinyl, { track, playing })),
            metaBlock))
        : h('div', { className: 'nm-np-stage is-lyrics', 'data-nm': 'np-mode', 'data-mode': 'lyrics' },
          h('div', { className: 'nm-np-lyrics-head' },
            h('span', { className: 'nm-np-lyrics-title' }, t('np.lyrics')),
            parsed.translated ? h('span', { className: 'nm-np-lyrics-badge' }, t('np.translated')) : null),
          h('div', { className: 'nm-np-lyrics', 'data-nm': 'np-lyrics', ref: scrollRef }, lyricsBody))

      return h('div', {
        className: 'nm-np',
        'data-nm': 'nowplaying',
        'data-mode': mode,
        'data-playing': playing ? 'true' : 'false',
      },
      h('div', {
        className: 'nm-np-bg',
        'data-nm': 'np-bg',
        'aria-hidden': 'true',
        style: (cover ? { backgroundImage: 'url("' + cover + '")' } : undefined),
      }),
      h('div', { className: 'nm-np-scrim', 'aria-hidden': 'true' }),
      topBar,
      stage)
    }
    /* ------------------------------------------------------------------ *
     * 侧栏迷你播放器（其它面板时显示）
     * ------------------------------------------------------------------ */
    function MiniPlayer(props) {
      const t = useT()
      const snapshot = usePlayerState()
      const wide = !!(props && props.wide)
      const usePanelInfo = props && props.usePanelInfo
      const panelMounted = usePageMounted()
      const hasPanelInfo = typeof usePanelInfo === 'function'
      let activePanelId = null
      if (hasPanelInfo) {
        activePanelId = usePanelInfo((info) => (info ? info.activePanelId : null))
      }
      const hidden = hasPanelInfo ? activePanelId === NS : panelMounted
      if (!snapshot.current || hidden) return null
      const track = snapshot.current
      const duration = snapshot.duration || Number(track.duration) || 0
      const pct = duration ? Math.min(100, Math.round(((snapshot.position || 0) / duration) * 100)) : 0
      const playing = snapshot.playing
      const toggleLabel = playing ? t('action.pause') : t('action.play')
      const open = () => {
        openPanel()
        openNowPlaying()
      }
      const cover = h('span', { className: 'nm-mini-cover', 'data-nm': 'mini-cover' },
        h(Cover, { src: track.cover, name: track.name, eager: true }))
      const progress = h('span', { className: 'nm-mini-progress' }, h('i', { style: { width: pct + '%' } }))

      if (!wide) {
        return h('button', {
          type: 'button',
          className: 'nm-mini is-rail',
          'data-nm': 'mini-player',
          title: track.name,
          'aria-label': t('np.open'),
          onClick: open,
        }, cover, progress)
      }

      return h('div', { className: 'nm-mini', 'data-nm': 'mini-player' },
        h('div', { className: 'nm-mini-top' },
          h('button', {
            type: 'button',
            className: 'nm-mini-cover-btn',
            title: t('np.open'),
            'aria-label': t('np.open'),
            onClick: open,
          }, cover),
          h('button', {
            type: 'button',
            className: 'nm-mini-text',
            title: track.name,
            onClick: open,
          },
          h('span', { className: 'nm-mini-name' }, track.name),
          h('span', { className: 'nm-mini-artist' }, trackArtists(track))),
          h('div', { className: 'nm-mini-volume-wrap' },
            h('button', {
              type: 'button',
              className: 'nm-mini-ctrl nm-mini-volume-btn',
              'data-nm': 'mini-volume',
              title: snapshot.muted ? t('action.unmute') : t('action.mute'),
              'aria-label': snapshot.muted ? t('action.unmute') : t('action.mute'),
              onClick: () => player.toggleMute(),
            }, h(Icon, { name: snapshot.muted ? 'mute' : 'volume', size: 14 })),
            h('div', { className: 'nm-mini-volume-pop' },
              h(Slider, {
                value: snapshot.muted ? 0 : snapshot.volume,
                step: 0.05,
                label: t('action.volume'),
                className: 'nm-mini-volume-slider',
                onCommit: (ratio) => player.setVolume(ratio),
              })))),
        h('div', { className: 'nm-mini-controls' },
          h('button', {
            type: 'button',
            className: 'nm-mini-ctrl',
            'data-nm': 'mini-prev',
            title: t('action.prev'),
            'aria-label': t('action.prev'),
            onClick: () => player.prev(),
          }, h(Icon, { name: 'prev', size: 14 })),
          h('button', {
            type: 'button',
            className: 'nm-mini-toggle',
            'data-nm': 'mini-toggle',
            title: toggleLabel,
            'aria-label': toggleLabel,
            onClick: () => player.toggle(),
          }, h(Icon, { name: playing ? 'pause' : 'play', size: 15 })),
          h('button', {
            type: 'button',
            className: 'nm-mini-ctrl',
            'data-nm': 'mini-next',
            title: t('action.next'),
            'aria-label': t('action.next'),
            onClick: () => player.next(false),
          }, h(Icon, { name: 'next', size: 14 }))),
        progress)

    }

    /* ------------------------------------------------------------------ *
     * 页面
     * ------------------------------------------------------------------ */
    let layoutService = null

    function openPanel() {
      try {
        if (layoutService && typeof layoutService.selectPanel === 'function') layoutService.selectPanel(NS)
      } catch (err) {
        /* ignore */
      }
    }

    function Page() {
      const t = useT()
      const rootRef = React.useRef(null)
      const scrollRef = React.useRef(null)
      const [tab, setTab] = React.useState('recommend')
      const [stack, setStack] = React.useState([])
      const [query, setQuery] = React.useState('')
      const [searchType, setSearchType] = React.useState('song')
      const [loginOpen, setLoginOpen] = React.useState(false)
      const [refresh, setRefresh] = React.useState(0)
      const [authVersion, setAuthVersion] = React.useState(0)
      const [toast, setToast] = React.useState(null)
      React.useEffect(() => {
        setLikeToast(setToast)
        setUiToast(setToast)
        return () => {
          setLikeToast(null)
          setUiToast(null)
        }
      }, [])
      const npIsOpen = useNpOpen()
      const [install, setInstall] = React.useState({ state: 'idle', phase: '', lines: [], error: '' })
      const [installStarting, setInstallStarting] = React.useState(false)
      const installAlive = React.useRef(true)
      const installTimer = React.useRef(null)

      React.useEffect(() => {
        setPageMounted(true)
        return () => setPageMounted(false)
      }, [])

      React.useEffect(() => {
        installAlive.current = true
        return () => {
          installAlive.current = false
          if (installTimer.current) clearTimeout(installTimer.current)
        }
      }, [])

      const debouncedQuery = useDebounced(String(query || '').trim(), 320)
      const status = useStatus()
      const authed = !!(status.data && status.data.authed)
      const home = useResource((signal) => apiGet('/home', signal), 'home:' + refresh + ':' + authVersion)
      const mine = useResource((signal) => apiGet('/playlists', signal), 'mine:' + refresh + ':' + authVersion, authed)
      const artists = useResource(
        (signal) => apiGet('/subscriptions?' + qs({ category: 'artists' }), signal),
        'artists:' + refresh + ':' + authVersion,
        authed
      )
      const search = useResource(
        (signal) => apiGet('/search?' + qs({ q: debouncedQuery, type: searchType, limit: 30 }), signal),
        'search:' + refresh + ':' + debouncedQuery + ':' + searchType,
        !!debouncedQuery
      )

      React.useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 2600)
        return () => clearTimeout(timer)
      }, [toast])

      /* 把登录态同步给全局 store（dock / 播放页的音质菜单用） */
      React.useEffect(() => {
        const data = status.data || {}
        setAuthInfo({ authed: !!data.authed, vip: !!(data.vipType && Number(data.vipType) > 0) })
      }, [status.data])

      /* 引擎安装状态：跟随 /status 的 install 字段 */
      React.useEffect(() => {
        const info = status.data && status.data.install
        if (!info) return
        setInstall((prev) => {
          if (prev.state === 'running') return prev
          return {
            state: info.state || prev.state,
            phase: info.phase || prev.phase,
            lines: Array.isArray(info.tail) && info.tail.length ? info.tail.slice(-160) : prev.lines,
            error: info.error || '',
          }
        })
      }, [status.data])

      const finishInstall = () => {
        setInstall((prev) => ({ ...prev, state: 'done', phase: 'done' }))
        apiPost('/refresh').catch(() => {})
        status.refresh()
        home.reload()
      }

      const pollInstallLog = () => {
        if (!installAlive.current) return
        apiGet('/setup/install/log').then((data) => {
          if (!installAlive.current) return
          const lines = toArray(data && data.lines).slice(-160)
          const next = {
            state: (data && data.state) || 'running',
            phase: (data && data.phase) || '',
            lines,
            error: (data && data.error) || '',
          }
          setInstall(next)
          if (next.state === 'running') {
            installTimer.current = setTimeout(pollInstallLog, 800)
            return
          }
          if (next.state === 'done' || (data && data.installed)) finishInstall()
        }).catch((err) => {
          if (!installAlive.current) return
          setInstall({ state: 'failed', phase: 'failed', lines: [], error: (err && err.message) || t('engine.installFailed') })
        })
      }

      const startInstall = () => {
        if (installStarting || install.state === 'running') return
        setInstallStarting(true)
        setInstall({ state: 'running', phase: 'clone', lines: [], error: '' })
        apiPost('/setup/install').then(() => {
          if (!installAlive.current) return
          installTimer.current = setTimeout(pollInstallLog, 800)
        }).catch((err) => {
          if (!installAlive.current) return
          setInstall({ state: 'failed', phase: 'failed', lines: [], error: (err && err.message) || t('engine.installFailed') })
        }).then(() => {
          if (installAlive.current) setInstallStarting(false)
        })
      }

      /* 桥/引擎启动完成前首次 /home 可能失败：就绪后自动补拉一次 */
      const homeRetried = React.useRef(false)
      const bridgeReady = !!(status.data && status.data.bridge === 'ready')
      React.useEffect(() => {
        if (!bridgeReady) {
          homeRetried.current = false
          return
        }
        if (home.error && !homeRetried.current) {
          homeRetried.current = true
          home.reload()
        }
      }, [bridgeReady, home.error])

      const detail = stack.length ? stack[stack.length - 1] : null
      const detailKey = detail ? detail.kind + ':' + detail.id : ''

      React.useEffect(() => {
        const node = scrollRef.current
        if (!node) return
        try {
          node.scrollTop = 0
        } catch (err) {
          /* ignore */
        }
      }, [tab, detailKey, npIsOpen])

      const homeData = home.data || {}
      const dailySongs = toArray(homeData.daily)
      const recommended = toArray(homeData.recommended).length
        ? toArray(homeData.recommended)
        : toArray(homeData.playlists)
      const homeArtists = toArray(homeData.artists)
      const favoriteArtists = authed
        ? toArray(artists.data && artists.data.items)
        : []
      const artistList = authed ? (favoriteArtists.length ? favoriteArtists : homeArtists) : homeArtists
      const minePlaylists = toArray(mine.data && mine.data.playlists)

      const showLoginBanner = !authed && !detail
      const engineInfo = (status.data && status.data.engine) || ''
      const installInfo = (status.data && status.data.install) || {}
      const engineReady = engineInfo === 'installed' || !!installInfo.installed || install.state === 'done'
      const engineInstalling = !engineReady && (install.state === 'running' || engineInfo === 'installing' || installInfo.state === 'running')
      const engineBroken = !engineReady && !engineInstalling && !!(status.data && (
        status.data.bridge === 'error' || engineInfo === 'missing' || engineInfo === 'failed' ||
        installInfo.state === 'failed' || install.state === 'failed'
      ))
      const showBody = !!home.data || (!engineBroken && !engineInstalling)

      const openLogin = () => setLoginOpen(true)

      const handleAuthed = () => {
        setAuthVersion((value) => value + 1)
        status.refresh()
        setToast(t('login.ok'))
      }

      const handleLogout = () => {
        apiPost('/logout').catch(() => {}).then(() => {
          setAuthVersion((value) => value + 1)
          status.refresh()
          setStack([])
          setTab('recommend')
          setToast(t('toast.logoutDone'))
        })
      }

      const handleRefresh = () => {
        setRefresh((value) => value + 1)
        status.refresh()
      }

      const handleQuery = (value) => {
        setQuery(value)
        if (String(value || '').trim()) {
          setTab('search')
          setStack([])
        }
      }

      const selectTab = (nextTab) => {
        setTab(nextTab)
        setStack([])
      }

      const openDetail = (kind, item) => {
        if (!item || item.id === undefined) return
        setStack((list) => list.concat([{ kind, id: item.id, meta: item }]))
      }

      const openArtist = (artist) => {
        if (!artist || artist.id === undefined) return
        openDetail('artist', { id: artist.id, name: artist.name, avatar: artist.avatar })
      }

      const playCollection = (kind, item) => {
        const endpoint = kind === 'album' ? '/album?' : kind === 'artist' ? '/artist?' : '/playlist?'
        apiGet(endpoint + qs({ id: item.id })).then((data) => {
          const songs = toArray(data && data.songs)
          if (!songs.length) {
            setToast(t('toast.playlistError'))
            return
          }
          player.playQueue(songs, 0, item.name || '')
        }).catch((err) => {
          setToast((err && err.message) || t('toast.playlistError'))
        })
      }

      const playDaily = () => {
        if (dailySongs.length) player.playQueue(dailySongs, 0, t('section.daily'))
      }

      /* ---- 通用区块包装 ---- */
      const renderDailySection = () => h('section', {
        className: 'nm-section',
        'data-nm': 'section',
        'data-section': 'daily',
      },
      h(SectionHead, {
        title: t('section.daily'),
        sub: dailySongs.length ? t('meta.tracks', { n: dailySongs.length }) : '',
        action: h('button', {
          type: 'button',
          className: 'nm-link-btn',
          disabled: !dailySongs.length,
          onClick: playDaily,
        }, h(Icon, { name: 'play', size: 11 }), t('action.playAll')),
      }),
      h(AsyncBody, {
        t,
        loading: home.loading && !home.data,
        error: null,
        isEmpty: !dailySongs.length,
        empty: authed
          ? h(StateBox, { message: t('state.noDaily') })
          : h(StateBox, {
            kind: 'login',
            message: t('state.unauthDaily'),
            action: t('action.loginNow'),
            onAction: openLogin,
          }),
        skeleton: h(TracksSkeleton, { rows: 6 }),
      }, h(TrackList, {
        t,
        tracks: dailySongs,
        contextTitle: t('section.daily'),
        onOpenArtist: openArtist,
      })))

      const renderLoginPrompt = (sectionId, title, message) => h('section', {
        className: 'nm-section',
        'data-nm': 'section',
        'data-section': sectionId,
      },
      h(SectionHead, { title }),
      h(StateBox, {
        kind: 'login',
        message,
        action: t('action.loginNow'),
        onAction: openLogin,
      }))

      const renderArtistsRail = () => h('section', {
        className: 'nm-section',
        'data-nm': 'section',
        'data-section': 'artists',
      },
      h(SectionHead, {
        title: t('section.artists'),
        sub: artistList.length ? t('meta.items', { n: fmtCount(artistList.length, t) }) : '',
        action: h('button', {
          type: 'button',
          className: 'nm-link-btn',
          onClick: () => selectTab('artists'),
        }, t('tab.artists'), h(Icon, { name: 'right', size: 11 })),
      }),
      !authed
        ? h(StateBox, {
          kind: 'login',
          message: t('state.unauthArtist'),
          action: t('action.loginNow'),
          onAction: openLogin,
        })
        : h(AsyncBody, {
          t,
          loading: artists.loading && !artists.data,
          error: artists.error,
          isEmpty: !artistList.length,
          empty: h(StateBox, { message: t('state.noArtist') }),
          skeleton: h(SkeletonCards, { count: 5, kind: 'artist' }),
          onRetry: artists.reload,
        }, h('div', { className: 'nm-rail' },
          artistList.map((artist) => h(CoverCard, {
            key: String(artist.id),
            t,
            kind: 'artist',
            item: artist,
            className: 'is-rail',
            onOpen: () => openDetail('artist', artist),
            onPlay: () => playCollection('artist', artist),
          })))))

      const renderRecommend = () => h(React.Fragment, null,
        h(HeroCarousel, {
          t,
          daily: dailySongs,
          loading: home.loading && !home.data,
          onToast: setToast,
        }),
        home.error && !engineBroken && !engineInstalling
          ? h('div', { className: 'nm-section' },
            h(StateBox, {
              kind: 'error',
              message: home.error,
              action: t('action.retry'),
              onAction: home.reload,
            }))
          : null,
        home.error ? null : renderDailySection(),
        home.error
          ? null
          : h('section', {
            className: 'nm-section',
            'data-nm': 'section',
            'data-section': 'recommended',
          },
          h(SectionHead, {
            title: t('section.recommended'),
            sub: recommended.length ? t('meta.items', { n: fmtCount(recommended.length, t) }) : '',
          }),
          h(AsyncBody, {
            t,
            loading: home.loading && !home.data,
            error: null,
            isEmpty: !recommended.length,
            empty: h(StateBox, { message: t('state.noRecommended') }),
            skeleton: h(SkeletonCards, { count: 6 }),
          }, h(CardGrid, {
            t,
            items: recommended,
            kind: 'playlist',
            onOpen: openDetail,
            onPlay: playCollection,
          }))),
        home.error ? null : renderArtistsRail())

      const renderPlaylists = () => h(React.Fragment, null,
        h('section', {
          className: 'nm-section',
          'data-nm': 'section',
          'data-section': 'recommended',
        },
        h(SectionHead, { title: t('section.recommended') }),
        h(AsyncBody, {
          t,
          loading: home.loading && !home.data,
          error: home.error,
          isEmpty: !recommended.length,
          empty: h(StateBox, { message: t('state.noRecommended') }),
          skeleton: h(SkeletonCards, { count: 8 }),
          onRetry: home.reload,
        }, h(CardGrid, {
          t,
          items: recommended,
          kind: 'playlist',
          onOpen: openDetail,
          onPlay: playCollection,
        }))),
        authed
          ? h('section', {
            className: 'nm-section',
            'data-nm': 'section',
            'data-section': 'mine',
          },
          h(SectionHead, {
            title: t('section.mine'),
            sub: minePlaylists.length ? t('meta.items', { n: fmtCount(minePlaylists.length, t) }) : '',
          }),
          h(AsyncBody, {
            t,
            loading: mine.loading && !mine.data,
            error: mine.error,
            isEmpty: !minePlaylists.length,
            empty: h(StateBox, { message: t('state.noPlaylist') }),
            skeleton: h(SkeletonCards, { count: 6 }),
            onRetry: mine.reload,
          }, h(CardGrid, {
            t,
            items: minePlaylists,
            kind: 'playlist',
            onOpen: openDetail,
            onPlay: playCollection,
          })))
          : renderLoginPrompt('mine', t('section.mine'), t('state.unauthPlaylist')))

      const renderArtistsTab = () => h('section', {
        className: 'nm-section',
        'data-nm': 'section',
        'data-section': 'artists',
      },
      h(SectionHead, {
        title: t('section.artists'),
        sub: artistList.length ? t('meta.items', { n: fmtCount(artistList.length, t) }) : '',
      }),
      !authed
        ? h(StateBox, {
          kind: 'login',
          message: t('state.unauthArtist'),
          action: t('action.loginNow'),
          onAction: openLogin,
        })
        : h(AsyncBody, {
          t,
          loading: artists.loading && !artists.data,
          error: artists.error,
          isEmpty: !artistList.length,
          empty: h(StateBox, { message: t('state.noArtist') }),
          skeleton: h(SkeletonCards, { count: 8, kind: 'artist' }),
          onRetry: artists.reload,
        }, h('div', { className: 'nm-grid nm-grid-artists' },
          artistList.map((artist) => h(CoverCard, {
            key: String(artist.id),
            t,
            kind: 'artist',
            item: artist,
            onOpen: () => openDetail('artist', artist),
            onPlay: () => playCollection('artist', artist),
          })))))

      const renderSearch = () => h(SearchView, {
        t,
        query,
        type: searchType,
        onType: setSearchType,
        resource: search,
        onOpenArtist: openArtist,
        onOpen: openDetail,
        onPlay: playCollection,
      })

      let body = null
      if (detail) {
        body = h(DetailView, {
          key: detailKey,
          t,
          item: detail,
          onBack: () => setStack((list) => list.slice(0, -1)),
          onOpen: openDetail,
          onOpenArtist: openArtist,
          onPlay: playCollection,
        })
      } else if (tab === 'playlists') {
        body = renderPlaylists()
      } else if (tab === 'artists') {
        body = renderArtistsTab()
      } else if (tab === 'search') {
        body = renderSearch()
      } else {
        body = renderRecommend()
      }

      if (npIsOpen) {
        return h('div', {
          className: 'nm-root nm-np-root',
          'data-nm': 'root',
          ref: rootRef,
        },
        h('div', { className: 'nm-scroll', 'data-nm': 'scroll', ref: scrollRef },
          h(NowPlaying, { t })),
        h(PlayerDock),
        toast ? h('div', { className: 'nm-toast', role: 'status' }, toast) : null)
      }

      return h('div', {
        className: 'nm-root',
        'data-nm': 'root',
        ref: rootRef,
      },
        h('div', { className: 'nm-scroll', 'data-nm': 'scroll', ref: scrollRef },
          h('div', { className: 'nm-header-shell', 'data-nm': 'header' },
            h(Header, {
              t,
              status,
              query,
              onQuery: handleQuery,
              onRefresh: handleRefresh,
              refreshing: home.loading,
              onLogin: openLogin,
              onLogout: handleLogout,
            })),
          h('div', { className: 'nm-wrap' },
            h(Tabs, { t, tab, onChange: selectTab }),
            h('div', { className: 'nm-content' },
              engineInstalling ? h(EngineProgressBar, { t, install }) : null,
              (engineBroken || engineInstalling) ? h(EngineSetupCard, {
                t,
                install,
                starting: installStarting,
                onInstall: startInstall,
              }) : null,
              showLoginBanner && !engineBroken ? h(LoginBanner, { t, onLogin: openLogin }) : null,
              showBody || detail ? body : null),
            h('div', { className: 'nm-build-stamp', 'data-nm': 'build-stamp' }, t('footer.updated') + ' ' + CLIENT_BUILD))),
        h(PlayerDock),
        loginOpen
          ? h(LoginModal, {
            t,
            onClose: () => setLoginOpen(false),
            onAuthed: handleAuthed,
          })
          : null,
        toast ? h('div', { className: 'nm-toast', role: 'status' }, toast) : null)
    }

    /* 官方网易云音乐 App 图标（128px PNG 内联为 dataURL：不依赖 Host 路由，刷新即生效） */
    const ICON_DATA =
      'data:image/png;base64,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'

    function PanelIcon(props) {
      const size = (props && props.size) || 18
      const active = !!(props && props.active)
      const radius = Math.round(size * 0.235)
      return h('img', {
        src: ICON_DATA,
        width: size,
        height: size,
        className: cx('nm-panel-icon', active && 'is-active'),
        alt: '',
        'aria-hidden': 'true',
        draggable: 'false',
        style: { display: 'block', width: size + 'px', height: size + 'px', borderRadius: radius + 'px' },
      })
    }

    /* ------------------------------------------------------------------ *
     * 样式：全部从 DSH 主题 token 派生，浅色 / 深色自动适配
     * ------------------------------------------------------------------ */
    const CSS = `
    .nm-root,.nm-dock-root,.nm-modal-root,.nm-mini{
      --nm-t1:var(--dsw-alias-label-primary,#1d1d1f);
      --nm-t2:var(--dsw-alias-label-secondary,#6e6e73);
      --nm-t3:var(--dsw-alias-label-tertiary,#8e8e93);
      --nm-bg:var(--dsw-alias-bg-base,#ffffff);
      --nm-l1:var(--dsw-alias-bg-layer-1,#f5f5f7);
      --nm-l2:var(--dsw-alias-bg-layer-2,#ffffff);
      --nm-ov:var(--dsw-alias-bg-overlay,#fbfbfd);
      --nm-line:var(--dsw-alias-border-l1,rgba(0,0,0,.10));
      --nm-line2:var(--dsw-alias-border-l2,rgba(0,0,0,.06));
      --nm-accent:#ec4141;
      --nm-accent-2:#ff5a6e;
      --nm-on-accent:#ffffff;
      --nm-success:var(--dsw-alias-state-success-primary,#2fbf71);
      --nm-warn:var(--dsw-alias-state-warn-primary,#e8a33d);
      --nm-error:var(--dsw-alias-state-error-primary,#e5534b);
      --nm-fill:color-mix(in srgb,var(--nm-t1) 5%,transparent);
      --nm-fill2:color-mix(in srgb,var(--nm-t1) 9%,transparent);
      --nm-accent-soft:color-mix(in srgb,var(--nm-accent) 14%,transparent);
      --nm-accent-line:color-mix(in srgb,var(--nm-accent) 40%,transparent);
      --nm-shadow-card:0 2px 6px rgba(0,0,0,.05),0 18px 40px -24px rgba(0,0,0,.35);
      --nm-shadow-pop:0 24px 64px -22px rgba(0,0,0,.5);
      --nm-radius:20px;
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Helvetica Neue","Segoe UI",sans-serif;
      -webkit-font-smoothing:antialiased;
    }
    .nm-root *,.nm-dock-root *,.nm-modal-root *,.nm-mini *,.nm-mini{box-sizing:border-box}
    .nm-root button,.nm-dock-root button,.nm-modal-root button,.nm-mini button{font:inherit}
    .nm-root :focus-visible,.nm-dock-root :focus-visible,.nm-modal-root :focus-visible,.nm-mini :focus-visible{
      outline:2px solid var(--dsw-focus-ring-color,var(--nm-accent));outline-offset:2px;
    }
    .nm-root{
      height:100%;display:flex;flex-direction:column;overflow:hidden;
      color:var(--nm-t1);font-size:13px;line-height:1.5;
      background:
        radial-gradient(1100px 420px at 12% -8%,color-mix(in srgb,var(--nm-accent) 10%,transparent),transparent 68%),
        radial-gradient(900px 400px at 98% 0%,color-mix(in srgb,var(--nm-accent-2) 7%,transparent),transparent 70%);
    }
    .nm-scroll{
      flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
      scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,var(--nm-fill2)) transparent;
    }
    .nm-root.nm-np-root{padding:0;overflow:hidden}
    .nm-np-root .nm-scroll{overflow:hidden}
    .nm-wrap{max-width:1480px;margin:0 auto;padding:0 28px}
    .nm-content{padding:14px 0 28px;animation:nm-fade .32s ease both}

    /* ---------- 图标 / 通用按钮 ---------- */
    .nm-ico{display:block;flex:none}
    .nm-icon-btn{
      display:inline-flex;align-items:center;justify-content:center;
      width:30px;height:30px;border-radius:99px;border:1px solid transparent;
      background:transparent;color:var(--nm-t2);cursor:pointer;flex:none;
      transition:background 160ms ease,color 160ms ease,transform 160ms ease;
    }
    .nm-icon-btn:hover{background:var(--nm-fill);color:var(--nm-t1)}
    .nm-icon-btn:active{transform:scale(.94)}
    .nm-btn{
      display:inline-flex;align-items:center;justify-content:center;gap:6px;
      height:32px;padding:0 15px;border-radius:999px;border:1px solid var(--nm-line);
      background:color-mix(in srgb,var(--nm-l1) 60%,transparent);color:var(--nm-t1);
      font-size:12.5px;font-weight:600;letter-spacing:-.01em;cursor:pointer;
      transition:background 160ms ease,border-color 160ms ease,transform 160ms ease,box-shadow 160ms ease;
      white-space:nowrap;
    }
    .nm-btn:hover{background:var(--nm-fill2);border-color:var(--nm-line)}
    .nm-btn:active{transform:scale(.97)}
    .nm-btn:disabled{opacity:.42;cursor:default;transform:none}
    .nm-btn.accent{border-color:transparent;background:var(--nm-accent);color:var(--nm-on-accent);box-shadow:0 10px 24px -12px color-mix(in srgb,var(--nm-accent) 75%,transparent)}
    .nm-btn.accent:hover{background:color-mix(in srgb,var(--nm-accent) 88%,#000);box-shadow:0 14px 30px -12px color-mix(in srgb,var(--nm-accent) 80%,transparent)}
    .nm-btn.accent:focus-visible{outline-color:var(--nm-accent)}
    .nm-btn.accent.lg,.nm-btn.lg{height:40px;padding:0 22px;font-size:13.5px;gap:8px}
    .nm-btn.sm{height:28px;padding:0 12px;font-size:12px}
    .nm-btn.login{gap:7px;background:color-mix(in srgb,var(--nm-t1) 7%,transparent);border-color:var(--nm-line)}
    .nm-link-btn{
      display:inline-flex;align-items:center;gap:4px;border:0;background:none;padding:0;
      color:var(--nm-accent);font-size:12px;font-weight:600;cursor:pointer;
    }
    .nm-link-btn:hover{color:color-mix(in srgb,var(--nm-accent) 78%,var(--nm-t1))}
    .nm-link-btn:disabled{opacity:.4;cursor:default}
    .nm-badge{display:inline-flex;align-items:center;height:15px;padding:0 5px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.02em}
    .nm-badge.vip{color:var(--nm-accent);background:var(--nm-accent-soft);border:1px solid var(--nm-accent-line)}
    .nm-spinner{
      width:14px;height:14px;border-radius:50%;display:inline-block;
      border:2px solid color-mix(in srgb,currentColor 30%,transparent);border-top-color:currentColor;
      animation:nm-spin .8s linear infinite;
    }
    .nm-ico.is-spin{animation:nm-spin .9s linear infinite}
    .nm-sep{color:var(--nm-t3)}
    .nm-inline-link{color:inherit;cursor:pointer;border-radius:4px}
    .nm-inline-link:hover{color:var(--nm-t1);text-decoration:underline;text-underline-offset:2px}

    /* ---------- 顶栏（最高处，不透明，不与 Harness 框架露缝） ---------- */
    .nm-header-shell{
      position:sticky;top:0;z-index:30;width:100%;
      padding-top:calc(var(--dsh-frame-top-clearance,0px) + 8px);
      padding-bottom:8px;
      background:color-mix(in srgb,var(--nm-bg) 96%,transparent);
      border-bottom:1px solid var(--nm-line2);
      backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);
    }
    .nm-header{max-width:1480px;margin:0 auto;padding:0 28px;min-height:36px;display:flex;align-items:center}
    .nm-header-row{display:flex;align-items:center;gap:14px;width:100%}
    .nm-brand{display:flex;align-items:center;gap:9px;min-width:0}
    .nm-logo{
      width:22px;height:22px;border-radius:5px;flex:none;display:block;overflow:hidden;
    }
    .nm-logo img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
    .nm-brand-text{min-width:0;display:flex;align-items:center;gap:8px}
    .nm-brand-title{font-size:15.5px;font-weight:700;letter-spacing:-.015em;line-height:1.15;white-space:nowrap}
    .nm-brand-sub{font-size:10.5px;color:var(--nm-t3);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-header-tools{margin-left:auto;display:flex;align-items:center;gap:8px;min-width:0}
    .nm-search{
      display:flex;align-items:center;gap:7px;height:32px;width:238px;min-width:0;
      padding:0 12px;border-radius:999px;border:1px solid var(--nm-line);
      background:color-mix(in srgb,var(--nm-l1) 55%,transparent);color:var(--nm-t3);
      transition:border-color 180ms ease,box-shadow 180ms ease,background 180ms ease,width 200ms ease;
    }
    .nm-search:focus-within{
      width:290px;color:var(--nm-t2);border-color:var(--nm-accent-line);
      box-shadow:0 0 0 3px var(--nm-accent-soft);background:color-mix(in srgb,var(--nm-l1) 80%,transparent);
    }
    .nm-search-input{
      flex:1;min-width:0;background:none;border:0;outline:none;color:var(--nm-t1);
      font-size:12.5px;padding:0;height:100%;
    }
    .nm-search-input::placeholder{color:var(--nm-t3)}
    .nm-search-input::-webkit-search-cancel-button{display:none}
    .nm-search-clear{
      width:18px;height:18px;border-radius:50%;border:0;background:var(--nm-fill2);color:var(--nm-t2);
      display:grid;place-items:center;cursor:pointer;flex:none;padding:0;
    }
    .nm-search-clear:hover{background:var(--nm-fill2);color:var(--nm-t1)}
    .nm-refresh{margin-left:2px}
    .nm-account{display:flex;align-items:center;gap:6px;min-width:0}
    .nm-account-profile{display:flex;align-items:center;gap:7px;min-width:0;padding:2px 4px 2px 2px;border-radius:999px}
    .nm-avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none;background:var(--nm-fill2)}
    .nm-avatar-fb{display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--nm-on-accent);background:linear-gradient(140deg,var(--nm-accent),color-mix(in srgb,var(--nm-accent-2) 78%,var(--nm-accent)))}
    .nm-account-name{font-size:12.5px;font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    /* ---------- Tabs ---------- */
    .nm-tabs{display:flex;align-items:center;gap:2px;margin:0;padding:6px 0 2px;border-bottom:1px solid var(--nm-line2);overflow-x:auto;scrollbar-width:none}
    .nm-tabs::-webkit-scrollbar{display:none}
    .nm-tab{
      position:relative;border:0;background:none;color:var(--nm-t2);cursor:pointer;
      font-size:14px;font-weight:650;letter-spacing:-.01em;padding:10px 14px;border-radius:10px 10px 0 0;
      transition:color 160ms ease,background 160ms ease;white-space:nowrap;
    }
    .nm-tab:hover{color:var(--nm-t1);background:color-mix(in srgb,var(--nm-t1) 4%,transparent)}
    .nm-tab.is-active{color:var(--nm-t1)}
    .nm-tab.is-active::after{
      content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:2px;border-radius:2px;
      background:var(--nm-accent);box-shadow:0 0 12px var(--nm-accent);
    }

    /* ---------- 引擎 / 登录引导 ---------- */
    .nm-engine{
      display:flex;flex-direction:column;gap:15px;margin-top:18px;padding:19px 21px;border-radius:20px;
      border:1px solid color-mix(in srgb,var(--nm-error) 32%,var(--nm-line));
      background:
        radial-gradient(90% 140% at 0% 0%,color-mix(in srgb,var(--nm-error) 12%,transparent),transparent 65%),
        linear-gradient(140deg,color-mix(in srgb,var(--nm-error) 7%,var(--nm-l2)),color-mix(in srgb,var(--nm-error) 2%,var(--nm-l1)));
      box-shadow:var(--nm-shadow-card);
    }
    .nm-engine-head{display:flex;align-items:flex-start;gap:13px}
    .nm-engine-icon{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;flex:none;
      background:color-mix(in srgb,var(--nm-error) 14%,transparent);color:var(--nm-error)}
    .nm-engine-titles{min-width:0;flex:1}
    .nm-engine-title{font-size:14.5px;font-weight:700;letter-spacing:-.015em}
    .nm-engine-desc{font-size:12px;color:var(--nm-t2);margin-top:3px;line-height:1.55;max-width:80ch}
    .nm-engine-body{min-width:0}
    .nm-engine-label{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--nm-t3);margin-bottom:7px}
    .nm-engine-codewrap{display:flex;align-items:stretch;gap:8px;min-width:0}
    .nm-engine-code{
      flex:1;min-width:0;margin:0;padding:11px 13px;border-radius:11px;overflow-x:auto;white-space:nowrap;
      background:color-mix(in srgb,var(--nm-t1) 7%,transparent);border:1px solid var(--nm-line2);
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.6;color:var(--nm-t2);
      scrollbar-width:thin;
    }
    .nm-engine-copy{flex:none;align-self:stretch;height:auto;min-height:36px}
    .nm-engine-copy.is-copied{color:var(--nm-success);border-color:color-mix(in srgb,var(--nm-success) 40%,transparent)}
    .nm-engine-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .nm-engine-hint{font-size:11px;color:var(--nm-t3);flex:1;min-width:140px}
    .nm-engine-log{
      margin:0;max-height:150px;overflow:auto;padding:10px 13px;border-radius:11px;
      background:color-mix(in srgb,var(--nm-t1) 7%,transparent);border:1px solid var(--nm-line2);
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;line-height:1.55;color:var(--nm-t2);
      white-space:pre-wrap;word-break:break-all;scrollbar-width:thin;
    }
    .nm-engine-progress{
      display:flex;align-items:center;gap:9px;margin-top:14px;padding:8px 13px;border-radius:12px;
      border:1px solid var(--nm-accent-line);background:var(--nm-accent-soft);font-size:11.5px;color:var(--nm-t2);
      overflow:hidden;
    }
    .nm-engine-progress .nm-spinner{color:var(--nm-accent)}
    .nm-engine-progress-title{font-weight:650;color:var(--nm-t1);white-space:nowrap}
    .nm-engine-progress-phase{color:var(--nm-accent);font-weight:650;white-space:nowrap}
    .nm-engine-progress-bar{position:relative;flex:1;min-width:60px;height:3px;border-radius:999px;background:color-mix(in srgb,var(--nm-accent) 18%,transparent);overflow:hidden}
    .nm-engine-progress-bar>i{position:absolute;top:0;bottom:0;width:34%;border-radius:999px;background:var(--nm-accent);animation:nm-indeterminate 1.3s ease-in-out infinite}
    .nm-engine-progress-bar.is-inline{margin-top:10px;display:block}
    @keyframes nm-indeterminate{0%{left:-34%}100%{left:100%}}
    .nm-login-banner{
      display:flex;align-items:center;gap:14px;margin-top:16px;padding:14px 18px;border-radius:18px;
      border:1px solid color-mix(in srgb,var(--nm-accent) 22%,var(--nm-line2));
      background:linear-gradient(120deg,color-mix(in srgb,var(--nm-accent) 13%,var(--nm-l2)),color-mix(in srgb,var(--nm-accent) 4%,var(--nm-l1)));
      box-shadow:var(--nm-shadow-card);
    }
    .nm-login-banner-icon{
      width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;color:var(--nm-accent);
      background:color-mix(in srgb,var(--nm-accent) 13%,transparent);border:1px solid var(--nm-accent-line);
    }
    .nm-login-banner-text{min-width:0;flex:1}
    .nm-login-banner-title{font-size:13.5px;font-weight:650;letter-spacing:-.01em}
    .nm-login-banner-desc{font-size:11.5px;color:var(--nm-t2);margin-top:1px}

    /* ---------- Hero ---------- */
    .nm-hero{
      position:relative;margin-top:20px;padding:34px 38px;border-radius:26px;overflow:hidden;
      display:grid;grid-template-columns:minmax(0,62fr) minmax(0,38fr);gap:30px;align-items:center;
      border:1px solid var(--nm-line);
      background:
        radial-gradient(90% 130% at 0% 0%,color-mix(in srgb,var(--nm-accent) 26%,transparent),transparent 62%),
        radial-gradient(70% 110% at 100% 110%,color-mix(in srgb,var(--nm-accent-2) 14%,transparent),transparent 60%),
        linear-gradient(135deg,color-mix(in srgb,var(--nm-accent) 15%,var(--nm-l2)) 0%,color-mix(in srgb,var(--nm-accent-2) 7%,var(--nm-l1)) 55%,var(--nm-l1) 100%);
      box-shadow:var(--nm-shadow-card);
      animation:nm-fade .45s ease both;
    }
    .nm-hero::after{
      content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
      background:linear-gradient(180deg,rgba(255,255,255,.12),transparent 42%);
      mix-blend-mode:overlay;
    }
    .nm-hero-copy{position:relative;z-index:2;min-width:0}
    .nm-eyebrow{
      display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:650;letter-spacing:.08em;
      text-transform:uppercase;color:var(--nm-t2);
    }
    .nm-eyebrow-dot{width:6px;height:6px;border-radius:50%;background:var(--nm-accent);box-shadow:0 0 10px var(--nm-accent)}
    .nm-hero-title{
      margin:10px 0 0;font-size:clamp(30px,3.2vw,44px);line-height:1.04;font-weight:750;
      letter-spacing:-.035em;max-width:16ch;
    }
    .nm-hero-desc{margin:12px 0 0;font-size:13px;line-height:1.55;color:var(--nm-t2);max-width:46ch}
    .nm-hero-actions{display:flex;align-items:center;gap:14px;margin-top:22px;flex-wrap:wrap}
    .nm-hero-count{font-size:12px;color:var(--nm-t3);font-variant-numeric:tabular-nums}
    .nm-hero-art{position:relative;z-index:2;width:100%;max-width:326px;justify-self:end;min-width:0}
    .nm-hero-stack{position:relative;width:100%;aspect-ratio:1}
    .nm-hero-cell{
      position:absolute;width:47%;aspect-ratio:1;border-radius:15px;overflow:hidden;
      border:1px solid rgba(255,255,255,.16);background:var(--nm-fill2);
      box-shadow:0 22px 44px -18px rgba(0,0,0,.5);
      transition:transform 260ms cubic-bezier(.2,.7,.3,1);
    }
    .nm-hero-cell img{width:100%;height:100%;object-fit:cover;display:block}
    .nm-hero-cell-ph{width:100%;height:100%;display:grid;place-items:center;color:rgba(255,255,255,.55);
      background:linear-gradient(140deg,color-mix(in srgb,var(--nm-accent) 55%,#333),color-mix(in srgb,var(--nm-accent-2) 40%,#111))}
    .nm-hero-cell.c1{left:1%;top:0;transform:rotate(-6deg);z-index:4}
    .nm-hero-cell.c2{right:1%;top:9%;transform:rotate(5deg);z-index:3}
    .nm-hero-cell.c3{left:8%;bottom:0;transform:rotate(4deg);z-index:2}
    .nm-hero-cell.c4{right:4%;bottom:7%;transform:rotate(-4deg);z-index:1}
    .nm-hero:hover .nm-hero-cell.c1{transform:rotate(-7.5deg) translateY(-4px)}
    .nm-hero:hover .nm-hero-cell.c2{transform:rotate(6.5deg) translateY(-3px)}
    .nm-hero:hover .nm-hero-cell.c3{transform:rotate(5.5deg) translateY(2px)}
    .nm-hero:hover .nm-hero-cell.c4{transform:rotate(-5.5deg) translateY(3px)}

    /* ---------- 首页听歌模式轮播 ---------- */
    .nm-hero-carousel{margin-top:22px;animation:nm-fade .4s ease both}
    .nm-carousel-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}
    .nm-carousel-heading-wrap{min-width:0}
    .nm-carousel-heading{margin:6px 0 0;font-size:clamp(24px,2.6vw,34px);line-height:1.08;font-weight:750;letter-spacing:-.03em}
    .nm-carousel{position:relative;border-radius:26px;overflow:hidden;border:1px solid var(--nm-line);
      background:var(--nm-l1);box-shadow:var(--nm-shadow-card);isolation:isolate}
    .nm-carousel-track{display:flex;transition:transform 460ms cubic-bezier(.2,.7,.3,1);will-change:transform;
      touch-action:pan-y;cursor:grab}
    .nm-carousel-track:active{cursor:grabbing}
    .nm-carousel-card{position:relative;flex:0 0 100%;min-height:286px;display:flex;align-items:center;
      padding:30px 34px 30px 76px;overflow:hidden;cursor:pointer;user-select:none;outline:none}
    .nm-carousel-card.is-clone{pointer-events:none}
    .nm-carousel-bg{position:absolute;inset:0;z-index:0;
      background:
        radial-gradient(120% 150% at 0% 0%,color-mix(in srgb,var(--nm-accent) 28%,transparent),transparent 62%),
        linear-gradient(120deg,color-mix(in srgb,var(--nm-accent) 14%,var(--nm-l2)),var(--nm-l1) 70%);}
    .nm-carousel-card[data-mode="heart"] .nm-carousel-bg{
      background:
        radial-gradient(130% 150% at 0% 0%,color-mix(in srgb,var(--nm-accent) 40%,transparent),transparent 64%),
        linear-gradient(120deg,color-mix(in srgb,var(--nm-accent) 24%,var(--nm-l2)),var(--nm-l1) 72%);}
    .nm-carousel-card[data-mode="roam"] .nm-carousel-bg{
      background:
        radial-gradient(120% 160% at 4% 0%,color-mix(in srgb,var(--nm-accent-2) 36%,transparent),transparent 62%),
        linear-gradient(115deg,color-mix(in srgb,var(--nm-accent-2) 20%,var(--nm-l2)),var(--nm-l1) 74%);}
    .nm-carousel-card[data-mode="similar_song"] .nm-carousel-bg{
      background:
        radial-gradient(120% 150% at 0% 4%,color-mix(in srgb,var(--nm-accent) 26%,var(--nm-success) 12%,transparent),transparent 64%),
        linear-gradient(120deg,color-mix(in srgb,var(--nm-accent) 15%,var(--nm-l2)),var(--nm-l1) 72%);}
    .nm-carousel-card[data-mode="similar_artist"] .nm-carousel-bg{
      background:
        radial-gradient(120% 150% at 0% 0%,color-mix(in srgb,var(--nm-accent-2) 28%,var(--nm-accent) 12%,transparent),transparent 66%),
        linear-gradient(125deg,color-mix(in srgb,var(--nm-accent-2) 14%,var(--nm-l2)),var(--nm-l1) 74%);}
    .nm-carousel-card[data-mode="daily"] .nm-carousel-bg{
      background:
        radial-gradient(130% 150% at 2% 0%,color-mix(in srgb,var(--nm-accent) 30%,transparent),transparent 60%),
        radial-gradient(90% 120% at 100% 100%,color-mix(in srgb,var(--nm-accent-2) 22%,transparent),transparent 60%),
        linear-gradient(120deg,color-mix(in srgb,var(--nm-accent) 12%,var(--nm-l2)),var(--nm-l1) 70%);}
    .nm-carousel-shade{position:absolute;inset:0;z-index:1;pointer-events:none;
      background:linear-gradient(90deg,color-mix(in srgb,var(--nm-bg) 56%,transparent) 0%,color-mix(in srgb,var(--nm-bg) 24%,transparent) 48%,transparent 74%);}
    .nm-carousel-copy{position:relative;z-index:3;max-width:54%;min-width:0}
    .nm-carousel-eyebrow{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--nm-t2)}
    .nm-carousel-title{margin:8px 0 0;font-size:clamp(28px,3.2vw,42px);line-height:1.05;font-weight:750;
      letter-spacing:-.035em;color:var(--nm-t1);word-break:break-word}
    .nm-carousel-desc{margin:10px 0 0;font-size:13px;line-height:1.55;color:var(--nm-t2);max-width:40ch}
    .nm-carousel-fallback{margin:6px 0 0;font-size:10.5px;color:var(--nm-t3);line-height:1.4;max-width:38ch;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .nm-carousel-fallback.is-error{color:var(--nm-error)}
    .nm-carousel-cta{display:inline-flex;align-items:center;gap:7px;margin-top:18px;height:36px;padding:0 17px;appearance:none;font:inherit;cursor:pointer;
      border-radius:999px;border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-bg) 68%,transparent);
      color:var(--nm-t1);font-size:12.5px;font-weight:650;backdrop-filter:blur(12px);
      box-shadow:0 6px 18px -10px rgba(0,0,0,.5)}
    .nm-carousel-collage{position:absolute;z-index:2;right:5%;top:50%;transform:translateY(-50%) rotate(-4deg);
      width:40%;max-width:420px;display:grid;grid-template-columns:1fr 1fr;gap:10px;pointer-events:none;opacity:.96}
    .nm-carousel-index{position:absolute;right:2px;top:-22px;font-size:10px;font-weight:600;letter-spacing:.14em;color:var(--nm-t3)}
    .nm-carousel-cover{display:block;aspect-ratio:1;border-radius:13px;overflow:hidden;background:var(--nm-fill2);
      border:1px solid rgba(255,255,255,.14);box-shadow:0 22px 44px -20px rgba(0,0,0,.55)}
    .nm-carousel-cover img{width:100%;height:100%;object-fit:cover;display:block}
    .nm-carousel-cover.c1{transform:rotate(-3deg) translateY(-6px)}
    .nm-carousel-cover.c2{transform:rotate(2deg)}
    .nm-carousel-cover.c3{transform:rotate(2deg) translateX(-4px)}
    .nm-carousel-cover.c4{transform:rotate(-2deg) translateY(4px)}
    .nm-carousel-cover-ph{width:100%;height:100%;display:grid;place-items:center;color:rgba(255,255,255,.6);
      background:linear-gradient(140deg,color-mix(in srgb,var(--nm-accent) 55%,#333),color-mix(in srgb,var(--nm-accent-2) 42%,#111))}
    .nm-carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:36px;height:36px;
      border-radius:50%;border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-bg) 62%,transparent);
      color:var(--nm-t1);display:grid;place-items:center;cursor:pointer;backdrop-filter:blur(14px);
      opacity:.72;transition:opacity .18s ease,background .18s ease}
    .nm-carousel-arrow:hover{opacity:1;background:color-mix(in srgb,var(--nm-bg) 84%,transparent)}
    .nm-carousel-arrow.is-prev{left:14px}
    .nm-carousel-arrow.is-next{right:14px}
    .nm-carousel-dots{position:absolute;z-index:6;left:50%;bottom:16px;transform:translateX(-50%);
      display:flex;align-items:center;gap:7px;padding:5px 9px;border-radius:999px;
      background:color-mix(in srgb,var(--nm-bg) 38%,transparent);backdrop-filter:blur(10px)}
    .nm-carousel-dot{width:7px;height:7px;border-radius:999px;border:0;padding:0;
      background:color-mix(in srgb,var(--nm-t1) 32%,transparent);cursor:pointer;
      transition:width .18s ease,background .18s ease}
    .nm-carousel-dot.is-active{width:20px;background:var(--nm-accent)}

    /* ---------- 区块 ---------- */
    .nm-section{margin-top:34px;animation:nm-fade .4s ease both}
    .nm-section-head{display:flex;align-items:flex-end;gap:10px;margin:0 2px 14px}
    .nm-section-titles{display:flex;align-items:baseline;gap:10px;min-width:0}
    .nm-section-titles h2{margin:0;font-size:20px;font-weight:700;letter-spacing:-.025em;line-height:1.2}
    .nm-section-sub{font-size:11.5px;color:var(--nm-t3);font-variant-numeric:tabular-nums;white-space:nowrap}
    .nm-section-action{margin-left:auto;display:flex;align-items:center;gap:8px;flex:none}

    /* ---------- 封面 / 卡片 ---------- */
    .nm-cover{
      position:relative;display:block;width:100%;height:100%;overflow:hidden;
      background:linear-gradient(140deg,hsl(calc(var(--nm-h,0) * 1deg) 58% 58%),hsl(calc(var(--nm-h,0) * 1deg + 42deg) 60% 40%));
    }
    .nm-cover.is-round{border-radius:50%}
    .nm-cover-ph{
      position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.82);
      font-size:18px;font-weight:700;letter-spacing:-.02em;user-select:none;
    }
    .nm-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .nm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:24px 18px}
    .nm-grid-artists{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:26px 18px}
    .nm-card{min-width:0;cursor:pointer;border-radius:14px;outline:none}
    .nm-card-art{
      position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;background:var(--nm-fill);
      box-shadow:var(--nm-shadow-card);transition:transform 240ms cubic-bezier(.2,.7,.3,1),box-shadow 240ms ease;
    }
    .nm-card:hover .nm-card-art,.nm-card:focus-visible .nm-card-art{
      transform:translateY(-4px) scale(1.012);
      box-shadow:0 4px 10px rgba(0,0,0,.06),0 26px 50px -22px rgba(0,0,0,.5);
    }
    .nm-card.is-artist .nm-card-art{border-radius:50%;box-shadow:none;transform:none}
    .nm-card.is-artist:hover .nm-card-art{transform:translateY(-3px);box-shadow:0 18px 36px -20px rgba(0,0,0,.42)}
    .nm-card-play{
      position:absolute;left:0;right:0;bottom:0;height:52%;display:flex;align-items:flex-end;justify-content:flex-end;
      padding:10px;pointer-events:none;
      background:linear-gradient(to top,rgba(0,0,0,.45),transparent);
      opacity:0;transition:opacity 200ms ease;
    }
    .nm-card:hover .nm-card-play,.nm-card:focus-within .nm-card-play{opacity:1}
    .nm-card-play-btn{
      pointer-events:auto;width:38px;height:38px;border-radius:50%;border:0;display:grid;place-items:center;
      background:color-mix(in srgb,var(--nm-l2) 86%,rgba(255,255,255,.5));color:var(--nm-t1);
      box-shadow:0 8px 20px -8px rgba(0,0,0,.6);cursor:pointer;
      transform:translateY(6px);transition:transform 200ms ease,background 160ms ease,color 160ms ease;
    }
    .nm-card:hover .nm-card-play-btn,.nm-card:focus-within .nm-card-play-btn{transform:translateY(0)}
    .nm-card-play-btn:hover{background:var(--nm-accent);color:var(--nm-on-accent)}
    .nm-card-count{
      position:absolute;left:9px;bottom:9px;display:inline-flex;align-items:center;gap:3px;
      padding:2px 6px;border-radius:999px;background:rgba(0,0,0,.38);color:rgba(255,255,255,.94);
      font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;backdrop-filter:blur(6px);
    }
    .nm-card-title{
      margin-top:10px;font-size:13.5px;font-weight:650;letter-spacing:-.012em;line-height:1.35;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;
    }
    .nm-card-sub{margin-top:2px;font-size:11.5px;color:var(--nm-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-card.is-artist .nm-card-title{text-align:center;margin-top:11px;font-size:12.5px}
    .nm-card.is-artist .nm-card-sub{text-align:center}
    .nm-rail{display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 8px;margin:-4px -2px -8px;scrollbar-width:none}
    .nm-rail::-webkit-scrollbar{display:none}
    .nm-card.is-rail{flex:0 0 128px;scroll-snap-align:start}
    .nm-card.is-rail .nm-card-art{box-shadow:none}

    /* ---------- 曲目表 ---------- */
    .nm-tracks{display:flex;flex-direction:column;gap:1px}
    .nm-track{
      display:grid;grid-template-columns:40px 40px minmax(0,1.6fr) minmax(0,1fr) 56px 66px;
      align-items:center;gap:12px;height:56px;padding:0 12px 0 8px;border-radius:12px;
      cursor:pointer;transition:background 140ms ease;outline:none;
    }
    .nm-track:hover{background:color-mix(in srgb,var(--nm-t1) 5.5%,transparent)}
    .nm-track.is-active{background:color-mix(in srgb,var(--nm-accent) 9%,transparent)}
    .nm-track.is-active .nm-track-name{color:var(--nm-accent)}
    .nm-track-idx{display:flex;align-items:center;justify-content:center;color:var(--nm-t3);font-size:12px;font-variant-numeric:tabular-nums}
    .nm-track-cover{width:40px;height:40px;border-radius:9px;overflow:hidden;flex:none;box-shadow:0 4px 12px -6px rgba(0,0,0,.4)}
    .nm-track-main{min-width:0;display:flex;flex-direction:column;gap:1px}
    .nm-track-title{display:flex;align-items:center;gap:7px;min-width:0}
    .nm-track-name{font-size:13.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-track-artist{font-size:11.5px;color:var(--nm-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-track-album{font-size:11.5px;color:var(--nm-t3);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-track-time{font-size:11.5px;color:var(--nm-t3);text-align:right;font-variant-numeric:tabular-nums}
    .nm-like{display:grid;place-items:center;border:0;background:none;padding:0;cursor:pointer;color:var(--nm-t3);
      border-radius:50%;flex:none;transition:color .16s ease,transform .16s ease,opacity .16s ease}
    .nm-like:hover{color:#ec4141}
    .nm-like:active{transform:scale(.9)}
    .nm-like.is-liked{color:#ec4141}
    .nm-like.is-pending{opacity:.55;cursor:default}
    .nm-like.is-disabled{opacity:.45}
    .nm-track-like{width:26px;height:26px;margin-right:2px}
    .nm-np-title-row{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;min-width:0}
    .nm-np-like{width:30px;height:30px;color:var(--nm-t2)}
    .nm-dock-like{width:26px;height:26px;margin-left:-4px}
    .nm-track-actions{display:flex;align-items:center;justify-content:flex-end;gap:0;opacity:0;transition:opacity 140ms ease}
    .nm-track:hover .nm-track-actions,.nm-track:focus-within .nm-track-actions,.nm-track.is-active .nm-track-actions{opacity:1}
    .nm-track-actions .nm-icon-btn{width:28px;height:28px}
    .nm-build-stamp{padding:18px 0 10px;text-align:center;font-size:10.5px;letter-spacing:.02em;color:var(--nm-t3);opacity:.75;user-select:none}
    .nm-load-more{display:flex;justify-content:center;padding:16px 0 4px}
    .nm-wave{display:inline-flex;align-items:flex-end;justify-content:center;gap:2px;height:15px;width:16px}
    .nm-wave i{display:block;width:2.5px;height:4px;border-radius:2px;background:var(--nm-accent);opacity:.75}
    .nm-wave i:nth-child(1){height:6px}
    .nm-wave i:nth-child(2){height:11px}
    .nm-wave i:nth-child(3){height:7px}
    .nm-wave i:nth-child(4){height:12px}
    .nm-wave.is-playing i{animation:nm-wave 900ms ease-in-out infinite;opacity:1}
    .nm-wave.is-playing i:nth-child(1){animation-delay:-750ms}
    .nm-wave.is-playing i:nth-child(2){animation-delay:-450ms}
    .nm-wave.is-playing i:nth-child(3){animation-delay:-900ms}
    .nm-wave.is-playing i:nth-child(4){animation-delay:-300ms}

    /* ---------- 状态 / 骨架 ---------- */
    .nm-state{
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;
      padding:34px 22px;border-radius:18px;border:1px dashed var(--nm-line);
      background:color-mix(in srgb,var(--nm-l1) 34%,transparent);text-align:center;
    }
    .nm-state-icon{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--nm-fill);color:var(--nm-t2)}
    .nm-state-msg{font-size:12.5px;color:var(--nm-t2);max-width:46ch;line-height:1.5}
    .nm-state-hint{font-size:11.5px;color:var(--nm-t3)}
    .nm-state.error{border-style:solid;border-color:color-mix(in srgb,var(--nm-error) 28%,transparent);background:color-mix(in srgb,var(--nm-error) 5%,transparent)}
    .nm-state.error .nm-state-icon{background:color-mix(in srgb,var(--nm-error) 13%,transparent);color:var(--nm-error)}
    .nm-state.login .nm-state-icon{background:var(--nm-accent-soft);color:var(--nm-accent)}
    .nm-skel{background:linear-gradient(90deg,var(--nm-fill) 25%,var(--nm-fill2) 37%,var(--nm-fill) 63%);
      background-size:400% 100%;animation:nm-shimmer 1.5s ease infinite;border-radius:8px}
    .nm-skel-card{min-width:0}
    .nm-skel-art{width:100%;aspect-ratio:1;border-radius:14px}
    .nm-skel-art.is-round{border-radius:50%}
    .nm-skel-line{height:12px;margin-top:10px}
    .nm-skel-line.sm{height:9px;margin-top:6px}
    .nm-skel-tracks{display:flex;flex-direction:column;gap:10px}
    .nm-skel-track{display:flex;align-items:center;gap:12px;padding:8px 10px}
    .nm-skel-stack{display:flex;flex-direction:column;gap:7px;flex:1}
    .nm-skel-detail{display:flex;gap:29px;padding:22px 4px}
    .nm-skel-detail-lines{display:flex;flex-direction:column;gap:14px;justify-content:center;flex:1}

    /* ---------- 详情 ---------- */
    .nm-detail{padding-top:12px;animation:nm-fade .3s ease both}
    .nm-detail-top{margin:0 0 8px}
    .nm-back{
      display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px 0 9px;border-radius:999px;
      border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-l1) 55%,transparent);
      color:var(--nm-t2);font-size:12px;font-weight:600;cursor:pointer;
      transition:background 160ms ease,color 160ms ease;
    }
    .nm-back:hover{background:var(--nm-fill2);color:var(--nm-t1)}
    .nm-detail-row{display:flex;align-items:flex-end;gap:30px;padding:12px 2px 6px}
    .nm-detail-art{
      width:clamp(150px,18vw,196px);flex:none;aspect-ratio:1;border-radius:18px;overflow:hidden;
      box-shadow:0 28px 60px -26px rgba(0,0,0,.6);background:var(--nm-fill);
    }
    .nm-detail-art .nm-cover{border-radius:18px}
    .nm-detail-info{min-width:0;flex:1;padding-bottom:4px}
    .nm-detail-title{
      margin:8px 0 0;font-size:clamp(26px,3vw,38px);line-height:1.06;font-weight:750;letter-spacing:-.035em;
      word-break:break-word;
    }
    .nm-detail-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin-top:10px;font-size:12px;color:var(--nm-t3)}
    .nm-detail-meta-item{display:inline-flex;align-items:center}
    .nm-detail-meta-item+.nm-detail-meta-item::before{content:"·";margin:0 7px;color:var(--nm-t3);opacity:.7}
    .nm-detail-desc{
      margin:12px 0 0;font-size:12.5px;line-height:1.6;color:var(--nm-t2);
      display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;max-width:70ch;
    }
    .nm-detail-actions{display:flex;align-items:center;gap:14px;margin-top:18px;flex-wrap:wrap}
    .nm-detail-count{font-size:12px;color:var(--nm-t3);font-variant-numeric:tabular-nums}

    /* ---------- 搜索 ---------- */
    .nm-search-view{padding-top:20px}
    .nm-pill-tabs{display:inline-flex;align-items:center;gap:4px;padding:4px;border-radius:999px;
      background:color-mix(in srgb,var(--nm-t1) 4%,transparent);border:1px solid var(--nm-line2)}
    .nm-pill-tab{
      border:0;background:none;color:var(--nm-t2);font-size:12px;font-weight:600;padding:6px 14px;border-radius:999px;
      cursor:pointer;transition:background 160ms ease,color 160ms ease;
    }
    .nm-pill-tab:hover{color:var(--nm-t1)}
    .nm-pill-tab.is-active{background:var(--nm-l2);color:var(--nm-t1);box-shadow:0 2px 8px rgba(0,0,0,.12)}
    .nm-search-body{margin-top:20px}

    /* ---------- 面板内播放条（非全局悬浮，占页面底部一行） ---------- */
    .nm-dock-root.is-inline{
      flex:none;position:relative;z-index:6;width:100%;
      border-top:1px solid var(--nm-line);
      background:color-mix(in srgb,var(--nm-l1) 92%,transparent);
      backdrop-filter:blur(22px) saturate(170%);-webkit-backdrop-filter:blur(22px) saturate(170%);
    }
    .nm-dock{position:relative;display:flex;align-items:center}
    .nm-dock.is-inline{width:100%;height:72px;background:none;border:0;box-shadow:none;border-radius:0}
    .nm-dock-inner{display:flex;align-items:center;gap:14px;width:100%;min-width:0;height:100%;
      max-width:1480px;margin:0 auto;padding:0 28px}
    .nm-dock-info{
      display:flex;align-items:center;gap:11px;min-width:0;flex:0 1 232px;
      background:none;border:0;padding:0;cursor:pointer;text-align:left;
    }
    .nm-dock-cover{
      position:relative;width:44px;height:44px;border-radius:12px;overflow:hidden;flex:none;
      box-shadow:0 6px 16px -6px rgba(0,0,0,.5);
    }
    .nm-dock-cover.is-playing::after{
      content:"";position:absolute;inset:-2px;border-radius:14px;pointer-events:none;
      box-shadow:0 0 0 0 var(--nm-accent-line);animation:nm-pulse 2.2s ease-out infinite;
    }
    .nm-dock-text{min-width:0;display:flex;flex-direction:column;gap:1px}
    .nm-dock-name{font-size:13px;font-weight:650;letter-spacing:-.01em;color:var(--nm-t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-dock-artist{font-size:11px;color:var(--nm-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-dock-artist.is-error{color:var(--nm-error)}
    .nm-dock-center{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:2px}
    .nm-dock-controls{display:flex;align-items:center;justify-content:center;gap:10px}
    .nm-dock .nm-dock-play{
      width:36px;height:36px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;
      background:var(--nm-accent);color:var(--nm-on-accent);flex:none;
      transition:transform 160ms ease,background 160ms ease,box-shadow 160ms ease;
      box-shadow:0 8px 18px -8px color-mix(in srgb,var(--nm-accent) 80%,transparent);
    }
    .nm-dock .nm-dock-play:hover{transform:scale(1.06);background:color-mix(in srgb,var(--nm-accent) 88%,#000)}
    .nm-dock .nm-dock-play:active{transform:scale(.96)}
    .nm-dock .nm-dock-play .nm-spinner{border-color:color-mix(in srgb,var(--nm-on-accent) 34%,transparent);border-top-color:var(--nm-on-accent)}
    .nm-progress-wrap{display:flex;align-items:center;gap:9px;min-width:0;padding:0 2px}
    .nm-progress-time{font-size:10.5px;color:var(--nm-t3);font-variant-numeric:tabular-nums;width:38px;flex:none;text-align:center}
    .nm-progress-time.is-right{text-align:center}
    .nm-dock-error{display:flex;align-items:center;justify-content:center;gap:10px;min-height:18px;font-size:11.5px;color:var(--nm-error)}
    .nm-dock-error-text{max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-dock-right{display:flex;align-items:center;gap:6px;flex:none}
    .nm-dock-volume{display:flex;align-items:center;gap:2px}
    .nm-dock-queue-btn{position:relative}
    .nm-dock-queue-btn.is-on{background:var(--nm-fill2);color:var(--nm-t1)}
    .nm-dock-queue-count{
      position:absolute;top:0;right:-2px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;
      background:var(--nm-accent);color:var(--nm-on-accent);font-size:9px;font-weight:700;display:grid;place-items:center;
      font-variant-numeric:tabular-nums;
    }
    .nm-dock-toast{
      position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);
      padding:7px 15px;border-radius:999px;background:var(--nm-t1);color:var(--nm-bg);
      font-size:12px;font-weight:600;box-shadow:var(--nm-shadow-pop);animation:nm-fade .2s ease both;
      pointer-events:none;white-space:nowrap;
    }
    .nm-slider{position:relative;flex:1;min-width:0;height:22px;display:flex;align-items:center;cursor:pointer;touch-action:none;outline:none}
    .nm-slider-rail{position:relative;width:100%;height:4px;border-radius:999px;background:color-mix(in srgb,var(--nm-t1) 16%,transparent);transition:height 160ms ease}
    .nm-slider-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--nm-accent);transition:background 160ms ease}
    .nm-slider-thumb{
      position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:var(--nm-t1);
      transform:translate(-50%,-50%) scale(0);transition:transform 160ms ease;box-shadow:0 1px 4px rgba(0,0,0,.3);
    }
    .nm-slider:hover .nm-slider-rail,.nm-slider.is-dragging .nm-slider-rail,.nm-slider:focus-visible .nm-slider-rail{height:6px}
    .nm-slider:hover .nm-slider-thumb,.nm-slider.is-dragging .nm-slider-thumb,.nm-slider:focus-visible .nm-slider-thumb{transform:translate(-50%,-50%) scale(1)}
    .nm-slider-thumb{background:var(--nm-accent)}
    .nm-dock:hover .nm-slider-rail{background:color-mix(in srgb,var(--nm-t1) 22%,transparent)}
    .nm-volume-slider{width:64px;flex:0 0 64px;height:16px}
    .nm-volume-slider .nm-slider-rail{height:3px}
    .nm-volume-slider:hover .nm-slider-rail,.nm-volume-slider.is-dragging .nm-slider-rail{height:4px}

    /* ---------- 音质菜单 ---------- */
    .nm-dock-quality-anchor,.nm-np-quality-anchor{position:relative;display:flex;align-items:center}
    .nm-dock-quality-btn{
      display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:999px;
      border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-l1) 55%,transparent);
      color:var(--nm-t2);font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap;
      transition:background 160ms ease,color 160ms ease,border-color 160ms ease;
    }
    .nm-dock-quality-btn:hover,.nm-dock-quality-btn.is-on{background:var(--nm-fill2);color:var(--nm-t1);border-color:var(--nm-line)}
    .nm-dock-quality-text{max-width:72px;overflow:hidden;text-overflow:ellipsis}
    .nm-quality-menu{
      position:absolute;z-index:40;width:264px;padding:8px;border-radius:16px;
      border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-l2) 96%,transparent);
      box-shadow:var(--nm-shadow-pop);backdrop-filter:blur(26px) saturate(170%);
      -webkit-backdrop-filter:blur(26px) saturate(170%);animation:nm-fade .16s ease both;
    }
    .nm-quality-menu.is-dock{bottom:calc(100% + 10px);right:0}
    .nm-quality-menu.is-np{top:calc(100% + 10px);right:0}
    .nm-quality-head{padding:8px 10px 10px;border-bottom:1px solid var(--nm-line2);margin-bottom:6px}
    .nm-quality-title{font-size:12px;font-weight:700;letter-spacing:-.01em}
    .nm-quality-actual{font-size:10.5px;color:var(--nm-t3);margin-top:2px}
    .nm-quality-option{
      display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:0;border-radius:10px;
      background:none;cursor:pointer;text-align:left;color:var(--nm-t1);
    }
    .nm-quality-option:hover{background:var(--nm-fill)}
    .nm-quality-option.is-active{background:color-mix(in srgb,var(--nm-accent) 9%,transparent)}
    .nm-quality-labels{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
    .nm-quality-name{font-size:12.5px;font-weight:600}
    .nm-quality-sub{font-size:10.5px;color:var(--nm-t3)}
    .nm-quality-tag{
      flex:none;font-size:9.5px;font-weight:700;color:var(--nm-accent);
      background:var(--nm-accent-soft);border:1px solid var(--nm-accent-line);
      border-radius:999px;padding:1px 6px;white-space:nowrap;
    }
    .nm-quality-option .nm-ico{color:var(--nm-accent)}

    /* ---------- 全屏播放页（Now Playing） ---------- */
    .nm-np{
      position:relative;height:100%;min-height:100%;display:flex;flex-direction:column;
      padding:calc(var(--dsh-frame-top-clearance,48px) + 6px) 30px 16px;
      color:var(--nm-t1);overflow:hidden;
    }
    .nm-np-bg{
      position:absolute;inset:-80px;z-index:0;background-size:cover;background-position:center;
      background-color:#2a1116;
      filter:blur(56px) saturate(1.15) brightness(.74);
      transform:scale(1.14);pointer-events:none;
    }
    [data-ds-dark-theme] .nm-np-bg{filter:blur(56px) saturate(1.1) brightness(.5)}
    @media (prefers-color-scheme:dark){.nm-np-bg{filter:blur(56px) saturate(1.1) brightness(.5)}}
    .nm-np-scrim{
      position:absolute;inset:0;z-index:0;pointer-events:none;
      background:
        radial-gradient(90% 80% at 18% 0%,color-mix(in srgb,var(--nm-accent) 16%,transparent),transparent 62%),
        linear-gradient(180deg,color-mix(in srgb,var(--nm-bg) 42%,transparent),color-mix(in srgb,var(--nm-bg) 78%,transparent) 52%,var(--nm-bg) 100%);
    }
    .nm-np-top{position:relative;z-index:2;display:flex;align-items:center;gap:14px;flex:none;padding-bottom:6px;flex-wrap:wrap}
    .nm-np-back{flex:none}
    .nm-np-brand{display:flex;align-items:center;gap:9px;min-width:0}
    .nm-np-logo{width:24px;height:24px;border-radius:6px;display:block;flex:none;box-shadow:0 4px 12px -6px color-mix(in srgb,var(--nm-accent) 70%,transparent)}
    .nm-np-brand-name{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--nm-t3);white-space:nowrap}
    .nm-np-top-tools{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .nm-np-mode-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;border-radius:999px;
      border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-l1) 55%,transparent)}
    .nm-np-mode-btn{
      display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 13px;border:0;border-radius:999px;
      background:none;color:var(--nm-t2);font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;
      transition:background 160ms ease,color 160ms ease;
    }
    .nm-np-mode-btn:hover{color:var(--nm-t1)}
    .nm-np-mode-btn.is-active{background:var(--nm-l2);color:var(--nm-t1);box-shadow:0 2px 8px rgba(0,0,0,.16)}
    .nm-np-quality-btn{max-width:220px}
    .nm-np-quality-btn span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px}
    .nm-np-stage{position:relative;z-index:2;flex:1;min-height:0;display:flex;flex-direction:column;padding-top:8px}
    .nm-np-stage.is-vinyl{align-items:center;justify-content:center;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}
    .nm-np-vinyl-col{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;padding:4px 0 6px}
    .nm-np-art{display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer;outline:none;border-radius:50%}
    .nm-np-meta{min-width:0;text-align:center;max-width:640px;width:100%}
    .nm-np-eyebrow{display:flex;align-items:center;justify-content:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--nm-t3)}
    .nm-np-eyebrow-dot{width:5px;height:5px;border-radius:50%;background:var(--nm-accent);box-shadow:0 0 8px var(--nm-accent)}
    .nm-np-title{
      margin:7px 0 0;font-size:clamp(22px,2.7vw,34px);line-height:1.12;font-weight:750;letter-spacing:-.03em;
      word-break:break-word;
    }
    .nm-np-sub{margin-top:7px;font-size:13px;color:var(--nm-t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-np-album{margin-top:2px;font-size:11.5px;color:var(--nm-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-np-controls{display:flex;align-items:center;justify-content:center;gap:22px;flex:none}
    .nm-np-ctrl{width:44px;height:44px;color:var(--nm-t2)}
    .nm-np-ctrl:hover{color:var(--nm-t1)}
    .nm-np-play{
      width:60px;height:60px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;flex:none;
      background:var(--nm-accent);color:var(--nm-on-accent);
      box-shadow:0 16px 34px -14px color-mix(in srgb,var(--nm-accent) 85%,transparent);
      transition:transform 160ms ease,background 160ms ease;
    }
    .nm-np-play:hover{transform:scale(1.05);background:color-mix(in srgb,var(--nm-accent) 88%,#000)}
    .nm-np-play:active{transform:scale(.97)}
    .nm-np-play.is-compact{width:42px;height:42px}
    .nm-np-play .nm-spinner{border-color:color-mix(in srgb,var(--nm-on-accent) 34%,transparent);border-top-color:var(--nm-on-accent)}
    .nm-np-controls.is-compact{gap:14px}
    .nm-np-controls.is-compact .nm-np-ctrl{width:34px;height:34px}
    .nm-np-progress{display:flex;align-items:center;gap:12px;width:100%;max-width:560px;flex:none}
    .nm-np-tools{display:flex;align-items:center;justify-content:center;gap:9px;flex:none;color:var(--nm-t3);min-width:0;max-width:100%}
    .nm-np-volume{width:120px;flex:0 0 120px}
    .nm-np-quality-hint{
      font-size:10.5px;color:var(--nm-t3);border:1px solid var(--nm-line2);border-radius:999px;
      padding:2px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;
    }
    .nm-np-stage.is-lyrics{flex:1;min-height:0;padding-top:2px}
    .nm-np-lyrics-head{display:flex;align-items:center;gap:8px;padding:2px 0 6px;flex:none;max-width:1200px;width:100%;margin:0 auto}
    .nm-np-lyrics-title{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--nm-t3)}
    .nm-np-lyrics-badge{
      font-size:9.5px;font-weight:700;color:var(--nm-accent);background:var(--nm-accent-soft);
      border:1px solid var(--nm-accent-line);border-radius:999px;padding:1px 7px;
    }
    .nm-np-lyrics{
      flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth;
      padding:10px max(10vw,60px) 28%;scrollbar-width:thin;max-width:1200px;width:100%;margin:0 auto;
    }
    .nm-np-stage.is-lyrics .nm-lyric-line{max-width:100%;padding:10px 4px}
    .nm-np-stage.is-lyrics .nm-lyric-text{font-size:clamp(17px,1.9vw,23px);font-weight:600;line-height:1.5}
    .nm-np-stage.is-lyrics .nm-lyric-translation{font-size:clamp(11.5px,1.2vw,14px);margin-top:2px}
    .nm-np-stage.is-lyrics .nm-lyric-line.is-active{color:var(--nm-t1)}
    .nm-np-stage.is-lyrics .nm-lyric-line.is-active .nm-lyric-text{color:var(--nm-accent);font-size:clamp(20px,2.3vw,28px);font-weight:750}
    .nm-np-stage.is-lyrics .nm-lyric-line.is-active .nm-lyric-translation{color:color-mix(in srgb,var(--nm-accent) 60%,var(--nm-t2))}
    .nm-np-lyrics-bar{
      flex:none;width:100%;max-width:1200px;margin:0 auto;padding:6px max(10vw,60px) 4px;
      display:flex;flex-direction:column;gap:6px;
    }
    .nm-np-lyrics-bar .nm-np-progress{max-width:none}
    .nm-lyric-line{
      display:flex;flex-direction:column;gap:3px;padding:9px 12px;border-radius:12px;
      color:var(--nm-t3);cursor:pointer;outline:none;transition:color .18s ease,background .18s ease;
    }
    .nm-lyric-line:hover{background:color-mix(in srgb,var(--nm-t1) 5%,transparent)}
    .nm-lyric-text{font-size:15px;font-weight:600;line-height:1.45;letter-spacing:-.012em;transition:color .18s ease,font-size .18s ease}
    .nm-lyric-translation{font-size:12px;line-height:1.4;color:var(--nm-t3)}
    .nm-lyric-line.is-active{color:var(--nm-t1)}
    .nm-lyric-line.is-active .nm-lyric-text{color:var(--nm-accent);font-size:17px;font-weight:750}
    .nm-lyric-line.is-active .nm-lyric-translation{color:color-mix(in srgb,var(--nm-accent) 60%,var(--nm-t2))}
    .nm-np-lyrics-note{height:100%;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center;color:var(--nm-t3);font-size:12.5px;padding:20px}
    .nm-np-lyrics-note-title{font-size:15px;font-weight:650;color:var(--nm-t2)}
    .nm-np-lyrics-note-sub{font-size:11.5px;color:var(--nm-t3)}


    /* ---------- 黑胶 ---------- */
    .nm-vinyl-wrap{position:relative;width:min(40vh,360px);max-width:100%;aspect-ratio:1;flex:none;display:grid;place-items:center}
    .nm-vinyl{
      position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;
      clip-path:circle(50% at 50% 50%);
      background:
        radial-gradient(circle at 50% 46%,#232325 0 30%,#141416 58%,#0c0c0d 100%);
      box-shadow:0 34px 80px -34px rgba(0,0,0,.85),inset 0 0 0 1px rgba(255,255,255,.07);
      animation:nm-vinyl-spin 24s linear infinite;animation-play-state:paused;
    }
    .nm-vinyl.is-spinning{animation-play-state:running}
    .nm-vinyl-disc{
      position:absolute;inset:0;border-radius:50%;overflow:hidden;clip-path:circle(50% at 50% 50%);
    }
    .nm-vinyl-grooves{
      position:absolute;inset:3.5%;border-radius:50%;pointer-events:none;
      background:repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.055) 0 1px,rgba(255,255,255,0) 1px 4px);
    }
    .nm-vinyl-label{
      position:absolute;left:50%;top:50%;width:58%;aspect-ratio:1;transform:translate(-50%,-50%);
      border-radius:50%;overflow:hidden;clip-path:circle(50% at 50% 50%);
      border:2px solid rgba(255,255,255,.1);
      box-shadow:0 6px 18px rgba(0,0,0,.55);
    }
    .nm-vinyl-label .nm-cover,
    .nm-vinyl-label .nm-cover img{
      width:100%;height:100%;border-radius:50%;overflow:hidden;clip-path:circle(50% at 50% 50%);object-fit:cover;
    }
    .nm-vinyl-hole{
      position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:50%;transform:translate(-50%,-50%);
      background:var(--nm-bg);box-shadow:0 0 0 1px rgba(0,0,0,.55),0 0 0 5px rgba(0,0,0,.28);
    }
    .nm-tonearm{
      position:absolute;right:-2%;top:-3%;width:46%;height:52%;pointer-events:none;
      transform-origin:88% 14%;transition:transform .7s cubic-bezier(.2,.7,.3,1);transform:rotate(-6deg);
    }
    .nm-tonearm.is-on{transform:rotate(4deg)}
    .nm-tonearm-base{
      position:absolute;right:6%;top:2%;width:20%;aspect-ratio:1;border-radius:50%;
      background:linear-gradient(140deg,#efeff1,#9b9ba1);box-shadow:0 4px 10px rgba(0,0,0,.5);
    }
    .nm-tonearm-arm{
      position:absolute;right:16%;top:13%;width:3px;height:54%;border-radius:2px;
      background:linear-gradient(180deg,#f2f2f4,#8c8c92);transform-origin:top center;transform:rotate(24deg);
    }
    .nm-tonearm-head{
      position:absolute;right:29%;top:60%;width:15%;height:8%;border-radius:4px;
      background:linear-gradient(140deg,#3a3a3e,#19191b);transform:rotate(24deg);
    }

    /* ---------- 播放队列 ---------- */
    .nm-queue{
      position:absolute;bottom:calc(100% + 12px);left:50%;transform:translateX(-50%);z-index:30;
      width:min(540px,calc(100vw - 40px));max-height:min(52vh,420px);
      display:flex;flex-direction:column;overflow:hidden;border-radius:20px;
      border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-ov) 88%,transparent);
      box-shadow:var(--nm-shadow-pop);backdrop-filter:blur(26px) saturate(170%);
      -webkit-backdrop-filter:blur(26px) saturate(170%);pointer-events:auto;animation:nm-fade .2s ease both;
    }
    .nm-queue-head{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--nm-line2);flex:none}
    .nm-queue-title{display:flex;align-items:baseline;gap:8px;font-size:13.5px;font-weight:700;letter-spacing:-.01em}
    .nm-queue-count{font-size:11px;font-weight:500;color:var(--nm-t3);font-variant-numeric:tabular-nums}
    .nm-queue-head .nm-icon-btn{margin-left:auto}
    .nm-queue-list{overflow-y:auto;padding:6px;scrollbar-width:thin}
    .nm-queue-row{
      display:flex;align-items:center;gap:11px;width:100%;padding:7px 9px;border:0;border-radius:10px;
      background:none;cursor:pointer;text-align:left;color:var(--nm-t1);
    }
    .nm-queue-row:hover{background:var(--nm-fill)}
    .nm-queue-row.is-active{background:color-mix(in srgb,var(--nm-accent) 10%,transparent)}
    .nm-queue-row .nm-cover{width:34px;height:34px;border-radius:8px;flex:none}
    .nm-queue-idx{width:17px;flex:none;font-size:11px;color:var(--nm-t3);text-align:center;font-variant-numeric:tabular-nums}
    .nm-queue-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}
    .nm-queue-name{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-queue-row.is-active .nm-queue-name{color:var(--nm-accent)}
    .nm-queue-artist{font-size:11px;color:var(--nm-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-queue-dur{font-size:11px;color:var(--nm-t3);font-variant-numeric:tabular-nums;flex:none}
    .nm-queue-empty{padding:26px;text-align:center;font-size:12px;color:var(--nm-t3)}

    /* ---------- 侧栏迷你播放器（与侧栏其他行同宽、扁平卡片） ---------- */
    .nm-mini{
      position:relative;display:flex;flex-direction:column;gap:2px;
      width:100%;max-width:none;box-sizing:border-box;height:auto;min-height:78px;
      padding:5px 10px 6px;border-radius:10px;border:1px solid var(--nm-line2);
      background:color-mix(in srgb,var(--nm-t1) 4%,transparent);
      overflow:visible;color:var(--nm-t1);text-align:left;
    }
    [data-ds-dark-theme] .nm-mini{background:color-mix(in srgb,var(--nm-t1) 6%,transparent)}
    .nm-mini:hover{background:color-mix(in srgb,var(--nm-t1) 8%,transparent)}
    .nm-mini-top{display:flex;align-items:center;gap:8px;min-width:0;flex:none;height:38px}
    .nm-mini-cover-btn{display:block;flex:none;background:none;border:0;padding:0;cursor:pointer;border-radius:9px;overflow:hidden;width:38px;height:38px}
    .nm-mini-cover{display:block;width:38px;height:38px;border-radius:9px;overflow:hidden;flex:none;box-shadow:0 3px 8px -4px rgba(0,0,0,.5)}
    .nm-mini-text{
      flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:1px;
      background:none;border:0;padding:0;cursor:pointer;text-align:left;color:inherit;overflow:hidden;
    }
    .nm-mini-name{font-size:11.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}
    .nm-mini-artist{font-size:10px;color:var(--nm-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}
    .nm-mini-controls{
      display:flex;align-items:center;justify-content:center;gap:36px;
      flex:none;width:100%;padding:0;margin-top:1px;min-width:0;
    }
    .nm-mini-ctrl{
      width:28px;height:28px;border:0;border-radius:7px;background:none;padding:0;
      display:grid;place-items:center;color:var(--nm-t2);cursor:pointer;flex:none;
    }
    .nm-mini-ctrl:hover{background:var(--nm-fill);color:var(--nm-t1)}
    .nm-mini-toggle{
      width:32px;height:32px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;flex:none;
      background:var(--nm-accent);color:var(--nm-on-accent);
      box-shadow:0 4px 12px -6px color-mix(in srgb,var(--nm-accent) 80%,transparent);
    }
    .nm-mini-toggle:hover{background:color-mix(in srgb,var(--nm-accent) 88%,#000)}
    .nm-mini-volume-wrap{position:relative;display:flex;align-items:center;flex:none;margin-left:auto}
    .nm-mini-volume-btn{width:28px;height:28px}
    .nm-mini-volume-pop{
      position:absolute;right:0;bottom:calc(100% + 6px);width:132px;padding:8px 10px;
      border-radius:10px;border:1px solid var(--nm-line);background:color-mix(in srgb,var(--nm-l2) 96%,transparent);
      box-shadow:var(--nm-shadow-pop);backdrop-filter:blur(18px);
      opacity:0;visibility:hidden;transform:translateY(3px);pointer-events:none;
      transition:opacity 140ms ease,transform 140ms ease,visibility 140ms;
      z-index:20;
    }
    .nm-mini-volume-wrap:hover .nm-mini-volume-pop,
    .nm-mini-volume-wrap:focus-within .nm-mini-volume-pop{
      opacity:1;visibility:visible;transform:none;pointer-events:auto;
    }
    .nm-mini-volume-slider{flex:0 0 auto;width:100%;height:14px}
    .nm-mini-progress{position:absolute;left:1px;right:1px;bottom:0;height:2px;border-radius:0 0 8px 8px;background:color-mix(in srgb,var(--nm-t1) 12%,transparent);overflow:hidden}
    .nm-mini-progress>i{display:block;height:100%;background:var(--nm-accent);border-radius:0 2px 2px 0}
    .nm-mini.is-rail{width:34px;max-width:34px;height:38px;padding:3px;justify-content:center;gap:0;border-radius:9px;overflow:hidden}
    .nm-mini.is-rail .nm-mini-cover{width:28px;height:28px;border-radius:7px}
    .nm-mini.is-rail .nm-mini-progress{left:3px;right:3px;bottom:2px;border-radius:2px}

    /* ---------- 登录 Modal ---------- */
    .nm-modal-root{
      position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:22px;
      background:rgba(0,0,0,.52);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      animation:nm-fade .2s ease both;
    }
    .nm-modal{
      position:relative;width:min(390px,100%);max-height:calc(100vh - 44px);overflow-y:auto;
      padding:26px 26px 20px;border-radius:26px;border:1px solid var(--nm-line);
      background:color-mix(in srgb,var(--nm-ov) 94%,transparent);
      box-shadow:0 40px 90px -30px rgba(0,0,0,.65);
      backdrop-filter:blur(30px) saturate(170%);-webkit-backdrop-filter:blur(30px) saturate(170%);
      animation:nm-pop .24s cubic-bezier(.2,.8,.3,1) both;
      scrollbar-width:thin;
    }
    .nm-modal-close{position:absolute;top:14px;right:14px}
    .nm-modal-head{text-align:center;padding:4px 8px 0}
    .nm-modal-eyebrow{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;letter-spacing:.14em;color:var(--nm-accent)}
    .nm-modal-title{margin:9px 0 0;font-size:21px;font-weight:750;letter-spacing:-.03em}
    .nm-modal-desc{margin:5px 0 0;font-size:12px;color:var(--nm-t3)}
    .nm-qr-wrap{display:flex;justify-content:center;padding:20px 0 6px}
    .nm-qr-frame{
      position:relative;width:196px;height:196px;border-radius:18px;overflow:hidden;background:#fff;
      border:1px solid var(--nm-line);box-shadow:0 18px 40px -20px rgba(0,0,0,.4);
    }
    .nm-qr-frame img{width:100%;height:100%;object-fit:contain;display:block;padding:8px}
    .nm-qr-veil{
      position:absolute;inset:0;display:grid;place-items:center;background:rgba(255,255,255,.88);
      color:var(--nm-accent);backdrop-filter:blur(2px);
    }
    .nm-qr-veil.ok{background:rgba(255,255,255,.9);color:var(--nm-success)}
    .nm-qr-veil.expired{padding:14px;text-align:center}
    .nm-qr-veil.expired .nm-btn{background:#fff;border-color:rgba(0,0,0,.12);color:#1d1d1f}
    .nm-qr-skel{position:relative;width:196px;height:196px;border-radius:18px;overflow:hidden;display:grid;place-items:center}
    .nm-qr-skel-ring{position:absolute;inset:0;display:grid;place-items:center;color:var(--nm-t3)}
    .nm-qr-error{display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px;text-align:center}
    .nm-qr-error p{margin:0;font-size:12px;color:var(--nm-t2);max-width:30ch}
    .nm-login-state{
      display:flex;align-items:center;justify-content:center;gap:7px;margin:12px auto 0;
      min-height:30px;padding:0 15px;width:fit-content;max-width:100%;border-radius:999px;
      border:1px solid var(--nm-line2);background:var(--nm-fill);font-size:12px;font-weight:600;color:var(--nm-t2);
    }
    .nm-login-dot{width:6px;height:6px;border-radius:50%;background:var(--nm-t3);flex:none}
    .nm-login-state.waiting .nm-login-dot{background:var(--nm-warn);animation:nm-blink 1.6s ease infinite}
    .nm-login-state.scanned{border-color:var(--nm-accent-line);color:var(--nm-t1)}
    .nm-login-state.scanned .nm-login-dot{background:var(--nm-accent);animation:nm-blink 1.2s ease infinite}
    .nm-login-state.ok{border-color:color-mix(in srgb,var(--nm-success) 34%,transparent);color:var(--nm-success)}
    .nm-login-state.ok .nm-login-dot{background:var(--nm-success)}
    .nm-login-state.expired{border-color:color-mix(in srgb,var(--nm-error) 30%,transparent);color:var(--nm-error)}
    .nm-login-state.expired .nm-login-dot{background:var(--nm-error)}
    .nm-login-state-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm-login-user{color:var(--nm-t3);font-weight:500;white-space:nowrap}
    .nm-modal-tip{margin:14px 0 0;text-align:center;font-size:11px;color:var(--nm-t3);line-height:1.5}
    .nm-modal-secure{margin:6px 0 0;text-align:center;font-size:10.5px;color:var(--nm-t3);opacity:.75}

    /* ---------- 轻提示 ---------- */
    .nm-toast{
      position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:40;
      padding:8px 16px;border-radius:999px;background:var(--nm-t1);color:var(--nm-bg);
      font-size:12px;font-weight:600;box-shadow:var(--nm-shadow-pop);animation:nm-fade .2s ease both;
      max-width:calc(100vw - 40px);text-align:center;
    }
    .nm-panel-icon{display:block;object-fit:contain;background:transparent;border-radius:23.5%;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,.32))}
    .nm-panel-icon.is-active{box-shadow:0 0 0 2px color-mix(in srgb,#ec4141 42%,transparent),0 3px 10px -2px rgba(236,65,65,.55)}

    /* ---------- 动效 ---------- */
    @keyframes nm-spin{to{transform:rotate(360deg)}}
    @keyframes nm-fade{from{opacity:0}to{opacity:1}}
    @keyframes nm-pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
    @keyframes nm-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
    @keyframes nm-blink{0%,100%{opacity:1}50%{opacity:.35}}
    @keyframes nm-wave{0%,100%{height:4px}50%{height:15px}}
    @keyframes nm-pulse{0%{box-shadow:0 0 0 0 var(--nm-accent-line)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
    @keyframes nm-vinyl-spin{to{transform:rotate(360deg)}}

    /* ---------- 响应式 ---------- */
    @media (max-width:1180px){
      .nm-grid{grid-template-columns:repeat(auto-fill,minmax(156px,1fr))}
      .nm-search{width:210px}
      .nm-search:focus-within{width:250px}
    }
    @media (max-width:1020px){
      .nm-hero{grid-template-columns:minmax(0,1fr) minmax(0,300px);padding:28px 28px;gap:20px}
      .nm-track{grid-template-columns:36px 40px minmax(0,1.7fr) 52px 66px}
      .nm-track-album{display:none}
      .nm-dock-info{flex-basis:190px}
    }
    @media (max-width:900px){
      .nm-dock-volume{display:none}
      .nm-hero-title{max-width:20ch}
      .nm-detail-desc{-webkit-line-clamp:2}
    }
    @media (max-width:900px){
      .nm-carousel-card{min-height:252px;padding:24px 24px 24px 60px}
      .nm-carousel-copy{max-width:62%}
      .nm-carousel-collage{width:38%;right:3%}
      .nm-carousel-title{font-size:clamp(24px,3.4vw,32px)}
    }
    @media (max-width:820px){
      .nm-hero{grid-template-columns:minmax(0,1fr);padding:26px 24px}
      .nm-hero-art{max-width:230px;justify-self:start;margin-top:6px}
      .nm-hero-title{font-size:clamp(27px,6vw,34px)}
      .nm-hero-desc{max-width:56ch}
      .nm-search{width:190px}
      .nm-search:focus-within{width:210px}
    }
    @media (max-width:768px){
      .nm-carousel-head{flex-wrap:wrap;gap:10px}
      .nm-carousel-card{min-height:224px;padding:20px 18px 20px 54px}
      .nm-carousel-copy{max-width:70%}
      .nm-carousel-collage{width:46%;right:-8%;opacity:.5}
      .nm-carousel-title{font-size:clamp(23px,5.2vw,30px)}
      .nm-carousel-desc{font-size:12px;margin-top:8px}
      .nm-carousel-cta{height:32px;margin-top:14px;padding:0 14px;font-size:12px}
      .nm-carousel-arrow{width:32px;height:32px}
      .nm-carousel-arrow.is-prev{left:8px}
      .nm-carousel-arrow.is-next{right:8px}
      .nm-carousel-dots{bottom:12px}
      .nm-carousel-eyebrow{display:none}
    }
    @media (max-width:520px){
      .nm-carousel-card{min-height:206px;padding:18px 14px 18px 46px}
      .nm-carousel-copy{max-width:78%}
      .nm-carousel-collage{width:52%;right:-16%;opacity:.32}
      .nm-carousel-title{font-size:22px}
      .nm-carousel-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .nm-carousel-dots{bottom:9px;gap:5px;padding:4px 7px}
    }
    @media (max-width:768px){

      .nm-wrap{padding:0 18px}
      .nm-header{padding:0 18px}
      .nm-header-row{flex-wrap:wrap;gap:8px}
      .nm-header-tools{flex-wrap:wrap;justify-content:flex-end;gap:6px}
      .nm-search{order:5;flex:1 1 100%;width:100%}
      .nm-search:focus-within{width:100%}
      .nm-account-name{display:none}
      .nm-brand-title{font-size:15.5px}
      .nm-tab{font-size:13px;padding:9px 11px}
      .nm-grid{grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:20px 14px}
      .nm-grid-artists{grid-template-columns:repeat(auto-fill,minmax(104px,1fr))}
      .nm-card.is-rail{flex:0 0 112px}
      .nm-detail-row{flex-direction:column;align-items:flex-start;gap:18px}
      .nm-detail-art{width:150px}
      .nm-detail-title{font-size:26px}
      .nm-track{grid-template-columns:30px 38px minmax(0,1fr) 48px 56px;gap:9px;height:54px;padding:0 8px 0 2px}
      .nm-track-cover{width:38px;height:38px}
      .nm-track-actions{opacity:1}
      .nm-track-add{display:none}
      .nm-dock.is-inline{height:66px}
      .nm-dock-inner{padding:0 18px;gap:8px}
      .nm-dock-info{flex:0 1 150px}
      .nm-dock-cover{width:36px;height:36px;border-radius:10px}
      .nm-dock-name{font-size:12px}
      .nm-dock-artist{font-size:10px}
      .nm-dock-controls{gap:5px}
      .nm-dock-play{width:32px;height:32px}
      .nm-dock-play .nm-ico{width:15px;height:15px}
      .nm-dock-right{gap:1px}
      .nm-dock-right .nm-icon-btn{width:26px;height:26px}
      .nm-dock-quality-btn{height:26px;padding:0 8px}
      .nm-dock-quality-text{display:none}
      .nm-progress-wrap{gap:6px}
      .nm-progress-time{width:30px;font-size:9.5px}
      .nm-search-view{padding-top:14px}
      .nm-engine{padding:16px 16px 15px}
      .nm-engine-codewrap{flex-direction:column;gap:8px}
      .nm-engine-copy{align-self:flex-start}
      .nm-login-banner{flex-wrap:wrap}
      .nm-login-banner .nm-btn{margin-left:54px}
      .nm-modal{width:100%;padding:22px 18px 18px;border-radius:22px}
      .nm-toast{bottom:84px}
      .nm-skel-detail{flex-direction:column}
      .nm-skel-detail .nm-skel{width:150px !important;height:150px !important}
    }
    @media (max-width:520px){
      .nm-wrap{padding:0 14px}
      .nm-header{padding:0 14px}
      .nm-dock-inner{padding:0 14px}
      .nm-brand-sub{display:none}
      .nm-hero{padding:22px 18px;border-radius:22px}
      .nm-hero-art{max-width:190px}
      .nm-section{margin-top:28px}
      .nm-section-titles h2{font-size:18px}
      .nm-track{grid-template-columns:26px 36px minmax(0,1fr) 44px;gap:8px}
      .nm-track-time{display:none}
      .nm-track-actions{display:none}
      .nm-dock-info{flex-basis:112px}
      .nm-dock-cover{width:32px;height:32px;border-radius:9px}
      .nm-dock-name{max-width:120px;font-size:11.5px}
      .nm-volume-slider{display:none}
      .nm-dock-right .nm-icon-btn{width:24px;height:24px}
      .nm-dock-quality-btn{padding:0 7px;height:24px}
      .nm-progress-time{width:28px;font-size:9px}
      .nm-login-banner .nm-btn{margin-left:0;width:100%;justify-content:center}
      .nm-pill-tab{padding:6px 11px}
    }
    @media (max-width:1080px){
      .nm-vinyl-wrap{width:min(36vh,320px)}
    }
    @media (max-width:900px){
      .nm-np{overflow-y:auto;padding:calc(var(--dsh-frame-top-clearance,48px) + 2px) 20px 18px}
      .nm-np-vinyl-col{justify-content:flex-start;gap:11px;padding-top:6px}
      .nm-vinyl-wrap{width:min(30vh,270px)}
      .nm-np-lyrics{padding:8px 22px 26%}
      .nm-np-lyrics-head{padding:2px 22px 6px}
      .nm-np-lyrics-bar{padding:6px 22px 4px}
    }
    @media (max-width:768px){
      .nm-np{padding:calc(var(--dsh-frame-top-clearance,48px) + 2px) 16px 14px}
      .nm-np-brand-name{display:none}
      .nm-np-top{gap:8px}
      .nm-np-mode-btn{padding:0 10px;font-size:11px}
      .nm-np-title{font-size:23px}
      .nm-np-controls{gap:16px}
      .nm-np-stage.is-lyrics .nm-lyric-text{font-size:17px}
      .nm-np-stage.is-lyrics .nm-lyric-line.is-active .nm-lyric-text{font-size:21px}
      .nm-np-play{width:54px;height:54px}
      .nm-np-ctrl{width:38px;height:38px}
      .nm-np-volume{width:84px;flex:0 0 84px}
      .nm-np-quality-btn{max-width:160px}
    }
    @media (max-width:520px){
      .nm-np{padding-left:12px;padding-right:12px}
      .nm-np-quality-btn{padding:0 9px;max-width:44px}
      .nm-np-quality-btn span{display:none}
      .nm-np-quality-hint{display:none}
      .nm-np-tools{gap:6px}
      .nm-np-mode-btn{padding:0 8px;font-size:10.5px}
      .nm-np-title{font-size:21px}
      .nm-np-lyrics-head{padding:13px 16px 8px}
    }
    @media (prefers-reduced-motion:reduce){
      .nm-root *,.nm-dock-root *,.nm-modal-root *{
        animation-duration:.001ms !important;animation-iteration-count:1 !important;
        transition-duration:.001ms !important;
      }
      .nm-vinyl{animation:none !important}
      .nm-tonearm{transition:none !important}
    }
    `

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        layoutService = (ctx && ctx.layout) || null
        const effect = (fn, label) => (typeof ctx.effect === 'function' ? ctx.effect(fn, label) : fn())

        /* 1) 样式 */
        effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-nm-style', '')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => {
            try {
              style.remove()
            } catch (err) {
              /* ignore */
            }
          }
        }, 'netease-music: styles')

        /* 2) 全局 <audio>，挂在 body 上（可被测试与浏览器原生控件感知） */
        effect(() => {
          const audio = document.createElement('audio')
          try { audio.dataset.nmAudioId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 6) } catch (err) { /* ignore */ }
          clientLog('audio:created', { audioId: audio.dataset ? audio.dataset.nmAudioId : null })
          audio.preload = 'metadata'
          audio.setAttribute('data-nm-audio', '')
          audio.style.display = 'none'
          document.body.appendChild(audio)
          player.bindAudio(audio)
          return () => {
            try {
              player.dispose()
            } catch (err) {
              /* ignore */
            }
            try {
              audio.remove()
            } catch (err) {
              /* ignore */
            }
          }
        }, 'netease-music: audio')

        /* 进度条拖动：全局 pointerup / pointercancel 兜底提交 */
        effect(() => {
          const notify = () => notifySeekPointerUp()
          window.addEventListener('pointerup', notify)
          window.addEventListener('pointercancel', notify)
          return () => {
            window.removeEventListener('pointerup', notify)
            window.removeEventListener('pointercancel', notify)
          }
        }, 'netease-music: seek pointer guard')

        /* 2.5) Agent 播放桥：轮询 Host 命令 + 上报播放状态（不依赖面板可见） */
        effect(() => {
          let disposed = false
          let commandCursor = null
          let pollTimer = null
          let stateTimer = null
          let stateDebounce = null
          let lastStateSent = 0
          const controllers = new Set()

          const openController = () => {
            const controller = new AbortController()
            controllers.add(controller)
            return controller
          }
          const closeController = (controller) => {
            controllers.delete(controller)
          }

          const agentAlbum = (track) => {
            const value = track && track.album
            if (typeof value === 'string') return value
            return (value && value.name) || ''
          }

          const normalizeAgentTrack = (raw) => {
            if (!raw || typeof raw !== 'object') return null
            let artists = []
            if (Array.isArray(raw.artists)) {
              artists = raw.artists
                .map((artist) => (typeof artist === 'string' ? { name: artist } : artist))
                .filter((artist) => artist && artist.name)
            } else if (raw.artist) {
              artists = [{ name: String(raw.artist) }]
            }
            const album = agentAlbum(raw)
            const cover = httpsUrl(raw.cover || raw.picUrl || (raw.album && (raw.album.picUrl || raw.album.cover)) || '')
            return Object.assign({}, raw, {
              id: raw.id,
              name: raw.name || raw.title || '',
              artists,
              album,
              cover,
              duration: Number(raw.duration) || 0,
            })
          }

          const normalizeAgentTracks = (list) => toArray(list).map(normalizeAgentTrack).filter(Boolean)

          const handleAgentCommand = (command) => {
            if (!command || typeof command !== 'object') return
            const type = String(command.type || '')
            if (type === 'playQueue') {
              const tracks = normalizeAgentTracks(command.tracks)
              if (!tracks.length) return
              const title = String(command.title || '').trim() || (tracks[0] && tracks[0].name) || translate('player.nowPlaying')
              player.playQueue(tracks, 0, title)
              /* 不切换面板：用户可能正在对话页边工作边听，只给一条轻提示 */
              pushUiToast(translate('toast.agentPlay', { title }))
              return
            }
            if (type === 'control') {
              const action = String(command.action || '')
              if (action === 'pause') player.pause()
              else if (action === 'resume') player.resume()
              else if (action === 'next') player.next(false)
              else if (action === 'prev') player.prev()
              else if (action === 'seek') player.seekSeconds(Math.max(0, Number(command.seconds) || 0) * 1000)
              else if (action === 'volume') player.setVolume(clamp(Number(command.volume), 0, 1))
              return
            }
            if (type === 'refreshLike') {
              applyServerLike(command.id, command.liked === true)
            }
          }

          const delayPoll = () => {
            if (disposed) return
            pollTimer = setTimeout(pollCommands, 1200)
          }

          const pollCommands = () => {
            if (disposed) return
            const controller = openController()
            const suffix = commandCursor === null ? '' : '?cursor=' + encodeURIComponent(String(commandCursor))
            apiGet('/player/commands' + suffix, controller.signal).then((data) => {
              if (disposed) return
              /* 不带 cursor 的首次响应只取基线，避免重放历史命令 */
              const nextCursor = data && Number(data.cursor)
              if (Number.isFinite(nextCursor)) commandCursor = nextCursor
              const commands = Array.isArray(data && data.commands) ? data.commands : []
              commands.forEach((command) => {
                try {
                  handleAgentCommand(command)
                } catch (err) {
                  /* 单条命令失败不影响轮询 */
                }
              })
            }).catch(() => {
              /* 旧 Host 没有该路由 / 网络错误：静默重试 */
            }).then(() => {
              closeController(controller)
              delayPoll()
            })
          }

          const buildPlayerState = () => {
            const snapshot = player.getState()
            const mapTrack = (track) => {
              if (!track) return null
              return {
                id: Number(track.id) || null,
                name: track.name || '',
                artist: trackArtists(track),
                album: agentAlbum(track),
                liked: getLikeCached(track.id),
              }
            }
            return {
              current: mapTrack(snapshot.current),
              playing: !!snapshot.playing,
              loading: !!snapshot.loading,
              position: Math.round(Number(snapshot.position) || 0),
              duration: Math.round(Number(snapshot.duration) || 0),
              quality: snapshot.quality || '',
              actualLevel: snapshot.actualLevel || '',
              queueLength: Array.isArray(snapshot.queue) ? snapshot.queue.length : 0,
              contextTitle: snapshot.contextTitle || '',
              queue: (Array.isArray(snapshot.queue) ? snapshot.queue : []).slice(0, 20).map(mapTrack).filter(Boolean),
            }
          }

          const sendPlayerState = () => {
            if (disposed) return
            lastStateSent = Date.now()
            apiPost('/player/state', buildPlayerState()).catch(() => {
              /* 旧 Host / 网络错误：静默 */
            })
          }

          const schedulePlayerState = () => {
            if (disposed || stateDebounce) return
            const wait = Math.max(0, 800 - (Date.now() - lastStateSent))
            stateDebounce = setTimeout(() => {
              stateDebounce = null
              sendPlayerState()
            }, wait)
          }

          const unsubscribePlayer = player.subscribe(schedulePlayerState)
          const likeListener = () => schedulePlayerState()
          likeListeners.add(likeListener)
          sendPlayerState()
          stateTimer = setInterval(sendPlayerState, 2000)
          pollCommands()

          return () => {
            disposed = true
            if (pollTimer) {
              clearTimeout(pollTimer)
              pollTimer = null
            }
            if (stateTimer) {
              clearInterval(stateTimer)
              stateTimer = null
            }
            if (stateDebounce) {
              clearTimeout(stateDebounce)
              stateDebounce = null
            }
            unsubscribePlayer()
            likeListeners.delete(likeListener)
            Array.from(controllers).forEach((controller) => {
              try {
                controller.abort()
              } catch (err) {
                /* ignore */
              }
            })
            controllers.clear()
          }
        }, 'netease-music: agent player bridge')

        /* 3) 文案：zh / en 注册 + bind；缺失时回退中文常量 */
        effect(() => {
          const locale = ctx.locale
          const disposers = []
          if (locale && typeof locale.register === 'function') {
            try {
              const disposeZh = locale.register(NS, 'zh', ZH)
              if (typeof disposeZh === 'function') disposers.push(disposeZh)
            } catch (err) {
              /* ignore */
            }
            try {
              const disposeEn = locale.register(NS, 'en', EN)
              if (typeof disposeEn === 'function') disposers.push(disposeEn)
            } catch (err) {
              /* ignore */
            }
          }
          if (locale && typeof locale.bind === 'function') {
            let bound = null
            try {
              bound = locale.bind(NS)
            } catch (err) {
              bound = null
            }
            if (typeof bound === 'function') {
              translate = function localizedTranslate(key, params) {
                let text = null
                try {
                  text = bound(key, params)
                } catch (err) {
                  text = null
                }
                if (!text || text === key) text = ZH[key] || key
                if (params && text) {
                  text = String(text).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
                }
                return text
              }
            }
            bumpLocale()
            if (typeof locale.subscribe === 'function') {
              try {
                const off = locale.subscribe(() => bumpLocale())
                if (typeof off === 'function') disposers.push(off)
              } catch (err) {
                /* ignore */
              }
            }
          }
          return () => {
            disposers.forEach((dispose) => {
              try {
                dispose()
              } catch (err) {
                /* ignore */
              }
            })
          }
        }, 'netease-music: locale')

        /* 4) 三个 slot */
        effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NS,
        }, Page)), 'netease-music: page')

        effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NS,
          order: 30,
          label: () => translate('app.title'),
        }, PanelIcon)), 'netease-music: sidebar entry')

        /* 侧栏迷你播放器：其它面板时显示在设置按钮上方 */
        effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'netease-mini',
          order: 10,
        }, MiniPlayer)), 'netease-music: sidebar mini player')
      },
    }

  },
})
