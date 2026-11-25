"""The read-only views behind the redesigned pages: file report, game list, log and update check."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_backend  # installs the runtime stubs and module search paths  # noqa: F401
import decky
import install_manager as manager
import install_state
import main
import plugin_log
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


class RemoveLeftoverTest(unittest.IsolatedAsyncioTestCase):
    """A game Steam uninstalled: its manifest is gone, its folder and the record remain."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.library = Path(self.temporary.name, "steamapps")
        for name in ("Gone", "Kept"):
            (self.library / "common" / name).mkdir(parents=True)
        (self.library / "appmanifest_2.acf").write_text('"AppState"\n{\n\t"installdir"\t\t"Kept"\n}\n')
        for patcher in (patch.object(decky, "DECKY_PLUGIN_SETTINGS_DIR", str(Path(self.temporary.name, "settings"))),
                        patch("main.steam_library._library_folders", return_value=[str(self.library)]),
                        patch("main.steam_library.find_game", return_value=None)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def install(self, folder, app_id="1"):
        directory = self.library / "common" / folder
        (directory / "cream_api.ini").write_text(f"appid = {app_id}")
        (directory / "version.dll").write_bytes(b"proxy")
        (directory / "save.dat").write_bytes(b"user data")
        install_state.set_installed(app_id, "creamapi", ["5"], proxy=True, proxy_dll="version",
                                    target_directory=".", files=manager.snapshot(str(directory)))
        return directory

    async def test_deletes_matching_files_and_forgets_the_game(self):
        directory = self.install("Gone")
        result = await main.Plugin().remove_leftover("1")
        self.assertEqual(result, {"success": True, "files_removed": True})
        self.assertEqual(sorted(os.listdir(directory)), ["save.dat"])
        self.assertIsNone(install_state.get_state("1"))

    async def test_changed_files_and_claimed_folders_are_left_alone(self):
        directory = self.install("Gone")
        (directory / "cream_api.ini").write_text("edited by the user")
        # Another game's folder holds the very same files; a manifest claims it.
        claimed = self.install("Kept")
        result = await main.Plugin().remove_leftover("1")
        self.assertEqual(result, {"success": True, "files_removed": False})
        for folder in (directory, claimed):
            self.assertEqual(sorted(os.listdir(folder)), ["cream_api.ini", "save.dat", "version.dll"])
        self.assertIsNone(install_state.get_state("1"))

    async def test_refuses_a_game_that_is_back_in_the_library(self):
        directory = self.install("Gone")
        with patch("main.steam_library.find_game", return_value={"name": "Back"}):
            result = await main.Plugin().remove_leftover("1")
        self.assertEqual(result["error_code"], "game_in_library")
        self.assertIn("version.dll", os.listdir(directory))
        self.assertTrue(install_state.get_state("1")["installed"])


class LogRpcTest(unittest.IsolatedAsyncioTestCase):
    async def test_frontend_entries_are_read_exported_and_cleared(self):
        with tempfile.TemporaryDirectory() as directory:
            log = plugin_log.PluginLog(os.path.join(directory, "logs"), "creamdeck")
            log.attach(decky.logger, "CreamDeck test started")
            try:
                with patch.object(main, "LOG", log), patch.object(decky, "DECKY_USER_HOME", directory):
                    plugin = main.Plugin()
                    await plugin.log_frontend("error", "Export log: disk full")
                    entries = await plugin.get_log(500)
                    self.assertEqual((entries[-1]["level"], entries[-1]["message"]),
                                     ("ERROR", "[frontend] Export log: disk full"))
                    exported = await plugin.export_log()
                    self.assertRegex(exported, r"^~/Downloads/creamdeck-log-\d{8}-\d{6}\.log$")
                    text = Path(directory, exported[2:]).read_text(encoding="utf-8")
                    self.assertIn("[frontend] Export log: disk full", text)
                    await plugin.clear_log()
                    self.assertEqual([entry["message"] for entry in await plugin.get_log(500)], ["[user] Clear the log: done"])
            finally:
                log.detach()


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

    def test_test_builds_are_offered_only_to_testers(self):
        for installed, release, offered in (
            ("1.0.6", "v1.0.7-test", False),
            ("1.0.6", "v1.0.6-test", False),
            ("1.0.7-test", "v1.0.7", True),
            ("1.0.6-test", "v1.0.6", True),
            ("1.0.7-test", "v1.0.7-test", False),
            ("1.0.7-test", "v1.0.7-test2", True),
            ("1.0.7-test2", "v1.0.7-test10", True),
            ("1.0.7-test2", "v1.0.7-test", False),
            ("1.0.6-test", "v1.0.7-test", True),
            ("1.0.7-test", "v1.0.6", False),
        ):
            self.assertEqual(update_check.newer(update_check._canonical(release), installed), offered, (installed, release))

    def test_mistyped_tags_count_as_the_same_version(self):
        for tag in ("v1.2.0", "1.2.0", "V1.2.0", "v1.2", "1.2", "1.20", "v1.20", " v1.2.0 "):
            self.assertEqual(update_check._canonical(tag), "1.2.0", tag)
            self.assertFalse(update_check.newer(tag, "1.2.0"), tag)
        self.assertTrue(update_check.newer("1.21", "1.2.0"))

    def test_checks_at_most_daily_and_retries_failures_hourly(self):
        with patch("update_check._fetch", return_value=("1.0.6", "1.0.6")) as fetch:
            self.assertEqual(update_check.latest_version(now=1000), "1.0.6")
            self.assertEqual(update_check.latest_version(now=1000 + 86400 - 1), "1.0.6")
            self.assertEqual(fetch.call_count, 1)
            update_check.latest_version(now=1000 + 86400)
            self.assertEqual(fetch.call_count, 2)
        with patch("update_check._fetch", side_effect=OSError("offline")) as fetch:
            self.assertIsNone(update_check.latest_version(force=True, now=10 ** 6))
            self.assertIsNone(update_check.latest_version(now=10 ** 6 + 60))
            self.assertEqual(fetch.call_count, 1)
        cache = json.loads(Path(self.temporary.name, "update_check.json").read_text(encoding="utf-8"))
        self.assertIsNone(cache["latest"])

    def test_a_release_looks_past_newer_test_builds_to_the_newest_release(self):
        with patch("update_check._fetch", return_value=("1.0.8-test1", "1.0.7")):
            self.assertEqual(update_check.latest_version(force=True, now=0, current="1.0.6"), "1.0.7")
            self.assertEqual(update_check.latest_version(now=1, current="1.0.7-test2"), "1.0.8-test1")

    def test_newest_picks_by_version_not_by_list_order(self):
        tags = ["v1.0.8-test12", "v1.0.7", "v1.0.8-test3", None, "nightly"]
        self.assertEqual(update_check.newest(tags), ("1.0.8-test12", "1.0.7"))
        self.assertEqual(update_check.newest(["v1.0.10", "v1.0.9"]), ("1.0.10", "1.0.10"))
        self.assertEqual(update_check.newest([]), (None, None))


if __name__ == "__main__":
    unittest.main()
