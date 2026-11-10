#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bridge 登录态/登出回归测试（完全离线 + mock，隔离真实用户数据）。

针对 task-16 修复的三个缺陷：
 1. 启动时 `GetCurrentLoginStatus` 网络异常不应判定 cookie 失效、不应转匿名覆盖会话；
    凭据必须保留，`cmd_status` 到期后按指数退避自动重试并恢复账号。
 2. 只有服务端明确回答「未登录 / 资料为空 / 匿名用户」才判定凭据真失效。
 3. 登出时删除凭据文件失败（如 PermissionError）不得吞掉并误报成功；
    成功登出后任何 status/命令都不得自动恢复旧账号。

隔离保证：
  * 所有 cookie / 镜像文件都写在 `tempfile.mkdtemp()` 临时目录，绝不触碰
    `~/.dsh/netease-panel/cookies.json`；
  * `GetCurrentLoginStatus` / `LoginViaAnonymousAccount` / `LoginLogout` / `LoginQrcodeCheck`
    全部 mock，不产生任何网络请求；
  * 不执行真实的收藏/播放等业务操作。

运行（无需网络）：
  engine/cloud-music-mcp/.venv/bin/python selftest/bridge-regression.py
"""

import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from unittest import mock

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(PLUGIN_DIR, "server")
sys.path.insert(0, SERVER_DIR)

import bridge  # noqa: E402  （导入本身不联网、不读真实 cookie）

REAL_COOKIE_PATH = os.path.abspath(
    os.path.expanduser("~/.dsh/netease-panel/cookies.json")
)


def valid_status_payload(nickname="回归测试用户", user_id=12345678, vip=0):
    return {
        "code": 200,
        "account": {
            "id": user_id,
            "anonimousUser": False,
            "vipType": vip,
        },
        "profile": {
            "nickname": nickname,
            "userId": user_id,
            "vipType": vip,
            "avatarUrl": "http://p1.music.126.net/avatar.jpg",
            "level": 8,
        },
    }


def anonymous_status_payload(user_id=999):
    return {
        "code": 200,
        "account": {"id": user_id, "anonimousUser": True, "vipType": 0},
        "profile": {"nickname": "", "userId": user_id},
    }


class BridgeAuthRegressionTest(unittest.TestCase):
    """认证状态机 + 登出清理的离线回归测试。"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="nm-bridge-regression-")
        self.cookie_file = os.path.join(self.tmpdir, "cookies.json")
        self.mirror_file = os.path.join(self.tmpdir, "mirror-cookies.json")
        self._orig_mirror = bridge.MIRROR_COOKIE_FILE
        bridge.MIRROR_COOKIE_FILE = self.mirror_file
        # bridge 日志默认写 stderr；测试里静音，保持 unittest 输出可读
        self._log_patch = mock.patch.object(bridge, "log", side_effect=lambda *a, **k: None)
        self._log_patch.start()
        self.engine = self._new_engine()

    def tearDown(self):
        self._log_patch.stop()
        bridge.MIRROR_COOKIE_FILE = self._orig_mirror
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    # ------------------------------------------------------------------ #
    # 工具
    # ------------------------------------------------------------------ #
    def _new_engine(self):
        engine = bridge.Engine()
        # 关键隔离：强制使用临时目录，绝不落到真实用户 cookie 路径
        engine.cookie_file = self.cookie_file
        self.assertFalse(
            os.path.abspath(engine.cookie_file) == REAL_COOKIE_PATH,
            "测试引擎指向了真实用户 cookie 文件！",
        )
        self.assertTrue(os.path.abspath(engine.cookie_file).startswith(self.tmpdir))
        engine._new_session()
        return engine

    def _write_mcp_cookie_file(self, music_u="fake-music-u-token"):
        """写 MCP 兼容的扁平 cookie 格式（也是 legacy 载入路径）。"""
        with open(self.cookie_file, "w", encoding="utf-8") as fp:
            json.dump({"MUSIC_U": music_u, "__csrf": "fake-csrf"}, fp)
        return music_u

    def _write_own_cookie_file(self):
        """写本插件自己的 cookie 格式（session dump）并返回内容。"""
        engine = self._new_engine()
        engine.session().cookies.set(
            "MUSIC_U", "fake-music-u-token", domain=".music.163.com", path="/"
        )
        engine.session().cookies.set(
            "__csrf", "fake-csrf", domain=".music.163.com", path="/"
        )
        engine.save_cookies()
        with open(self.cookie_file, "r", encoding="utf-8") as fp:
            return json.load(fp)

    def _patch_anonymous(self, fail=False):
        """mock 匿名登录；默认会像真实接口一样把 session 标记成匿名登录态。"""

        def side_effect(*args, **kwargs):
            if fail:
                raise bridge.requests.exceptions.ConnectionError("anon network down")
            session = bridge.pyncm.GetCurrentSession()
            session.login_info = {
                "success": True,
                "tick": time.time(),
                "content": anonymous_status_payload(),
            }
            return session.login_info

        return mock.patch.object(
            bridge.apis.login, "LoginViaAnonymousAccount", side_effect=side_effect
        )

    def _patch_status(self, side_effect):
        return mock.patch.object(
            bridge.apis.login, "GetCurrentLoginStatus", side_effect=side_effect
        )

    def _patch_login_logout(self, side_effect=None):
        return mock.patch.object(
            bridge.apis.login,
            "LoginLogout",
            side_effect=side_effect or (lambda *a, **k: {"code": 200}),
        )

    # ------------------------------------------------------------------ #
    # 1) 三态校验：transport 不能当 invalid
    # ------------------------------------------------------------------ #
    def test_validate_transport_keeps_credentials(self):
        self._write_mcp_cookie_file()
        self.assertTrue(self.engine._load_cookie_file())
        self.assertTrue(self.engine._has_user_credentials)

        with self._patch_status(
            side_effect=bridge.requests.exceptions.ConnectionError("network down")
        ):
            result = self.engine._validate_session()

        self.assertEqual(result, bridge.AUTH_TRANSPORT)
        self.assertFalse(self.engine.session().logged_in)
        self.assertIn("网络", self.engine._last_validation_error or "")
        self.assertTrue(self.engine._has_user_credentials, "网络异常不得清掉凭据标记")
        self.assertTrue(os.path.exists(self.cookie_file), "网络异常不得删除 cookie 文件")

    def test_validate_classification(self):
        self._write_mcp_cookie_file()
        self.assertTrue(self.engine._load_cookie_file())

        cases = [
            ("code 301 未登录", {"code": 301}, bridge.AUTH_INVALID),
            ("code 200 但资料为空", {"code": 200, "profile": {}, "account": {}}, bridge.AUTH_INVALID),
            (
                "code 200 匿名用户",
                {"code": 200, "profile": {"nickname": ""}, "account": {"anonimousUser": True}},
                bridge.AUTH_INVALID,
            ),
            ("code 500 服务端错误", {"code": 500}, bridge.AUTH_TRANSPORT),
            ("code 502 网关错误", {"code": 502}, bridge.AUTH_TRANSPORT),
            ("非 JSON 响应", "<html>captive portal</html>", bridge.AUTH_TRANSPORT),
        ]
        for label, payload, expected in cases:
            with self.subTest(label):
                if isinstance(payload, str):
                    side_effect = lambda p=payload: p
                else:
                    side_effect = lambda p=payload: dict(p)
                with self._patch_status(side_effect=side_effect):
                    self.assertEqual(self.engine._validate_session(), expected, label)

        # 真正有效：返回 valid 且写入登录态
        with self._patch_status(side_effect=lambda: valid_status_payload()):
            self.assertEqual(self.engine._validate_session(), bridge.AUTH_VALID)
        snap = self.engine.snapshot()
        self.assertTrue(snap["authed"])
        self.assertEqual(snap["nickname"], "回归测试用户")

        # 异常对象（非 requests 异常）也按 transport 处理，不判失效
        with self._patch_status(side_effect=RuntimeError("unexpected")):
            self.assertEqual(self.engine._validate_session(), bridge.AUTH_TRANSPORT)

    def test_transient_codes_keep_credentials(self):
        """429 风控/限流、未知 4xx、0/未知码都不得判凭据失效（按 transport 保留凭据）。

        只有 301/302 或「200 + 空 profile / 匿名账号」才是明确 invalid。
        """
        self._write_mcp_cookie_file()
        self.assertTrue(self.engine._load_cookie_file())
        with open(self.cookie_file, "rb") as fp:
            original = fp.read()

        for code in (429, 403, 400, 418, 0, 999, -1):
            with self.subTest(code=code):
                with self._patch_status(side_effect=lambda c=code: {"code": c}):
                    self.assertEqual(
                        self.engine._validate_session(),
                        bridge.AUTH_TRANSPORT,
                        "code=%s 不是明确的“需要登录”，不应判定凭据失效" % code,
                    )
                self.assertTrue(self.engine._has_user_credentials)
                with open(self.cookie_file, "rb") as fp:
                    self.assertEqual(fp.read(), original, "cookie 文件不得被修改")

        # bootstrap 遇到 429：不得转匿名、不得丢凭据 / 改文件
        engine = self._new_engine()
        with self._patch_status(
            side_effect=lambda: {"code": 429}
        ), self._patch_anonymous() as anon:
            snap = bridge.bootstrap(engine)
        anon.assert_not_called()
        self.assertEqual(snap["auth"], bridge.AUTH_UNVERIFIED)
        self.assertTrue(engine._has_user_credentials)
        self.assertTrue(os.path.exists(self.cookie_file))
        with open(self.cookie_file, "rb") as fp:
            self.assertEqual(fp.read(), original)

        # 302 属于明确的“需要登录”，仍判 invalid（301 已在上一测试覆盖）
        with self._patch_status(side_effect=lambda: {"code": 302}):
            self.assertEqual(self.engine._validate_session(), bridge.AUTH_INVALID)

    # ------------------------------------------------------------------ #
    # 2) bootstrap 网络异常：保留凭据、不转匿名、不覆盖会话
    # ------------------------------------------------------------------ #
    def test_bootstrap_transport_preserves_credentials(self):
        self._write_mcp_cookie_file()
        with open(self.cookie_file, "rb") as fp:
            original = fp.read()

        with self._patch_status(
            side_effect=bridge.requests.exceptions.ConnectionError("network down")
        ), self._patch_anonymous() as anon:
            snap = bridge.bootstrap(self.engine)

        anon.assert_not_called()
        self.assertFalse(snap["authed"], "网络异常时尚未验证，不能算已登录")
        self.assertFalse(snap["anonymous"], "网络异常不得转匿名")
        self.assertEqual(snap["auth"], bridge.AUTH_UNVERIFIED)
        self.assertTrue(snap["authPending"])
        self.assertTrue(self.engine._has_user_credentials)
        self.assertFalse(self.engine._logged_out)
        self.assertTrue(os.path.exists(self.cookie_file), "网络异常不得删除 cookie 文件")
        with open(self.cookie_file, "rb") as fp:
            current = fp.read()
        self.assertEqual(current, original, "网络异常不得修改 cookie 文件")
        self.assertGreater(
            self.engine._auth_next_retry_at, time.time(), "必须安排退避重试"
        )

    def test_bootstrap_invalid_switches_to_anonymous(self):
        self._write_mcp_cookie_file()
        with self._patch_status(side_effect=lambda: {"code": 301}), self._patch_anonymous() as anon:
            snap = bridge.bootstrap(self.engine)
        anon.assert_called_once()
        self.assertFalse(snap["authed"])
        self.assertTrue(snap["anonymous"])
        self.assertEqual(snap["auth"], bridge.AUTH_ANONYMOUS)
        self.assertFalse(self.engine._has_user_credentials, "真失效后不再反复重试旧凭据")

    def test_bootstrap_without_cookie_uses_anonymous(self):
        # 不存在 cookie 文件 → 匿名登录，不产生“凭据待验证”状态
        self.assertFalse(os.path.exists(self.cookie_file))
        with self._patch_anonymous() as anon:
            snap = bridge.bootstrap(self.engine)
        anon.assert_called_once()
        self.assertTrue(snap["anonymous"])
        self.assertFalse(snap["authPending"])
        self.assertFalse(os.path.exists(self.cookie_file))

    # ------------------------------------------------------------------ #
    # 3) status 恢复 + 指数退避（不每次都阻塞）
    # ------------------------------------------------------------------ #
    def test_status_recovers_with_backoff(self):
        self._write_mcp_cookie_file()
        calls = {"n": 0}

        def transport(*args, **kwargs):
            calls["n"] += 1
            raise bridge.requests.exceptions.ConnectionError("network down")

        with self._patch_status(side_effect=transport), self._patch_anonymous() as anon:
            snap = bridge.bootstrap(self.engine)
            anon.assert_not_called()
            self.assertEqual(snap["auth"], bridge.AUTH_UNVERIFIED)
            self.assertEqual(calls["n"], 1, "bootstrap 只校验一次")

            # 退避窗口内的 status：显式把下一次重试推到未来，确保零网络（不依赖墙钟）
            self.engine._auth_next_retry_at = time.time() + 3600
            status = self.engine.cmd_status({})
            self.assertEqual(calls["n"], 1, "退避期内 status 不应打网络")
            self.assertFalse(status["authed"])
            self.assertTrue(status["authPending"])
            self.assertTrue(os.path.exists(self.cookie_file), "退避重试期间必须保留凭据文件")

            # 到期后网络仍不可用：每次到期只重试一次，指数退避（断言状态机内部 delay，
            # 不依赖墙钟差值，避免慢机器上误报）
            scheduled_delays = []
            for _ in range(4):
                scheduled_delays.append(self.engine._auth_retry_delay)  # 本次重试将安排的延迟
                self.engine._auth_next_retry_at = 0
                before = calls["n"]
                status = self.engine.cmd_status({})
                self.assertEqual(calls["n"], before + 1, "到期后应重试一次")
                self.assertGreater(self.engine._auth_next_retry_at, time.time() - 1)
                self.assertFalse(status["authed"])
            self.assertEqual(
                scheduled_delays, [2.0, 4.0, 8.0, 16.0], "退避间隔应按 2→4→8→16 递增"
            )
            self.assertEqual(
                self.engine._auth_retry_delay,
                bridge.AUTH_RETRY_MAX_SECONDS,
                "连续失败后退避应到上限 30s",
            )

            # 网络恢复后：下一次到期的 status 直接恢复账号
            with self._patch_status(side_effect=lambda: valid_status_payload()):
                self.engine._auth_next_retry_at = 0
                status = self.engine.cmd_status({})
            self.assertTrue(status["authed"], "网络恢复后自动恢复登录态")
            self.assertEqual(status["nickname"], "回归测试用户")
            self.assertEqual(status["auth"], bridge.AUTH_VALID)
            self.assertFalse(status["authPending"])
            anon.assert_not_called()

            # 恢复后 status 不再打校验接口
            count_after_recovery = calls["n"]
            with self._patch_status(side_effect=transport):
                self.engine.cmd_status({})
            self.assertEqual(calls["n"], count_after_recovery, "已恢复后 status 不应再校验")

    def test_status_survives_restore_exception(self):
        # status 是 UI 轮询入口：即使恢复逻辑内部异常，也必须返回合法快照而不是报错
        with mock.patch.object(
            self.engine, "_restore_auth", side_effect=RuntimeError("unexpected restore failure")
        ):
            status = self.engine.cmd_status({})
        self.assertIn("authed", status)
        self.assertIn("anonymous", status)
        self.assertFalse(status["authed"])

    def test_ensure_session_recovers_account_without_anonymous(self):
        self._write_mcp_cookie_file()
        with self._patch_status(
            side_effect=bridge.requests.exceptions.ConnectionError("network down")
        ), self._patch_anonymous() as anon:
            bridge.bootstrap(self.engine)
            anon.assert_not_called()
            # 2s 防抖窗口内：命令快速失败为 NETWORK，且不重复打校验
            # （显式把上次尝试时间置到未来，避免依赖真实墙钟）
            self.engine._auth_last_attempt_at = time.time() + 3600
            with self.assertRaises(bridge.BridgeError) as ctx:
                self.engine.ensure_session()
            self.assertEqual(ctx.exception.code, "NETWORK")

        # 网络恢复：数据命令应恢复真实账号（而不是匿名）
        with self._patch_status(side_effect=lambda: valid_status_payload()), self._patch_anonymous() as anon:
            self.engine._auth_last_attempt_at = 0
            session = self.engine.ensure_session()
            self.assertTrue(session.logged_in)
            self.assertFalse(session.is_anonymous)
            anon.assert_not_called()
        self.assertEqual(self.engine._auth_state, bridge.AUTH_VALID)

    def test_anonymous_login_uses_short_timeout(self):
        """匿名登录必须走 AUTH_ANON_TIMEOUT 短超时，且结束后恢复原超时。

        用「立即抛 Timeout」的 mock 验证，不做真实 sleep。
        """
        self.assertLess(
            sum(bridge.AUTH_ANON_TIMEOUT), 20, "匿名登录超时必须显著小于 Host status 的 20s"
        )
        observed = []

        def fake_anon(*args, **kwargs):
            observed.append(bridge.pyncm.GetCurrentSession().request_timeout)
            raise bridge.requests.exceptions.Timeout("mock immediate timeout")

        with mock.patch.object(
            bridge.apis.login, "LoginViaAnonymousAccount", side_effect=fake_anon
        ):
            self.assertFalse(self.engine._try_anonymous(force=True))
        self.assertEqual(observed[-1], bridge.AUTH_ANON_TIMEOUT, "匿名登录应使用短超时")
        self.assertEqual(
            self.engine.session().request_timeout, bridge.REQUEST_TIMEOUT, "超时必须恢复"
        )

        # 凭据 invalid → status 的同步匿名分支同样短超时（立即超时，不阻塞）
        self._write_mcp_cookie_file()
        engine = self._new_engine()
        self.assertTrue(engine._load_cookie_file())
        with self._patch_status(side_effect=lambda: {"code": 301}), mock.patch.object(
            bridge.apis.login, "LoginViaAnonymousAccount", side_effect=fake_anon
        ):
            status = engine.cmd_status({})
        self.assertFalse(status["authed"])
        self.assertEqual(observed[-1], bridge.AUTH_ANON_TIMEOUT)
        self.assertEqual(engine.session().request_timeout, bridge.REQUEST_TIMEOUT)

    # ------------------------------------------------------------------ #
    # 4) 登出：删除失败不得误报成功
    # ------------------------------------------------------------------ #
    def _fake_remove(self, denied_paths):
        real_remove = os.remove

        def side_effect(path, *args, **kwargs):
            if os.path.abspath(str(path)) in denied_paths:
                raise PermissionError(13, "Permission denied", str(path))
            return real_remove(path, *args, **kwargs)

        return side_effect

    def test_clear_cookies_reports_permission_error(self):
        self._write_mcp_cookie_file()
        with open(self.mirror_file, "w", encoding="utf-8") as fp:
            json.dump({"MUSIC_U": "mirror-token"}, fp)

        denied = {os.path.abspath(self.cookie_file)}
        with mock.patch.object(bridge.os, "remove", side_effect=self._fake_remove(denied)):
            deleted, errors = self.engine.clear_cookies()

        self.assertIn(os.path.abspath(self.mirror_file), [os.path.abspath(p) for p in deleted])
        self.assertTrue(errors, "PermissionError 不得被吞掉")
        self.assertIn("Permission denied", errors[0])
        self.assertTrue(os.path.exists(self.cookie_file), "删除失败的凭据应仍在磁盘上")

    def test_logout_failure_is_not_reported_as_success(self):
        self._write_mcp_cookie_file()
        with open(self.mirror_file, "w", encoding="utf-8") as fp:
            json.dump({"MUSIC_U": "mirror-token"}, fp)
        denied = {
            os.path.abspath(self.cookie_file),
            os.path.abspath(self.mirror_file),
        }
        with self._patch_login_logout(), self._patch_anonymous() as anon, mock.patch.object(
            bridge.os, "remove", side_effect=self._fake_remove(denied)
        ):
            with self.assertRaises(bridge.BridgeError) as ctx:
                self.engine.cmd_logout({})

        self.assertEqual(ctx.exception.code, "INTERNAL")
        self.assertIn("退出登录失败", ctx.exception.message)
        self.assertIn("Permission denied", ctx.exception.message)
        self.assertTrue(os.path.exists(self.cookie_file))
        self.assertTrue(self.engine._logged_out, "删除失败后也不许自动恢复旧账号")
        self.assertFalse(self.engine.session().logged_in, "内存会话必须已清空")
        anon.assert_not_called()

    # ------------------------------------------------------------------ #
    # 5) 成功登出：清干净 + 禁止自动恢复旧账号
    # ------------------------------------------------------------------ #
    def test_logout_remote_uses_short_timeout_but_local_cleanup_decides(self):
        """远端 LoginLogout 必须短超时；远端失败/超时只标记 serverLogout=false。"""
        self._write_mcp_cookie_file()
        with open(self.mirror_file, "w", encoding="utf-8") as fp:
            json.dump({"MUSIC_U": "mirror-token"}, fp)
        observed = {}

        def fake_remote_logout(*args, **kwargs):
            observed["timeout"] = bridge.pyncm.GetCurrentSession().request_timeout
            raise bridge.requests.exceptions.Timeout("mock remote logout timeout")

        with self._patch_login_logout(
            side_effect=fake_remote_logout
        ), self._patch_anonymous() as anon:
            result = self.engine.cmd_logout({})

        anon.assert_called_once()
        self.assertEqual(observed["timeout"], bridge.AUTH_ANON_TIMEOUT, "远端登出应使用短超时")
        self.assertTrue(result["ok"], "远端失败但本地凭据清理成功，仍算登出成功")
        self.assertFalse(result["serverLogout"])
        self.assertTrue(result["serverLogoutError"])
        self.assertEqual(len(result["deleted"]), 2, "两个本地凭据文件都应删除")
        self.assertFalse(os.path.exists(self.cookie_file))
        self.assertFalse(os.path.exists(self.mirror_file))
        self.assertTrue(self.engine._logged_out)
        self.assertEqual(
            self.engine.session().request_timeout, bridge.REQUEST_TIMEOUT, "超时必须恢复"
        )

    def test_logout_success_clears_and_blocks_auto_restore(self):
        self._write_mcp_cookie_file()
        with open(self.mirror_file, "w", encoding="utf-8") as fp:
            json.dump({"MUSIC_U": "mirror-token"}, fp)

        with self._patch_login_logout(), self._patch_anonymous() as anon:
            result = self.engine.cmd_logout({})

        anon.assert_called_once()
        self.assertTrue(result["ok"])
        self.assertTrue(result["serverLogout"])
        self.assertEqual(len(result["deleted"]), 2)
        self.assertFalse(os.path.exists(self.cookie_file), "主 cookie 必须删除")
        self.assertFalse(os.path.exists(self.mirror_file), "MCP 镜像必须删除")
        self.assertTrue(self.engine._logged_out)
        self.assertFalse(self.engine._has_user_credentials)
        snap = self.engine.snapshot()
        self.assertFalse(snap["authed"])
        self.assertTrue(snap["anonymous"])

        # 即使旧 cookie 文件又被外部放回来，成功登出后 status 也不得恢复旧账号
        with open(self.cookie_file, "w", encoding="utf-8") as fp:
            json.dump({"MUSIC_U": "resurrected-old-token"}, fp)
        calls = {"n": 0}

        def counted_status(*args, **kwargs):
            calls["n"] += 1
            return valid_status_payload()

        with self._patch_status(side_effect=counted_status):
            status = self.engine.cmd_status({})
        self.assertEqual(calls["n"], 0, "登出后不得自动调用校验恢复旧账号")
        self.assertFalse(status["authed"], "登出后不得恢复旧账号")
        self.assertTrue(status["anonymous"])

    def test_login_after_logout_rearms_restore(self):
        # 先处于“已登出”状态
        self.engine._logged_out = True
        self.engine._auth_state = bridge.AUTH_LOGGED_OUT
        self.engine._new_session()

        with mock.patch.object(
            bridge.apis.login, "LoginQrcodeCheck", return_value={"code": 803}
        ), self._patch_status(side_effect=lambda: valid_status_payload()), self._patch_anonymous():
            data = self.engine.cmd_login_check({"key": "fake-unikey-1234567890"})

        self.assertEqual(data["state"], "ok")
        self.assertEqual(data["nickname"], "回归测试用户")
        self.assertFalse(self.engine._logged_out, "重新登录后应解除登出封印")
        self.assertTrue(self.engine._has_user_credentials)
        self.assertEqual(self.engine._auth_state, bridge.AUTH_VALID)
        self.assertTrue(self.engine.snapshot()["authed"])
        self.assertTrue(os.path.exists(self.cookie_file), "登录成功应写入 cookie 文件")
        self.assertTrue(os.path.exists(self.mirror_file), "登录成功应写 MCP 镜像")

    # ------------------------------------------------------------------ #
    # 6) cookie 格式与 MCP 兼容性保持不变
    # ------------------------------------------------------------------ #
    def test_cookie_format_roundtrip_and_mcp_compat(self):
        doc = self._write_own_cookie_file()
        self.assertEqual(
            set(doc.keys()),
            {"version", "savedAt", "session", "cookies", "profile", "previousSavedAt"},
            "主 cookie 文件顶层格式必须保持兼容",
        )
        self.assertEqual(
            set((doc.get("session") or {}).keys()),
            {"cookies", "eapi_config", "login_info", "csrf_token"},
            "session 序列化格式必须保持兼容",
        )
        self.assertEqual(
            set((doc.get("profile") or {}).keys()),
            {"nickname", "avatar", "userId", "vipType", "level"},
        )
        self.assertEqual(doc["cookies"].get("MUSIC_U"), "fake-music-u-token")
        with open(self.mirror_file, "r", encoding="utf-8") as fp:
            mirror = json.load(fp)
        self.assertIsInstance(mirror, dict, "MCP 镜像必须是扁平 {name: value} 字典")
        self.assertEqual(mirror.get("MUSIC_U"), "fake-music-u-token")

        # 本插件格式可被重新载入
        engine = self._new_engine()
        self.assertTrue(engine._load_cookie_file())
        self.assertTrue(engine._has_user_credentials)
        self.assertEqual(engine.session().cookies.get("MUSIC_U"), "fake-music-u-token")

        # MCP/legacy 扁平格式也可载入
        os.remove(self.cookie_file)
        self._write_mcp_cookie_file("legacy-flat-token")
        engine2 = self._new_engine()
        self.assertTrue(engine2._load_cookie_file())
        self.assertTrue(engine2._has_user_credentials)
        self.assertEqual(engine2.session().cookies.get("MUSIC_U"), "legacy-flat-token")

    # ------------------------------------------------------------------ #
    # 7) 短超时机制（登录态校验不拖死 status）
    # ------------------------------------------------------------------ #
    def test_timeout_session_supports_short_override(self):
        session = bridge._TimeoutSession()
        captured = {}

        def fake_request(method, url, *args, **kwargs):
            captured["timeout"] = kwargs.get("timeout")
            return object()

        with mock.patch.object(bridge.requests.Session, "request", side_effect=fake_request):
            session.request("GET", "https://example.invalid/")
            self.assertEqual(captured["timeout"], bridge.REQUEST_TIMEOUT)

            session.request_timeout = bridge.AUTH_CHECK_TIMEOUT
            session.request("GET", "https://example.invalid/")
            self.assertEqual(captured["timeout"], bridge.AUTH_CHECK_TIMEOUT)

            # 显式传入的 timeout 不被覆盖
            session.request("GET", "https://example.invalid/", timeout=(1, 1))
            self.assertEqual(captured["timeout"], (1, 1))

    # ------------------------------------------------------------------ #
    # 8) 隔离自检
    # ------------------------------------------------------------------ #
    def test_all_engines_point_to_tempdir(self):
        engines = [self.engine, self._new_engine()]
        for engine in engines:
            self.assertTrue(os.path.abspath(engine.cookie_file).startswith(self.tmpdir))
            self.assertTrue(os.path.abspath(bridge.MIRROR_COOKIE_FILE).startswith(self.tmpdir))
            self.assertFalse(os.path.abspath(engine.cookie_file) == REAL_COOKIE_PATH)


if __name__ == "__main__":
    unittest.main(verbosity=2)
