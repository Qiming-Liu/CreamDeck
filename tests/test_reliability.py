"""Critical failure paths only: rollback, ownership, recovery and offline access."""
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import test_backend  # installs the runtime stubs and module search paths
import decky
import install_manager as manager
import install_state
import main
from atomic_json import write_json


class ReliabilityTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.game = self.root / "game"
        self.game.mkdir()
        self.settings = patch.object(decky, "DECKY_PLUGIN_SETTINGS_DIR", str(self.root / "settings"))
        self.settings.start()
        self.addCleanup(self.settings.stop)

    async def test_failed_staging_and_failed_state_commit_restore_previous_install(self):
        target = self.game / "steam_api64.dll"
        target.write_bytes(b"working install")
        install_state.set_installed("10", "smokeapi", ["20"])
        original = install_state.get_state("10")

        async def mutate(stage):
            Path(stage, "steam_api64.dll").write_bytes(b"new install")
            Path(stage, "SmokeAPI.config.json").write_text("{}")

        for where in ("stage", "commit"):
            async def change(stage):
                await mutate(stage)
                if where == "stage":
                    raise OSError("disk full")

            def commit(_):
                install_state.mark_uninstalled("10")
                raise OSError("settings unavailable")

            with self.assertRaises(OSError):
                await manager.transaction("10", str(self.game), change, commit)
            self.assertEqual(target.read_bytes(), b"working install")
            self.assertFalse((self.game / "SmokeAPI.config.json").exists())
            self.assertEqual(install_state.get_state("10"), original)
            self.assertFalse((self.game / manager.JOURNAL).exists())

    async def test_install_then_game_update_cleanup_preserves_updated_dll_and_foreign_mod(self):
        (self.game / "steam_api64.dll").write_bytes(b"original game DLL")
        (self.game / "dxgi.dll").write_bytes(b"unrelated mod")
        resource32, resource64 = self.root / "32.dll", self.root / "64.dll"
        resource32.write_bytes(b"unlocker32")
        resource64.write_bytes(b"unlocker64")
        game = {"game_directory": str(self.game), "name": "Game", "branch": "public", "build_id": 1}
        catalog = {"dlcs": [{"id": "20", "name": "DLC", "has_depot": None}], "updated_at": 1}
        with patch("main.steam_library.find_game", return_value=game), patch("main.steamcmd.cached_page", return_value=catalog), patch(
            "smokeapi._bundled_dlls", return_value=(str(resource32), str(resource64))
        ):
            plugin = main.Plugin()
            result = await plugin.install_dlc_unlocker("10", "smokeapi", ["20"])
            self.assertTrue(result["success"], result)
            self.assertEqual(manager.integrity(str(self.game), install_state.get_state("10"))[0], "healthy")
            (self.game / "steam_api64.dll").write_bytes(b"updated game DLL")
            result = await plugin.force_cleanup("10")
            self.assertTrue(result["success"], result)
            self.assertIn("steam_api64.dll", result["preserved_files"])
        self.assertEqual((self.game / "steam_api64.dll").read_bytes(), b"updated game DLL")
        self.assertEqual((self.game / "dxgi.dll").read_bytes(), b"unrelated mod")
        self.assertFalse((self.game / "steam_api64_o.dll").exists())

    async def test_interrupted_publish_is_recovered_before_reading_the_page(self):
        target = self.game / "steam_api64.dll"
        target.write_bytes(b"partial new install")
        journal = self.game / manager.JOURNAL
        (journal / "before").mkdir(parents=True)
        (journal / "before" / target.name).write_bytes(b"old working DLL")
        write_json(str(journal / "journal.json"), {"app_id": "10", "state": None, "changed": [target.name],
                   "before": {target.name: manager.digest(journal / "before" / target.name)},
                   "after": {target.name: manager.digest(target)}})
        manager.recover(str(self.game))
        self.assertEqual(target.read_bytes(), b"old working DLL")
        self.assertIsNone(install_state.get_state("10"))
        self.assertFalse(journal.exists())

    async def test_atomic_write_failure_and_corrupt_state_preserve_evidence(self):
        install_state.set_installed("10", "smokeapi", ["20"])
        original = Path(install_state._store_path()).read_bytes()
        with patch("atomic_json.os.replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                install_state.mark_uninstalled("10")
        self.assertEqual(Path(install_state._store_path()).read_bytes(), original)
        Path(install_state._store_path()).write_text('{"10": null}')
        self.assertIsNone(install_state.get_state("10"))
        self.assertEqual(len(list((self.root / "settings").glob("*.corrupt-*"))), 1)

    async def test_local_page_never_calls_network_and_discovers_nested_targets(self):
        nested = self.game / "Game" / "Binaries" / "Win64"
        nested.mkdir(parents=True)
        (nested / "steam_api64.dll").write_bytes(b"original")
        game = {"game_directory": str(self.game), "name": "Game", "branch": "public", "build_id": 1}
        with patch("main.steam_library.find_game", return_value=game), patch("main.steamcmd.get_app_info", AsyncMock(side_effect=AssertionError("network"))):
            page = await main.Plugin().get_game_page("10")
        self.assertTrue(page["found"])
        self.assertTrue(any(t["detected"] and t["path"] != "." for t in page["targets"]))
        self.assertEqual(len(page["targets"]), 1)
        self.assertEqual(page["target_directory"], os.path.relpath(nested, self.game))
        with self.assertRaises(manager.OperationError):
            manager.target(str(self.game), "../outside")
        # An unavailable catalog source must not erase a useful cached list.
        import steamcmd
        cached = {"dlcs": [{"id": "20", "name": "Cached DLC", "has_depot": None}], "updated_at": 1}
        with patch.object(decky, "DECKY_PLUGIN_RUNTIME_DIR", str(self.root / "runtime")):
            write_json(os.path.join(steamcmd._appinfo_cache_dir(), "10.page.json"), cached)
            with patch("steamcmd.get_app_info", AsyncMock(return_value=None)):
                result = await steamcmd.get_page("10", "public", 1, True)
            self.assertFalse(result["success"])
            self.assertEqual(result["dlcs"], cached["dlcs"])
            self.assertEqual(steamcmd.cached_page("10"), cached)

    async def test_forced_refresh_bypasses_both_fresh_source_caches(self):
        import steamcmd
        import steamcmd_webapi
        import steam_store_api
        with patch.object(decky, "DECKY_PLUGIN_RUNTIME_DIR", str(self.root / "runtime")):
            os.makedirs(steamcmd._appinfo_cache_dir(), exist_ok=True)
            old = {"common": {"name": "Game"}, "depots": {"1": {"dlcappid": "1236890"}}}
            write_json(steamcmd_webapi._cache_path("10"), old)
            write_json(steam_store_api._cache_path("10"), ["1236890"])
            write_json(os.path.join(steamcmd._appinfo_cache_dir(), "10.page.json"),
                       {"dlcs": [], "updated_at": time.time(), "catalog_version": 2})
            with patch("steamcmd_webapi._fetch", return_value=old) as web, patch(
                "steam_store_api._fetch", return_value=["1236890", "1607890"]
            ) as store, patch("steamcmd._dlc_name", AsyncMock(side_effect=lambda i: i)):
                result = await steamcmd.get_page("10", "public", 1, force=True)
            self.assertTrue(result["success"], result)
            self.assertEqual([d["id"] for d in result["dlcs"]], ["1236890", "1607890"])
            web.assert_called_once_with("10")
            store.assert_called_once_with("10")

    async def test_unsupported_install_is_preserved_and_blocks_game_changes(self):
        install_state.set_installed("10", "removed_unlocker", ["20"])
        original_state = install_state.get_state("10")
        target = self.game / "version.dll"
        target.write_bytes(b"existing installation")
        game = {"game_directory": str(self.game), "name": "Game", "branch": "public", "build_id": 1}
        with patch("main.steam_library.find_game", return_value=game):
            plugin = main.Plugin()
            page = await plugin.get_game_page("10")
            self.assertFalse(page["found"])
            self.assertEqual(page["error_code"], "unsupported_install")
            for result in (
                await plugin.install_dlc_unlocker("10", "smokeapi", ["20"]),
                await plugin.diagnose_install("10", "smokeapi", True, "version"),
                await plugin.force_cleanup("10"),
                await plugin.uninstall_dlc_unlocker("10"),
            ):
                self.assertFalse(result["success"])
                self.assertEqual(result["error_code"], "unsupported_install")
        self.assertEqual(target.read_bytes(), b"existing installation")
        self.assertEqual(install_state.get_state("10"), original_state)


    async def test_only_supported_unlockers_can_install(self):
        with self.assertRaises(manager.OperationError) as raised:
            manager.validate(str(self.game), "removed_unlocker", False, "version")
        self.assertEqual(raised.exception.code, "invalid_unlocker")


    async def test_each_supported_unlocker_installs_and_uninstalls_in_both_modes(self):
        import configparser
        game = {"game_directory": str(self.game), "name": "Game", "branch": "public", "build_id": 1}
        catalog = {"dlcs": [{"id": "20", "name": "Enabled DLC", "has_depot": None},
                             {"id": "30", "name": "Unselected DLC", "has_depot": None}], "updated_at": 1}
        resource32, resource64 = self.root / "32.dll", self.root / "64.dll"
        resource32.write_bytes(b"unlocker32")
        resource64.write_bytes(b"unlocker64")
        original = self.game / "steam_api64.dll"
        for unlocker in ("smokeapi", "creamapi"):
            for proxy in (False, True):
                with self.subTest(unlocker=unlocker, proxy=proxy):
                    original.write_bytes(b"original game DLL")
                    with patch("main.steam_library.find_game", return_value=game), patch(
                        "main.steamcmd.cached_page", return_value=catalog
                    ), patch(f"{unlocker}._bundled_dlls", return_value=(str(resource32), str(resource64))):
                        plugin = main.Plugin()
                        result = await plugin.install_dlc_unlocker("10", unlocker, ["20"], proxy, "version", ".")
                        self.assertTrue(result["success"], result)
                        page = await plugin.get_game_page("10")
                        self.assertEqual(page["selected_unlocker"], unlocker)
                        self.assertEqual(page["file_status"], "healthy")
                        self.assertEqual(page["proxy_dll"], "version" if proxy else None)
                        state = install_state.get_state("10")
                        self.assertEqual(state["target_directory"], ".")
                        self.assertTrue(state["files"])
                        if unlocker == "smokeapi":
                            config = json.loads((self.game / "SmokeAPI.config.json").read_text())
                            self.assertEqual(config["override_dlc_status"], {"30": "locked"})
                        else:
                            config = configparser.ConfigParser()
                            config.read(self.game / "cream_api.ini")
                            self.assertFalse(config.getboolean("steam", "unlockall"))
                            self.assertEqual(dict(config["dlc"]), {"20": "Enabled DLC"})
                        result = await plugin.uninstall_dlc_unlocker("10")
                        self.assertTrue(result["success"], result)
                    self.assertEqual(original.read_bytes(), b"original game DLL")
                    self.assertEqual({p.name for p in self.game.iterdir()}, {original.name})

