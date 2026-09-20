"""
CI smoke/unit tests for the Python backend. No decky-loader runtime needed —
`decky.py` in this same directory stands in for the real thing (see its
docstring). Run with: `python -m unittest discover -s tests -v` from decky/.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_PLUGIN_DIR = os.path.dirname(_TESTS_DIR)
_PY_MODULES_DIR = os.path.join(_PLUGIN_DIR, "py_modules")

# `tests/` first so `import decky` resolves to the stub, not (absent) the real package.
for path in (_TESTS_DIR, _PY_MODULES_DIR, _PLUGIN_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)


class ImportSmokeTest(unittest.TestCase):
    """Every module actually imports cleanly and Plugin() instantiates —
    this alone would have caught several typos during development that a
    plain syntax check (py_compile) can't (bad attribute/function names,
    wrong cross-module references, circular imports)."""

    def test_main_imports_and_plugin_instantiates(self):
        import main  # noqa: F401 - import is the assertion

        main.Plugin()

    def test_all_py_modules_import(self):
        for filename in sorted(os.listdir(_PY_MODULES_DIR)):
            if not filename.endswith(".py"):
                continue
            module_name = filename[:-3]
            with self.subTest(module=module_name):
                __import__(module_name)


class VdfLiteTest(unittest.TestCase):
    def test_parses_libraryfolders_style_document(self):
        import vdf_lite

        text = """
        "libraryfolders"
        {
            "0"
            {
                "path"		"/home/deck/.local/share/Steam"
                "label"		""
            }
            "1"
            {
                "path"		"/run/media/deck/SDCARD"
            }
        }
        """
        result = vdf_lite.parse(text)
        root = vdf_lite.get_child(result, "libraryfolders")
        self.assertIsInstance(root, dict)
        self.assertEqual(vdf_lite.get_child(root, "0", "path"), "/home/deck/.local/share/Steam")
        self.assertEqual(vdf_lite.get_child(root, "1", "path"), "/run/media/deck/SDCARD")

    def test_parses_appmanifest_style_document(self):
        import vdf_lite

        text = """
        "AppState"
        {
            "appid"		"632360"
            "installdir"		"Risk of Rain 2"
            "name"		"Risk of Rain 2"
            "buildid"		"12345678"
        }
        """
        app_state = vdf_lite.get_child(vdf_lite.parse(text), "AppState")
        self.assertEqual(vdf_lite.get_child(app_state, "installdir"), "Risk of Rain 2")
        self.assertEqual(vdf_lite.get_child(app_state, "buildid"), "12345678")

    def test_get_child_is_case_insensitive(self):
        import vdf_lite

        result = vdf_lite.parse('"AppState" { "InstallDir" "Foo" }')
        self.assertEqual(vdf_lite.get_child(result, "appstate", "installdir"), "Foo")

    def test_get_child_missing_key_returns_none(self):
        import vdf_lite

        result = vdf_lite.parse('"AppState" { "installdir" "Foo" }')
        self.assertIsNone(vdf_lite.get_child(result, "AppState", "nonexistent"))


class UnlockerDetectionTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def _touch(self, filename: str):
        with open(os.path.join(self.directory, filename), "wb") as f:
            f.write(b"")

    def test_detects_steamworks_marker(self):
        import unlocker_detection

        self._touch("steam_api64.dll")
        entries = {e["key"]: e for e in unlocker_detection.describe(self.directory)}
        self.assertTrue(entries["smokeapi"]["detected"])
        self.assertTrue(entries["creamapi"]["detected"])
        self.assertFalse(entries["screamapi"]["detected"])
        self.assertFalse(entries["uplay_r1"]["detected"])
        self.assertFalse(entries["uplay_r2"]["detected"])

    def test_detects_screamapi_marker(self):
        import unlocker_detection

        self._touch("EOSSDK-Win64-Shipping.dll")
        entries = {e["key"]: e for e in unlocker_detection.describe(self.directory)}
        self.assertTrue(entries["screamapi"]["detected"])
        self.assertFalse(entries["smokeapi"]["detected"])

    def test_nothing_detected_in_empty_directory(self):
        import unlocker_detection

        entries = unlocker_detection.describe(self.directory)
        self.assertTrue(all(not e["detected"] for e in entries if e["key"] != "koaloader"))

    def test_recommended_default_prefers_smokeapi_when_steamworks_present(self):
        import unlocker_detection

        self._touch("steam_api.dll")
        self.assertEqual(unlocker_detection.recommended_default(self.directory), "smokeapi")

    def test_currently_installed_is_none_for_fresh_directory(self):
        import unlocker_detection

        self.assertIsNone(unlocker_detection.currently_installed(self.directory))

    def test_currently_installed_distinguishes_creamapi_from_smokeapi(self):
        """SmokeAPI and CreamAPI back up the original DLL under the exact same
        filename (steam_api64_o.dll), so that alone can't tell them apart —
        currently_installed() has to key off each one's own config file instead,
        or switching unlockers misattributes which one is active and leaves the
        old one's config behind uncleaned."""
        import unlocker_detection

        self._touch("steam_api64_o.dll")
        self._touch("cream_api.ini")
        self.assertEqual(unlocker_detection.currently_installed(self.directory), "creamapi")


class BitnessTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def _touch(self, filename: str):
        with open(os.path.join(self.directory, filename), "wb") as f:
            f.write(b"")

    def test_detects_64_bit_from_steam_api64(self):
        import bitness

        self._touch("steam_api64.dll")
        self.assertTrue(bitness.is_64_bit(self.directory))

    def test_detects_32_bit_from_steam_api(self):
        import bitness

        self._touch("steam_api.dll")
        self.assertFalse(bitness.is_64_bit(self.directory))

    def test_defaults_to_64_bit_with_no_signal(self):
        import bitness

        self.assertTrue(bitness.is_64_bit(self.directory))


class CreamApiConfigTest(unittest.TestCase):
    """cream_api.ini needs the game's real Steam AppId — CreamAPI validates it against
    the running game and refuses to load with a bogus one, which is what a hardcoded
    "AppId=0" produced."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def test_writes_the_real_app_id(self):
        import creamapi

        creamapi._write_config(self.directory, "632360", [("1607890", "Survivors of the Void")])
        with open(os.path.join(self.directory, "cream_api.ini"), "r", encoding="utf-8") as f:
            contents = f.read()

        self.assertIn("AppId=632360", contents)
        self.assertIn("1607890=Survivors of the Void", contents)


class SteamCmdDlcFallbackTest(unittest.IsolatedAsyncioTestCase):
    """steamcmd.get_app_info's web API response is often missing depots/extended
    (an anonymous login without a license for the game — "_missing_token") even
    though it has the game's own name. When that happens, the DLC id list should
    come from the public store page instead of silently ending up empty."""

    async def test_falls_back_to_store_api_when_webapi_lacks_depot_data(self):
        import steamcmd

        game_data = {"common": {"name": "Risk of Rain 2"}}  # no depots/extended
        dlc_data = {"common": {"name": "Risk of Rain 2: Survivors of the Void"}}

        async def fake_webapi_query(app_id, is_dlc=False):
            if app_id == "632360":
                return game_data
            if app_id == "1607890":
                return dlc_data
            return None

        with patch("steamcmd.steamcmd_webapi.query", side_effect=fake_webapi_query), patch(
            "steamcmd.steam_store_api.get_dlc_ids", AsyncMock(return_value=["1607890"])
        ):
            info = await steamcmd.get_app_info("632360")

        self.assertEqual(info["name"], "Risk of Rain 2")
        self.assertEqual(
            info["dlcs"],
            [
                {
                    "id": "1607890",
                    "name": "Risk of Rain 2: Survivors of the Void",
                    "has_depot": None,
                }
            ],
        )

    async def test_prefers_depot_derived_dlc_ids_when_present(self):
        import steamcmd

        game_data = {
            "common": {"name": "Risk of Rain 2"},
            "extended": {"listofdlc": "1607890"},
        }

        async def fake_webapi_query(app_id, is_dlc=False):
            if app_id == "632360":
                return game_data
            return {"common": {"name": "Risk of Rain 2: Survivors of the Void"}}

        with patch("steamcmd.steamcmd_webapi.query", side_effect=fake_webapi_query), patch(
            "steamcmd.steam_store_api.get_dlc_ids", AsyncMock()
        ) as store_api:
            info = await steamcmd.get_app_info("632360")

        store_api.assert_not_called()
        self.assertEqual([dlc["id"] for dlc in info["dlcs"]], ["1607890"])

    async def test_flags_dlc_ids_that_have_their_own_depot(self):
        import steamcmd

        game_data = {
            "common": {"name": "Some Game"},
            "extended": {"listofdlc": "111,222"},
            "depots": {
                "1": {"dlcappid": "111"},
                "branches": {"public": {"buildid": "1"}},
            },
        }

        async def fake_webapi_query(app_id, is_dlc=False):
            if app_id == "632360":
                return game_data
            if app_id == "111":
                return {"common": {"name": "DLC With Depot"}}
            if app_id == "222":
                return {"common": {"name": "DLC Without Depot"}}
            return None

        with patch("steamcmd.steamcmd_webapi.query", side_effect=fake_webapi_query):
            info = await steamcmd.get_app_info("632360")

        by_id = {dlc["id"]: dlc["has_depot"] for dlc in info["dlcs"]}
        self.assertEqual(by_id, {"111": True, "222": False})


class ForceCleanupTest(unittest.IsolatedAsyncioTestCase):
    """The escape hatch for when Steam's "verify integrity" restores the real
    steam_api64.dll but leaves an unlocker's own leftover files behind (config,
    orphaned backup) since those aren't part of the game and Steam doesn't know
    to remove them — force_cleanup should sweep them regardless of which
    unlocker currently_installed() thinks is active."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def _write(self, filename: str, content: bytes = b""):
        with open(os.path.join(self.directory, filename), "wb") as f:
            f.write(content)

    async def test_sweeps_leftover_smokeapi_files_and_restores_original_dll(self):
        import unlocker_detection

        # Simulates the post-"verify integrity" state: Steam already restored the
        # real DLL directly, but the orphaned backup and SmokeAPI's config are
        # both leftovers it doesn't know to clean up.
        self._write("steam_api64.dll", b"genuine steam dll")
        self._write("steam_api64_o.dll", b"genuine steam dll")
        self._write("SmokeAPI.config.json", b"{}")

        await unlocker_detection.force_cleanup(self.directory)

        self.assertFalse(os.path.isfile(os.path.join(self.directory, "SmokeAPI.config.json")))
        self.assertFalse(os.path.isfile(os.path.join(self.directory, "steam_api64_o.dll")))
        self.assertTrue(os.path.isfile(os.path.join(self.directory, "steam_api64.dll")))
        self.assertIsNone(unlocker_detection.currently_installed(self.directory))

    async def test_is_a_no_op_on_a_clean_directory(self):
        import unlocker_detection

        await unlocker_detection.force_cleanup(self.directory)  # should not raise
        self.assertEqual(os.listdir(self.directory), [])


class GetGamePageIntegrityTest(unittest.IsolatedAsyncioTestCase):
    """get_game_page() cross-checks install_state's JSON record against what's
    actually on disk. The two directions aren't symmetric: "disk shows nothing
    at all" is unambiguous (Steam's "verify integrity" restoring the original
    DLL looks exactly like this) and self-heals by correcting our own stale
    record — only "disk shows something *different*" is genuinely ambiguous
    (could be a foreign install, could be real corruption) and gets flagged for
    the user to check, since we can't safely guess which."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.directory = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def _touch(self, filename: str):
        with open(os.path.join(self.directory, filename), "wb") as f:
            f.write(b"")

    async def test_self_heals_when_disk_shows_nothing_installed(self):
        """e.g. Steam's "verify integrity" restored the original DLL — the JSON
        record is simply stale now, not a real conflict, so it corrects itself
        instead of leaving the user stuck on a "please verify" message forever."""
        import install_state
        import main

        install_state.set_installed("632360", "smokeapi", ["123"], proxy=False, proxy_dll=None)
        # Nothing actually on disk for this fresh directory — disk says "nothing installed".

        game = {
            "app_id": "632360",
            "name": "Risk of Rain 2",
            "branch": "public",
            "build_id": 0,
            "game_directory": self.directory,
        }
        with patch("main.steam_library.find_game", return_value=game), patch(
            "main.steamcmd.get_app_info", AsyncMock(return_value=None)
        ):
            page = await main.Plugin().get_game_page("632360")

        self.assertIsNone(page["integrity_error"])
        self.assertFalse(page["installed"])
        self.assertFalse(install_state.get_state("632360")["installed"])

    async def test_flags_mismatch_when_disk_shows_a_different_unlocker(self):
        import install_state
        import main

        install_state.set_installed("632362", "smokeapi", ["123"], proxy=False, proxy_dll=None)
        self._touch("cream_api.ini")  # disk actually shows CreamAPI installed, not SmokeAPI

        game = {
            "app_id": "632362",
            "name": "Risk of Rain 2",
            "branch": "public",
            "build_id": 0,
            "game_directory": self.directory,
        }
        with patch("main.steam_library.find_game", return_value=game), patch(
            "main.steamcmd.get_app_info", AsyncMock(return_value=None)
        ):
            page = await main.Plugin().get_game_page("632362")

        self.assertIsNotNone(page["integrity_error"])
        self.assertIn("SmokeAPI", page["integrity_error"])
        self.assertIn("CreamAPI", page["integrity_error"])

    async def test_no_mismatch_when_json_and_disk_agree(self):
        import main

        # Neither side thinks anything's installed for this fresh appid — agree by default.
        game = {
            "app_id": "632361",
            "name": "Some Other Game",
            "branch": "public",
            "build_id": 0,
            "game_directory": self.directory,
        }
        with patch("main.steam_library.find_game", return_value=game), patch(
            "main.steamcmd.get_app_info", AsyncMock(return_value=None)
        ):
            page = await main.Plugin().get_game_page("632361")

        self.assertIsNone(page["integrity_error"])


class ActionLogTest(unittest.IsolatedAsyncioTestCase):
    async def test_log_call_writes_version_and_call_and_result(self):
        import action_log
        import decky

        class Dummy:
            @action_log.log_call
            async def do_thing(self, x):
                return {"ok": True, "x": x}

        result = await Dummy().do_thing(5)
        self.assertEqual(result, {"ok": True, "x": 5})

        log_path = os.path.join(decky.DECKY_PLUGIN_LOG_DIR, "creamdeck_actions.log")
        with open(log_path, "r", encoding="utf-8") as f:
            contents = f.read()
        self.assertIn(f"CreamDeck v{decky.DECKY_PLUGIN_VERSION} starting", contents)
        self.assertIn("do_thing called", contents)
        self.assertIn("do_thing returned", contents)

    async def test_log_call_logs_exceptions_and_reraises(self):
        import action_log

        class Dummy:
            @action_log.log_call
            async def boom(self):
                raise ValueError("nope")

        with self.assertRaises(ValueError):
            await Dummy().boom()


class InstallStateTest(unittest.TestCase):
    def test_round_trips_install_state(self):
        import install_state

        install_state.set_installed("632360", "smokeapi", ["123", "456"], proxy=False, proxy_dll=None)
        state = install_state.get_state("632360")
        self.assertEqual(state["unlocker"], "smokeapi")
        self.assertTrue(state["installed"])
        self.assertEqual(state["enabled_dlc_ids"], ["123", "456"])
        self.assertIsNone(install_state.get_state("unknown_appid"))

    def test_mark_uninstalled_keeps_last_selection(self):
        import install_state

        install_state.set_installed("632360", "smokeapi", ["123"], proxy=False, proxy_dll=None)
        install_state.mark_uninstalled("632360")
        state = install_state.get_state("632360")
        self.assertFalse(state["installed"])
        self.assertEqual(state["enabled_dlc_ids"], ["123"])


if __name__ == "__main__":
    unittest.main()
