#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""网易云音乐 DSH 插件 —— 常驻 NDJSON 数据引擎。

进程契约（见 docs/CONTRACT.md 第 4 节）：
  * stdin  一行一个 JSON 请求：{"id":"1","cmd":"status","params":{...}}
  * stdout 一行一个 JSON 响应：{"id":"1","ok":true,"data":{...}}
                                {"id":"1","ok":false,"error":"中文错误","code":"UNAUTHENTICATED|NOT_FOUND|NETWORK|INTERNAL"}
  * stdout **只允许** 协议行；所有日志写 stderr。
  * 启动完成后输出一行 {"event":"ready","data":{"authed":...,"anonymous":...}}（不是响应，Host 用它判活）。
  * stdin EOF 时退出。

启动时加载 cookie（NETEASE_COOKIE_FILE，默认 ~/.dsh/netease-panel/cookies.json），
无效则匿名登录；扫码登录成功后把登录态写回该文件，并尽力镜像一份给
cloud-music-mcp（engine/cloud-music-mcp/src/cloud_music_mcp/storage/cookies.json）。
"""

import base64
import io
import json
import os
import sys
import time
import traceback

# --------------------------------------------------------------------------- #
# 输出通道：先固定编码，保证中文/协议行在任意 locale 下稳定
# --------------------------------------------------------------------------- #
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - Python < 3.7 兜底
        pass


def log(msg):
    """只写 stderr 的日志。"""
    try:
        sys.stderr.write(
            "[bridge %s] %s\n" % (time.strftime("%H:%M:%S"), msg)
        )
        sys.stderr.flush()
    except Exception:
        pass


def emit(obj):
    """写一行 NDJSON 到 stdout 并立刻 flush。"""
    try:
        sys.stdout.write(
            json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
        )
        sys.stdout.flush()
    except BrokenPipeError:
        raise SystemExit(0)


PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_COOKIE_FILE = os.path.expanduser("~/.dsh/netease-panel/cookies.json")
MIRROR_COOKIE_FILE = os.path.join(
    PLUGIN_DIR,
    "engine",
    "cloud-music-mcp",
    "src",
    "cloud_music_mcp",
    "storage",
    "cookies.json",
)
REQUEST_TIMEOUT = (6, 15)  # (connect, read)；避免异常网络把 Host 卡死
MAX_PLAYLIST_TRACKS = 500

LEVELS = {
    "standard": 128000,
    "exhigh": 320000,
    "lossless": 999000,
    "hires": 1900000,
}
BR_TO_LEVEL = {
    96000: "standard",
    128000: "standard",
    192000: "standard",
    320000: "exhigh",
    999000: "lossless",
    1900000: "hires",
}
AUTO_CHAIN = ["exhigh", "standard"]


# --------------------------------------------------------------------------- #
# 依赖导入（失败时仍然给出可诊断信息，而不是静默退出）
# --------------------------------------------------------------------------- #
_IMPORT_ERROR = None
try:
    import qrcode
    import requests
    import pyncm
    from pyncm import apis
except Exception as exc:  # pragma: no cover
    _IMPORT_ERROR = "%s: %s" % (type(exc).__name__, exc)
    emit(
        {
            "event": "ready",
            "data": {
                "authed": False,
                "anonymous": False,
                "error": "数据引擎依赖缺失（pyncm/qrcode/requests），请检查 engine 虚拟环境：%s"
                % _IMPORT_ERROR,
            },
        }
    )
    log("import failed: %s" % _IMPORT_ERROR)
    raise SystemExit(1)


class BridgeError(Exception):
    """带错误码的业务异常。"""

    def __init__(self, message, code="INTERNAL", status=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


class _TimeoutSession(pyncm.Session):
    """把 requests 的默认超时补上，避免网易云接口挂起时卡死 Host。"""

    def request(self, method, url, *args, **kwargs):
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = REQUEST_TIMEOUT
        return super().request(method, url, *args, **kwargs)


# --------------------------------------------------------------------------- #
# 通用小工具
# --------------------------------------------------------------------------- #
def _first(*values):
    """返回第一个非 None 值（0 / "" 也算有效）。"""
    for v in values:
        if v is not None:
            return v
    return None


def _int(value, default=None):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _text(value):
    if value is None:
        return None
    try:
        s = str(value).strip()
    except Exception:
        return None
    return s or None


def _https(url):
    """图片 URL 统一升级成 https；空值返回 None。"""
    if not url or not isinstance(url, str):
        return None
    u = url.strip()
    if not u:
        return None
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("http://"):
        return "https://" + u[len("http://"):]
    return u


def _truncate(text, limit=200):
    """截断到 limit 字，并把换行/连续空白折叠成单个空格（便于 UI 单行展示）。"""
    if text is None:
        return None
    s = " ".join(str(text).split())
    if not s:
        return None
    return s[:limit]


def _list_of_dicts(value):
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _api_check(resp, what):
    """检查 pyncm 返回的 code，失败时抛中文 BridgeError。"""
    if not isinstance(resp, dict):
        raise BridgeError("网易云接口返回了无法解析的数据（%s）" % what, "NETWORK")
    code = _int(resp.get("code"))
    if code == 200:
        return resp
    message = _text(resp.get("message")) or _text(resp.get("msg"))
    if code in (301, 302):
        raise BridgeError("%s需要登录后才能查看" % what, "UNAUTHENTICATED", code)
    if code in (400, 404):
        raise BridgeError("%s不存在或已下架" % what, "NOT_FOUND", code)
    if code in (503, 504):
        raise BridgeError("网易云服务暂时不可用（%s）" % what, "NETWORK", code)
    raise BridgeError(
        "%s获取失败%s" % (what, "：" + message if message else "（错误码 %s）" % code),
        "INTERNAL",
        code,
    )


def _require_id(params, label="内容"):
    raw = _first(params.get("id"), params.get("playlistId"), params.get("albumId"),
                 params.get("artistId"), params.get("songId"))
    if raw is None or raw == "":
        raise BridgeError("缺少 %s id 参数" % label, "INTERNAL")
    as_int = _int(raw)
    return as_int if as_int is not None else str(raw).strip()


# --------------------------------------------------------------------------- #
# 数据归一化（docs/CONTRACT.md 4.2）
# --------------------------------------------------------------------------- #
def norm_track(song):
    """把新旧两种歌曲结构统一成 Track。"""
    if not isinstance(song, dict):
        return None
    artists_raw = _first(
        song.get("ar"), song.get("artists"), song.get("artist"), []
    )
    if isinstance(artists_raw, dict):
        artists_raw = [artists_raw]
    artists = []
    for artist in _list_of_dicts(artists_raw):
        artists.append(
            {"id": _int(artist.get("id")), "name": _text(artist.get("name")) or ""}
        )

    album_raw = _first(song.get("al"), song.get("album"), {})
    if not isinstance(album_raw, dict):
        album_raw = {}

    aliases = _first(song.get("alia"), song.get("alias"), song.get("transNames"), [])
    if isinstance(aliases, str):
        aliases = [aliases]
    alias = None
    for item in aliases or []:
        if _text(item):
            alias = _text(item)
            break

    fee = _int(song.get("fee"), 0)
    privilege = song.get("privilege")
    if isinstance(privilege, dict) and _int(privilege.get("fee")) == 1:
        fee = fee or 1

    mv = _first(song.get("mv"), song.get("mvid"))
    pop = _first(song.get("pop"), song.get("popularity"))
    duration = _first(song.get("dt"), song.get("duration"))

    return {
        "id": _int(song.get("id")),
        "name": _text(song.get("name")) or "",
        "artists": artists,
        "artist": " / ".join(a["name"] for a in artists if a.get("name")) or None,
        "album": _text(album_raw.get("name")),
        "albumId": _int(album_raw.get("id")),
        "cover": _https(
            _first(
                album_raw.get("picUrl"),
                album_raw.get("blurPicUrl"),
                song.get("albumPic"),
            )
        ),
        "duration": _int(duration),
        "fee": fee,
        "pop": _int(pop),
        "mv": _int(mv) if _int(mv) else None,
        "alias": alias,
        "vip": fee == 1,
    }


def norm_playlist(playlist, my_uid=None):
    if not isinstance(playlist, dict):
        return None
    creator = playlist.get("creator") if isinstance(playlist.get("creator"), dict) else {}
    creator_uid = _int(creator.get("userId"))
    mine = bool(my_uid and creator_uid is not None and creator_uid == _int(my_uid))
    return {
        "id": _int(playlist.get("id")),
        "name": _text(playlist.get("name")) or "",
        "cover": _https(
            _first(
                playlist.get("coverImgUrl"),
                playlist.get("picUrl"),
                playlist.get("coverUrl"),
                playlist.get("blurPicUrl"),
            )
        ),
        "trackCount": _int(_first(playlist.get("trackCount"), playlist.get("size")), 0),
        "playCount": _int(playlist.get("playCount"), 0),
        "description": _text(playlist.get("description")),
        "creator": _text(creator.get("nickname")),
        "mine": mine,
        "updateTime": _int(
            _first(
                playlist.get("updateTime"),
                playlist.get("trackNumberUpdateTime"),
                playlist.get("createTime"),
            )
        ),
    }


def norm_artist(artist):
    if not isinstance(artist, dict):
        return None
    aliases = _first(artist.get("alias"), artist.get("alia"), [])
    if isinstance(aliases, str):
        aliases = [aliases]
    alias_list = [str(x) for x in aliases or [] if _text(x)]
    return {
        "id": _int(artist.get("id")),
        "name": _text(artist.get("name")) or "",
        "avatar": _https(
            _first(
                artist.get("picUrl"),
                artist.get("img1v1Url"),
                artist.get("img1v1"),
                artist.get("avatar"),
            )
        ),
        "alias": alias_list or None,
        "fans": _int(
            _first(artist.get("fansSize"), artist.get("fansCount"), artist.get("fans"))
        ),
        "albumCount": _int(
            _first(artist.get("albumSize"), artist.get("albumCount"))
        ),
        "songCount": _int(
            _first(artist.get("musicSize"), artist.get("songCount"))
        ),
        "description": _truncate(
            _first(artist.get("briefDesc"), artist.get("description"))
        ),
    }


def norm_album(album):
    if not isinstance(album, dict):
        return None
    artist_obj = album.get("artist") if isinstance(album.get("artist"), dict) else {}
    artists = _list_of_dicts(album.get("artists"))
    first_artist = artists[0] if artists else {}
    artist_name = _text(artist_obj.get("name")) or _text(first_artist.get("name"))
    artist_id = _int(
        _first(
            album.get("artistId"),
            artist_obj.get("id"),
            first_artist.get("id"),
        )
    )
    publish_ts = _int(album.get("publishTime"))
    publish_date = None
    if publish_ts:
        try:
            publish_date = time.strftime(
                "%Y-%m-%d", time.localtime(publish_ts / 1000.0)
            )
        except (ValueError, OSError, OverflowError):
            publish_date = None
    return {
        "id": _int(album.get("id")),
        "name": _text(album.get("name")) or "",
        "cover": _https(
            _first(album.get("picUrl"), album.get("blurPicUrl"), album.get("coverUrl"))
        ),
        "artist": artist_name,
        "artistId": artist_id,
        "publishDate": publish_date,
        "trackCount": _int(
            _first(album.get("size"), album.get("trackCount")), None
        )
        or len(_list_of_dicts(album.get("songs")))
        or 0,
    }


def norm_tracks(items):
    result = []
    for item in items or []:
        track = norm_track(item)
        if track and track.get("id") is not None:
            result.append(track)
    return result


# --------------------------------------------------------------------------- #
# 引擎
# --------------------------------------------------------------------------- #
class Engine:
    def __init__(self):
        self.cookie_file = os.environ.get("NETEASE_COOKIE_FILE") or DEFAULT_COOKIE_FILE
        self.cookie_file = os.path.expanduser(self.cookie_file)
        self.login_key = None
        self.login_key_at = None

    # ---------------- 会话 / 登录态 ---------------- #
    def _new_session(self):
        session = _TimeoutSession()
        # HTTP 代理若在环境里（HTTPS_PROXY 等）requests 自动使用，这里不硬编码。
        pyncm.SetCurrentSession(session)
        return session

    @staticmethod
    def session():
        return pyncm.GetCurrentSession()

    def _load_cookie_file(self):
        path = self.cookie_file
        if not os.path.exists(path):
            return False
        try:
            with open(path, "r", encoding="utf-8") as fp:
                doc = json.load(fp)
        except Exception as exc:
            log("cookie 文件读取失败（忽略）：%s" % exc)
            return False
        if not isinstance(doc, dict):
            log("cookie 文件格式不正确（忽略）")
            return False
        session = self.session()
        session_dump = doc.get("session")
        try:
            if isinstance(session_dump, dict):
                for key in ("eapi_config", "login_info", "csrf_token"):
                    if key in session_dump:
                        session.load({key: session_dump[key]})
                cookies = session_dump.get("cookies")
                if isinstance(cookies, list):
                    session.load({"cookies": cookies})
                elif isinstance(cookies, dict):
                    session.cookies.update(cookies)
            elif isinstance(doc.get("cookies"), dict):
                session.cookies.update(doc["cookies"])
            elif doc.get("MUSIC_U"):
                session.cookies.update(doc)
            else:
                log("cookie 文件里没有可用的登录态")
                return False
        except Exception as exc:
            log("cookie 载入失败：%s" % exc)
            return False
        # 旧登录信息不可信，重新校验
        session.login_info = {"success": False, "tick": time.time(), "content": None}
        log("已载入 cookie 文件：%s" % path)
        return True

    def _validate_session(self):
        """用 GetCurrentLoginStatus 校验当前 cookie 是否还是有效账号。"""
        try:
            resp = apis.login.GetCurrentLoginStatus()
        except Exception as exc:
            log("登录态校验失败（网络）：%s" % exc)
            return False
        if not isinstance(resp, dict) or _int(resp.get("code")) != 200:
            return False
        profile = resp.get("profile")
        account = resp.get("account") or {}
        if not isinstance(profile, dict) or not profile:
            return False
        if account.get("anonimousUser"):
            return False
        try:
            apis.login.WriteLoginInfo(resp)
        except Exception as exc:
            log("登录态写入失败：%s" % exc)
            return False
        return True

    def _anonymous_login(self):
        try:
            apis.login.LoginViaAnonymousAccount()
            log("匿名登录成功（uid=%s）" % self.session().uid)
            return True
        except Exception as exc:
            log("匿名登录失败：%s: %s" % (type(exc).__name__, exc))
            return False

    # Cookie 属性名（解析 "Set-Cookie 风格" 字符串时跳过）
    _COOKIE_ATTRIBUTES = {
        "max-age",
        "expires",
        "path",
        "domain",
        "httponly",
        "secure",
        "samesite",
        "version",
        "priority",
        "comment",
    }

    def _set_cookie_string(self, cookie_text):
        """解析 "MUSIC_U=xxx; Max-Age=…; Path=/; Domain=.music.163.com" 这类字符串。"""
        session = self.session()
        applied = False
        for part in str(cookie_text).split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            name, _, value = part.partition("=")
            name = name.strip()
            if not name or name.lower() in self._COOKIE_ATTRIBUTES:
                continue
            session.cookies.set(
                name, value.strip(), domain=".music.163.com", path="/"
            )
            applied = True
        return applied

    def _apply_cookie_payload(self, payload):
        """部分网易云接口（如扫码 803）把登录 cookie 放在响应体里，这里兜底写入 session。"""
        if not isinstance(payload, dict):
            return False
        raw = _first(payload.get("cookie"), payload.get("cookies"))
        if not raw:
            return False
        session = self.session()
        applied = False
        try:
            if isinstance(raw, str):
                applied = self._set_cookie_string(raw)
            elif isinstance(raw, dict):
                session.cookies.update(raw)
                applied = True
            elif isinstance(raw, list):
                for item in raw:
                    if isinstance(item, str):
                        applied = self._set_cookie_string(item) or applied
                    elif isinstance(item, dict) and item.get("name"):
                        session.cookies.set(
                            str(item["name"]),
                            str(item.get("value", "")),
                            domain=item.get("domain") or ".music.163.com",
                            path=item.get("path") or "/",
                        )
                        applied = True
        except Exception as exc:
            log("响应体 cookie 写入失败：%s" % exc)
        if applied:
            log("已从响应体补写登录 cookie（%d 个）" % len(session.cookies))
        return applied

    def ensure_session(self):
        """保证有可用的（匿名或真实）会话，供只读接口使用。"""
        session = self.session()
        if session.logged_in:
            return session
        if not self._anonymous_login():
            raise BridgeError(
                "无法连接网易云音乐（匿名登录失败），请检查网络或代理设置", "NETWORK"
            )
        return self.session()

    def is_authed(self):
        session = self.session()
        return bool(session.logged_in) and not session.is_anonymous

    def snapshot(self):
        """当前登录态快照（status / ready 共用）。"""
        session = self.session()
        logged_in = bool(session.logged_in)
        content = {}
        if logged_in:
            info = session.login_info or {}
            content = info.get("content") or {}
        profile = content.get("profile") if isinstance(content.get("profile"), dict) else {}
        account = content.get("account") if isinstance(content.get("account"), dict) else {}
        anonymous = bool(logged_in and session.is_anonymous)
        authed = bool(logged_in and not anonymous)
        nickname = _text(profile.get("nickname")) if authed else None
        avatar = _https(profile.get("avatarUrl")) if authed else None
        vip_type = _int(_first(profile.get("vipType"), account.get("vipType")), 0) if authed else 0
        level = _int(_first(profile.get("level"), account.get("level"))) if authed else None
        uid = _first(profile.get("userId"), account.get("id"))
        return {
            "authed": authed,
            "anonymous": anonymous,
            "nickname": nickname,
            "avatar": avatar,
            "userId": _int(uid),
            "vipType": vip_type,
            "level": level,
        }

    # ---------------- cookie 持久化 ---------------- #
    def _write_json_atomic(self, path, payload, mode=0o600):
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, indent=2)
            fp.flush()
            os.fsync(fp.fileno())
        os.replace(tmp, path)
        try:
            os.chmod(path, mode)
        except OSError:
            pass

    def save_cookies(self):
        """扫码登录成功后写主 cookie 文件 + 镜像给 MCP。"""
        session = self.session()
        try:
            with open(self.cookie_file, "r", encoding="utf-8") as fp:
                old = json.load(fp)
            if not isinstance(old, dict):
                old = {}
        except Exception:
            old = {}
        snap = self.snapshot()
        payload = {
            "version": 1,
            "savedAt": int(time.time() * 1000),
            "session": session.dump(),
            "cookies": session.cookies.get_dict(),
            "profile": {
                "nickname": snap.get("nickname"),
                "avatar": snap.get("avatar"),
                "userId": snap.get("userId"),
                "vipType": snap.get("vipType"),
                "level": snap.get("level"),
            },
            "previousSavedAt": old.get("savedAt"),
        }
        try:
            self._write_json_atomic(self.cookie_file, payload)
            log("已保存登录态：%s" % self.cookie_file)
        except Exception as exc:
            log("保存主 cookie 文件失败：%s" % exc)
        self._mirror_cookies()

    def _mirror_cookies(self):
        """镜像给 cloud-music-mcp（其 storage/cookies.json 是扁平 {name: value}）。"""
        try:
            cookies = self.session().cookies.get_dict()
            self._write_json_atomic(MIRROR_COOKIE_FILE, cookies, mode=0o600)
            log("已镜像 cookie 到 MCP：%s" % MIRROR_COOKIE_FILE)
        except Exception as exc:
            log("镜像 cookie 失败（不影响本插件）：%s" % exc)

    def clear_cookies(self):
        for path in (self.cookie_file, MIRROR_COOKIE_FILE):
            try:
                if os.path.exists(path):
                    os.remove(path)
                    log("已删除登录态文件：%s" % path)
            except Exception as exc:
                log("删除登录态文件失败（%s）：%s" % (path, exc))

    # ---------------- 数据读取 ---------------- #
    def _daily_tracks(self):
        self.ensure_session()
        resp = apis.WeapiCryptoRequest(
            lambda: (
                "/weapi/v1/discovery/recommend/songs",
                {"limit": "30", "offset": "0", "total": "true", "n": "1000"},
            )
        )()
        resp = _api_check(resp, "今日推荐")
        data = resp.get("data") if isinstance(resp.get("data"), dict) else {}
        songs = _first(
            data.get("dailySongs"),
            data.get("recommend"),
            resp.get("recommend"),
            resp.get("songs"),
            [],
        )
        return norm_tracks(_list_of_dicts(songs))

    def _recommended_playlists(self):
        self.ensure_session()
        resp = apis.WeapiCryptoRequest(
            lambda: (
                "/weapi/personalized/playlist",
                {"limit": "18", "offset": "0", "total": "true", "n": "1000"},
            )
        )()
        resp = _api_check(resp, "推荐歌单")
        items = _first(resp.get("result"), resp.get("playlists"), [])
        return [p for p in (norm_playlist(item) for item in _list_of_dicts(items)) if p]

    def _my_playlists(self):
        if not self.is_authed():
            return []
        self.ensure_session()
        uid = self.session().uid
        resp = apis.user.GetUserPlaylists(uid, limit=1000)
        resp = _api_check(resp, "我的歌单")
        items = _first(resp.get("playlist"), resp.get("more"), [])
        mine = []
        for item in _list_of_dicts(items):
            playlist = norm_playlist(item, my_uid=uid)
            if playlist:
                playlist["mine"] = True
                mine.append(playlist)
        return mine

    def _artist_subs(self):
        if not self.is_authed():
            return []
        self.ensure_session()
        resp = apis.user.GetUserArtistSubs(limit=100)
        resp = _api_check(resp, "收藏歌手")
        return [
            a
            for a in (norm_artist(item) for item in _list_of_dicts(resp.get("data")))
            if a
        ]

    # ---------------- 命令实现 ---------------- #
    def cmd_ping(self, _params):
        return {"pong": True}

    def cmd_status(self, _params):
        return self.snapshot()

    def cmd_login_start(self, _params):
        self.ensure_session()
        resp = apis.login.LoginQrcodeUnikey()
        resp = _api_check(resp, "登录二维码")
        key = _text(resp.get("unikey"))
        if not key:
            raise BridgeError("网易云没有返回二维码 key，请稍后重试", "NETWORK")
        try:
            qr_url = apis.login.GetLoginQRCodeUrl(key)
        except Exception:
            qr_url = "https://music.163.com/login?codekey=%s" % key

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(qr_url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        data_url = "data:image/png;base64," + base64.b64encode(
            buffer.getvalue()
        ).decode("ascii")

        self.login_key = key
        self.login_key_at = time.time()
        log("生成登录二维码 key=%s…" % key[:8])
        return {"key": key, "qr": data_url, "expiresIn": 300}

    def cmd_login_check(self, params):
        key = _text(params.get("key"))
        if not key:
            raise BridgeError("缺少登录二维码 key", "INTERNAL")
        if self.login_key and key != self.login_key:
            return {"state": "expired"}
        # 兼容未先调用 login_start 的情况
        if not self.login_key:
            self.login_key = key
        try:
            resp = apis.login.LoginQrcodeCheck(key)
        except Exception as exc:
            raise BridgeError(
                "登录状态查询失败：%s" % _describe_exception(exc), _describe_code(exc)
            )
        if not isinstance(resp, dict):
            raise BridgeError("登录状态查询返回了无法解析的数据", "NETWORK")
        code = _int(resp.get("code"))
        if code == 801:
            return {"state": "waiting", "status": code}
        if code == 802:
            return {
                "state": "scanned",
                "status": code,
                "nickname": _text(resp.get("nickname")),
                "avatar": _https(resp.get("avatarUrl")),
            }
        if code == 800:
            return {"state": "expired", "status": code}
        if code == 803:
            # 扫码成功：先把响应里可能夹带的 cookie 落到 session，再取完整资料并落盘。
            self._apply_cookie_payload(resp)
            status = None
            last_error = None
            for attempt in range(3):
                try:
                    candidate = apis.login.GetCurrentLoginStatus()
                    _api_check(candidate, "账号信息")
                    profile = candidate.get("profile")
                    if isinstance(profile, dict) and profile:
                        status = candidate
                        break
                    last_error = "账号信息为空"
                except Exception as exc:
                    last_error = exc
                    log("803 后获取账号信息失败（第 %d 次）：%s" % (attempt + 1, exc))
                time.sleep(0.4)
            if status is None:
                log("803 后始终拿不到账号资料：%s" % last_error)
                raise BridgeError(
                    "登录成功但获取账号信息失败，请重新获取二维码再试", "NETWORK"
                )
            try:
                apis.login.WriteLoginInfo(status)
            except Exception as exc:
                log("803 后写入登录态失败：%s" % exc)
                raise BridgeError(
                    "登录成功但写入登录态失败，请重试", "NETWORK"
                )
            self.login_key = None
            self.login_key_at = None
            self.save_cookies()
            snap = self.snapshot()
            log("扫码登录成功：%s（uid=%s）" % (snap.get("nickname"), snap.get("userId")))
            return {
                "state": "ok",
                "status": code,
                "nickname": snap.get("nickname"),
                "avatar": snap.get("avatar"),
                "vipType": snap.get("vipType"),
                "userId": snap.get("userId"),
            }
        message = _text(resp.get("message")) or _text(resp.get("msg"))
        return {
            "state": "error",
            "status": code,
            "message": message or "未知的登录状态",
        }

    def cmd_logout(self, _params):
        try:
            apis.login.LoginLogout()
        except Exception as exc:
            log("登出接口调用失败（忽略）：%s" % exc)
        self.login_key = None
        self.login_key_at = None
        self.clear_cookies()
        self._new_session()
        self._anonymous_login()
        return {"ok": True}

    def cmd_home(self, _params):
        """今日推荐 + 推荐歌单 + 我的歌单 + 收藏歌手；单块失败不影响其他块。"""
        self.ensure_session()
        errors = []

        def safe(label, func):
            try:
                return func()
            except Exception as exc:
                log("%s 获取失败：%s: %s" % (label, type(exc).__name__, exc))
                errors.append((label, exc))
                return []

        daily = safe("今日推荐", self._daily_tracks)
        recommended = safe("推荐歌单", self._recommended_playlists)
        playlists = safe("我的歌单", self._my_playlists)
        artists = safe("收藏歌手", self._artist_subs)

        if errors and not (daily or recommended or playlists or artists):
            _, exc = errors[0]
            raise _to_bridge_error(exc, "首页数据获取失败")
        return {
            "daily": daily,
            "playlists": playlists,
            "artists": artists,
            "recommended": recommended,
        }

    def cmd_daily(self, _params):
        return {"songs": self._daily_tracks()}

    def cmd_my_playlists(self, _params):
        return {"playlists": self._my_playlists()}

    def cmd_playlist(self, params):
        playlist_id = _require_id(params, "歌单")
        self.ensure_session()
        info = _api_check(apis.playlist.GetPlaylistInfo(playlist_id), "歌单")
        raw = info.get("playlist") or {}
        if not raw:
            raise BridgeError("歌单不存在或已下架", "NOT_FOUND")
        playlist = norm_playlist(raw, my_uid=self.session().uid if self.is_authed() else None)
        songs = []
        try:
            all_tracks = apis.playlist.GetPlaylistAllTracks(
                playlist_id, 0, MAX_PLAYLIST_TRACKS
            )
            songs = norm_tracks(
                _list_of_dicts(
                    _first(
                        all_tracks.get("songs") if isinstance(all_tracks, dict) else None,
                        [],
                    )
                )
            )
        except Exception as exc:
            log("歌单全量歌曲获取失败，退回详情里的 tracks：%s" % exc)
        if not songs:
            songs = norm_tracks(_list_of_dicts(raw.get("tracks")))[:MAX_PLAYLIST_TRACKS]
        playlist["trackCount"] = playlist.get("trackCount") or len(songs)
        return {"playlist": playlist, "songs": songs}

    def cmd_artist(self, params):
        artist_id = _require_id(params, "歌手")
        self.ensure_session()
        detail = _api_check(apis.artist.GetArtistDetails(artist_id), "歌手")
        data = detail.get("data") if isinstance(detail.get("data"), dict) else {}
        raw = data.get("artist") if isinstance(data.get("artist"), dict) else data
        artist = norm_artist(raw or {})
        songs = []
        try:
            tracks = _api_check(
                apis.artist.GetArtistTracks(artist_id, limit=100, order="hot"), "歌手歌曲"
            )
            songs = norm_tracks(_list_of_dicts(tracks.get("songs")))
        except Exception as exc:
            log("歌手热门歌曲获取失败：%s" % exc)
        albums = []
        try:
            albums_resp = _api_check(
                apis.artist.GetArtistAlbums(artist_id, limit=50), "歌手专辑"
            )
            albums = [
                a
                for a in (
                    norm_album(item)
                    for item in _list_of_dicts(albums_resp.get("hotAlbums"))
                )
                if a
            ]
        except Exception as exc:
            log("歌手专辑获取失败：%s" % exc)
        return {"artist": artist, "songs": songs, "albums": albums}

    def cmd_album(self, params):
        album_id = _require_id(params, "专辑")
        self.ensure_session()
        resp = _api_check(apis.album.GetAlbumInfo(album_id), "专辑")
        raw = resp.get("album") if isinstance(resp.get("album"), dict) else {}
        if not raw:
            raise BridgeError("专辑不存在或已下架", "NOT_FOUND")
        album = norm_album(raw)
        songs = norm_tracks(_list_of_dicts(resp.get("songs")))
        if album and not album.get("trackCount"):
            album["trackCount"] = len(songs)
        return {"album": album, "songs": songs}

    def cmd_search(self, params):
        keyword = _text(params.get("q") or params.get("keyword"))
        if not keyword:
            raise BridgeError("搜索关键字不能为空", "INTERNAL")
        category = _text(params.get("type")) or "song"
        stype_map = {
            "song": 1,
            "album": 10,
            "artist": 100,
            "playlist": 1000,
            "mv": 1004,
        }
        stype = stype_map.get(category)
        if stype is None:
            raise BridgeError("不支持的搜索类型：%s" % category, "INTERNAL")
        limit = _int(params.get("limit"), 30)
        limit = max(1, min(limit, 100))
        self.ensure_session()
        resp = _api_check(
            apis.cloudsearch.GetSearchResult(keyword, stype=stype, limit=limit),
            "搜索",
        )
        result = resp.get("result") if isinstance(resp.get("result"), dict) else {}
        if category == "song":
            items = norm_tracks(_list_of_dicts(result.get("songs")))
        elif category == "artist":
            items = [
                a
                for a in (norm_artist(item) for item in _list_of_dicts(result.get("artists")))
                if a
            ]
        elif category == "playlist":
            items = [
                p
                for p in (
                    norm_playlist(item)
                    for item in _list_of_dicts(result.get("playlists"))
                )
                if p
            ]
        elif category == "album":
            items = [
                a
                for a in (norm_album(item) for item in _list_of_dicts(result.get("albums")))
                if a
            ]
        else:  # mv：契约里未定义，按歌曲同构返回兜底
            items = [
                t
                for t in (
                    norm_track(item) for item in _list_of_dicts(result.get("mvs"))
                )
                if t
            ]
        return {"items": items, "type": category}

    def cmd_subscriptions(self, params):
        category = _text(params.get("category")) or "artists"
        if category not in ("artists", "albums"):
            raise BridgeError("不支持的收藏类型：%s" % category, "INTERNAL")
        if not self.is_authed():
            return {"items": []}
        self.ensure_session()
        if category == "artists":
            resp = _api_check(apis.user.GetUserArtistSubs(limit=100), "收藏歌手")
            items = [
                a
                for a in (norm_artist(item) for item in _list_of_dicts(resp.get("data")))
                if a
            ]
        else:
            resp = _api_check(apis.user.GetUserAlbumSubs(limit=100), "收藏专辑")
            items = [
                a
                for a in (norm_album(item) for item in _list_of_dicts(resp.get("data")))
                if a
            ]
        return {"items": items}

    def cmd_song_url(self, params):
        song_id = _require_id(params, "歌曲")
        requested = _text(params.get("level")) or "auto"
        requested = requested.lower()
        if requested == "auto":
            chain = AUTO_CHAIN
        elif requested in LEVELS:
            chain = [requested]
        else:
            raise BridgeError("不支持的音质：%s" % requested, "INTERNAL")
        self.ensure_session()

        last_error = None
        for level in chain:
            try:
                resp = apis.track.GetTrackAudio([song_id], bitrate=LEVELS[level])
            except requests.exceptions.RequestException as exc:
                # 网络层失败（超时/连不上）不再逐级重试，直接报 NETWORK，避免拖到 Host 超时
                raise BridgeError(
                    "获取播放地址失败：%s" % _describe_exception(exc), "NETWORK"
                )
            except Exception as exc:
                last_error = exc
                log("song_url %s 请求失败：%s" % (level, exc))
                continue
            if not isinstance(resp, dict):
                continue
            code = _int(resp.get("code"))
            data_list = resp.get("data")
            if code != 200 or not isinstance(data_list, list) or not data_list:
                last_error = resp
                continue
            item = data_list[0] if isinstance(data_list[0], dict) else {}
            url = _text(item.get("url"))
            if not url:
                log("song_url %s 无可用地址（id=%s）" % (level, song_id))
                last_error = resp
                continue
            br = _int(item.get("br"))
            expires = time.time() + max(_int(item.get("expi"), 1200), 60)
            return {
                "url": _https(url),
                "br": br,
                "size": _int(item.get("size")),
                "type": _text(item.get("type")),
                "level": BR_TO_LEVEL.get(br) or (level if requested != "auto" else "standard"),
                "trial": bool(item.get("freeTrialInfo")),
                "expiresAt": int(expires * 1000),
            }

        # 全部失败：返回 url=null 由 Host 透传（契约允许）
        if isinstance(last_error, Exception):
            log("song_url 全部音质失败：%s" % last_error)
        return {
            "url": None,
            "br": None,
            "size": None,
            "type": None,
            "level": requested if requested != "auto" else "standard",
            "trial": False,
            "expiresAt": None,
        }

    def cmd_lyrics(self, params):
        song_id = _require_id(params, "歌曲")
        self.ensure_session()
        resp = _api_check(apis.track.GetTrackLyrics(song_id), "歌词")
        lrc = resp.get("lrc") if isinstance(resp.get("lrc"), dict) else {}
        tlyric = resp.get("tlyric") if isinstance(resp.get("tlyric"), dict) else {}
        return {
            "lrc": _text(lrc.get("lyric")),
            "tlyric": _text(tlyric.get("lyric")),
        }

    # ---------------- 分发 ---------------- #
    def dispatch(self, cmd, params):
        handler = {
            "ping": self.cmd_ping,
            "status": self.cmd_status,
            "login_start": self.cmd_login_start,
            "login_check": self.cmd_login_check,
            "logout": self.cmd_logout,
            "home": self.cmd_home,
            "daily": self.cmd_daily,
            "my_playlists": self.cmd_my_playlists,
            "playlist": self.cmd_playlist,
            "artist": self.cmd_artist,
            "album": self.cmd_album,
            "search": self.cmd_search,
            "subscriptions": self.cmd_subscriptions,
            "song_url": self.cmd_song_url,
            "lyrics": self.cmd_lyrics,
        }.get(cmd)
        if handler is None:
            raise BridgeError("未知命令：%s" % cmd, "INTERNAL")
        return handler(params)


# --------------------------------------------------------------------------- #
# 异常 → 协议错误
# --------------------------------------------------------------------------- #
def _describe_exception(exc):
    if isinstance(exc, BridgeError):
        return exc.message
    if isinstance(exc, requests.exceptions.Timeout):
        return "网络超时，请稍后重试"
    if isinstance(exc, requests.exceptions.ProxyError):
        return "代理连接失败，请检查网络代理设置"
    if isinstance(exc, requests.exceptions.SSLError):
        return "安全连接失败，请稍后重试"
    if isinstance(exc, requests.exceptions.ConnectionError):
        return "无法连接网易云音乐服务器，请检查网络"
    if isinstance(exc, json.JSONDecodeError):
        return "接口返回了无法解析的数据"
    name = type(exc).__name__
    text = str(exc).strip()
    if text:
        return "网易云接口异常（%s）：%s" % (name, text[:200])
    return "网易云接口异常（%s）" % name


def _describe_code(exc):
    if isinstance(exc, BridgeError):
        return exc.code
    if isinstance(exc, requests.exceptions.RequestException):
        return "NETWORK"
    try:
        from pyncm.apis.exception import LoginRequiredException

        if isinstance(exc, LoginRequiredException):
            return "UNAUTHENTICATED"
    except Exception:
        pass
    if isinstance(exc, (KeyError, IndexError, TypeError, ValueError)):
        return "INTERNAL"
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return "NETWORK"
    return "INTERNAL"


def _to_bridge_error(exc, prefix):
    if isinstance(exc, BridgeError):
        return exc
    return BridgeError("%s：%s" % (prefix, _describe_exception(exc)), _describe_code(exc))


# --------------------------------------------------------------------------- #
# 启动 & 主循环
# --------------------------------------------------------------------------- #
def bootstrap(engine):
    """加载 cookie → 校验 → 无效则匿名登录。返回 ready 数据。"""
    loaded = engine._load_cookie_file()
    valid = loaded and engine._validate_session()
    if not valid:
        engine._anonymous_login()
    snap = engine.snapshot()
    if loaded and not valid:
        log("已有 cookie 已失效，已降级为匿名（cookie 文件保留，登录成功后会覆盖）")
    return snap


def main():
    engine = Engine()
    engine._new_session()
    try:
        snap = bootstrap(engine)
    except Exception as exc:  # pragma: no cover - 兜底
        log("启动初始化失败：%s\n%s" % (exc, traceback.format_exc()))
        snap = engine.snapshot()
        snap["error"] = "启动初始化失败：%s" % _describe_exception(exc)
    log(
        "ready authed=%s anonymous=%s uid=%s"
        % (snap.get("authed"), snap.get("anonymous"), snap.get("userId"))
    )
    emit({"event": "ready", "data": snap})

    while True:
        try:
            raw = sys.stdin.readline()
        except (KeyboardInterrupt, EOFError):
            break
        if raw == "":  # EOF：Host 关闭了管道
            log("stdin EOF，退出")
            break
        line = raw.strip()
        if not line:
            continue

        request_id = None
        started = time.time()
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise BridgeError("请求必须是 JSON 对象", "INTERNAL")
            request_id = request.get("id")
            cmd = _text(request.get("cmd"))
            params = request.get("params")
            if not isinstance(params, dict):
                params = {}
            if not cmd:
                raise BridgeError("请求缺少 cmd 字段", "INTERNAL")
            log("→ %s id=%s" % (cmd, request_id))
            data = engine.dispatch(cmd, params)
            emit({"id": request_id, "ok": True, "data": data})
            log("← %s id=%s ok=%.3fs" % (cmd, request_id, time.time() - started))
        except Exception as exc:
            if isinstance(exc, BridgeError):
                code = exc.code
                message = exc.message
            elif isinstance(exc, json.JSONDecodeError):
                code = "INTERNAL"
                message = "请求不是合法的 JSON"
            else:
                code = _describe_code(exc)
                message = _describe_exception(exc)
                log("命令异常：%s\n%s" % (exc, traceback.format_exc()))
            log("← id=%s 失败 code=%s：%s" % (request_id, code, message))
            emit({"id": request_id, "ok": False, "error": message, "code": code})

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
