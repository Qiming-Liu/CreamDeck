"""The read-only views behind the redesigned pages: file report, game list, log and update check."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_backend  # installs the runtime stubs and module search paths  # noqa: F401
import action_log
import decky
import install_manager as manager
import install_state
import main
import update_check


class FileReportTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.game = self.root / "game"
        self.game.mkdir()
        settings = patch.object(decky, "DECKY_PLUGIN_SETTINGS_DIR", str(self.root / "settings"))
        settings.start()
        self.addCleanup(settings.stop)
        self.resources = (self.root / "32.dll", self.root / "64.dll")
        self.resources[0].write_bytes(b"unlocker32")
        self.resources[1].write_bytes(b"unlocker64")
        self.catalog = {"dlcs": [{"id": "20", "name": "DLC", "has_depot": None}], "updated_at": 1}

    async def install(self, proxy=False):
        (self.game / "steam_api64.dll").write_bytes(b"original game DLL")
        game = {"game_directory": str(self.game), "name": "Game", "branch": "public", "build_id": 1}
        self.patches = [patch("main.steam_library.find_game", return_value=game),
                        patch("main.steamcmd.cached_page", return_value=self.catalog),
                        patch("creamapi._bundled_dlls", return_value=tuple(map(str, self.resources)))]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        result = await main.Plugin().install_dlc_unlocker("10", "creamapi", ["20"], proxy, "version", ".")
        self.assertTrue(result["success"], result)

    def report(self):
        return {row["name"]: row for row in manager.file_report(str(self.game), install_state.get_state("10"))}

    async def test_healthy_direct_install_restores_the_original_on_uninstall(self):
        await self.install()
        page = await main.Plugin().get_game_page("10")
        self.assertEqual(page["api_dlls"], ["steam_api64.dll"])
        self.assertTrue(page["has_record"])
        rows = {row["name"]: row for row in page["files"]}
        self.assertEqual(rows["steam_api64.dll"], {"name": "steam_api64.dll", "role": "dll", "status": "same", "action": "restore"})
        self.assertEqual(rows["steam_api64_o.dll"]["action"], "restore")
        self.assertEqual(rows["cream_api.ini"], {"name": "cream_api.ini", "role": "config", "status": "same", "action": "delete"})

    async def test_report_matches_what_uninstall_keeps(self):
        await self.install()
        (self.game / "steam_api64.dll").write_bytes(b"restored by Steam")
        rows = self.report()
        self.assertEqual((rows["steam_api64.dll"]["status"], rows["steam_api64.dll"]["action"]), ("modified", "keep"))
        self.assertEqual(rows["steam_api64_o.dll"]["action"], "delete")
        kept = [name for name, row in rows.items() if row["action"] == "keep"]
        result = await main.Plugin().uninstall_dlc_unlocker("10")
        self.assertEqual(result["preserved_files"], kept)

    async def test_changed_backup_blocks_every_file(self):
        await self.install()
        (self.game / "steam_api64_o.dll").write_bytes(b"tampered backup")
        self.assertEqual({row["action"] for row in self.report().values()}, {"blocked"})
        result = await main.Plugin().uninstall_dlc_unlocker("10")
        self.assertEqual(result["error_code"], "backup_changed")

    async def test_proxy_install_lists_proxy_files_for_deletion(self):
        await self.install(proxy=True)
        rows = self.report()
        self.assertEqual(rows["version.dll"]["role"], "proxy")
        self.assertEqual({row["action"] for row in rows.values()}, {"delete"})
        self.assertNotIn("steam_api64.dll", rows)

    async def test_external_files_are_listed_but_not_owned(self):
        (self.game / "steam_api64.dll").write_bytes(b"other tool DLL")
        (self.game / "steam_api64_o.dll").write_bytes(b"original")
        (self.game / "cream_api.ini").write_text("[steam]\n")
        game = {"game_directory": str(self.game), "name": "Game", "branch": "public", "build_id": 1}
        with patch("main.steam_library.find_game", return_value=game), patch("main.steamcmd.cached_page", return_value={}):
            page = await main.Plugin().get_game_page("10")
        self.assertEqual(page["file_status"], "external")
        self.assertEqual(page["external_files"], ["cream_api.ini", "steam_api64.dll", "steam_api64_o.dll"])
        self.assertFalse(page["has_record"])
        self.assertEqual(page["files"], [])


class InstalledGamesTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        settings = patch.object(decky, "DECKY_PLUGIN_SETTINGS_DIR", self.temporary.name)
        settings.start()
        self.addCleanup(settings.stop)

    async def test_lists_installed_records_without_touching_game_files(self):
        install_state.set_installed("1", "creamapi", ["5", "6"], files={"cream_api.ini": "x"})
        install_state.set_installed("2", "smokeapi", ["7"], proxy=True, proxy_dll="version")
        install_state.set_installed("3", "creamapi", [])
        install_state.mark_uninstalled("3")

        def find(app_id):
            return {"name": "Alpha"} if app_id == "1" else None

        with patch("main.steam_library.find_game", side_effect=find), patch("main.manager.snapshot") as snapshot:
            result = await main.Plugin().list_installed_games()
        snapshot.assert_not_called()
        self.assertEqual(result["games"], [
            {"app_id": "2", "name": None, "unlocker": "smokeapi", "proxy": True, "dlc_count": 1},
            {"app_id": "1", "name": "Alpha", "unlocker": "creamapi", "proxy": False, "dlc_count": 2},
        ])


class ActionLogViewTest(unittest.IsolatedAsyncioTestCase):
    async def test_reads_the_tail_and_clears_rotated_files(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(decky, "DECKY_PLUGIN_LOG_DIR", directory):
            path = os.path.join(directory, "creamdeck_actions.log")
            Path(path).write_text("".join(f"line {index}\n" for index in range(300)), encoding="utf-8")
            Path(f"{path}.1").write_text("old\n", encoding="utf-8")
            result = await main.Plugin().get_action_log(200)
            self.assertEqual(len(result["lines"]), 200)
            self.assertEqual(result["lines"][-1], "line 299")
            action_log.clear()
            self.assertEqual(Path(path).read_text(encoding="utf-8"), "")
            self.assertFalse(os.path.exists(f"{path}.1"))


class UpdateCheckTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        settings = patch.object(decky, "DECKY_PLUGIN_SETTINGS_DIR", self.temporary.name)
        settings.start()
        self.addCleanup(settings.stop)

    def test_compares_versions_numerically(self):
        self.assertTrue(update_check.newer("1.0.10", "1.0.9"))
        self.assertFalse(update_check.newer("1.0.5", "1.0.5"))
        self.assertFalse(update_check.newer(None, "1.0.5"))
        self.assertFalse(update_check.newer("nightly", "1.0.5"))

    def test_checks_at_most_weekly_and_retries_failures_hourly(self):
        with patch("update_check._fetch", return_value="1.0.6") as fetch:
            self.assertEqual(update_check.latest_version(now=1000), "1.0.6")
            self.assertEqual(update_check.latest_version(now=1000 + 6 * 86400), "1.0.6")
            self.assertEqual(fetch.call_count, 1)
            update_check.latest_version(now=1000 + 8 * 86400)
            self.assertEqual(fetch.call_count, 2)
        with patch("update_check._fetch", side_effect=OSError("offline")) as fetch:
            self.assertIsNone(update_check.latest_version(force=True, now=10 ** 6))
            self.assertIsNone(update_check.latest_version(now=10 ** 6 + 60))
            self.assertEqual(fetch.call_count, 1)
        cache = json.loads(Path(self.temporary.name, "update_check.json").read_text(encoding="utf-8"))
        self.assertIsNone(cache["latest"])


if __name__ == "__main__":
    unittest.main()
