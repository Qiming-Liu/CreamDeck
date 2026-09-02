from __future__ import annotations

import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "py_modules"))

import action_log
import creamapi
import decky
import install_state
import koaloader
import screamapi
import smokeapi
import steam_library
import steamcmd
import unlocker_detection
import uplay_r1
import uplay_r2

_UNLOCKER_LABELS = {
    "smokeapi": "SmokeAPI",
    "creamapi": "CreamAPI",
    "screamapi": "ScreamAPI",
    "uplay_r1": "Uplay R1 Unlocker",
    "uplay_r2": "Uplay R2 Unlocker",
    "koaloader": "Koaloader",
}


class Plugin:
    @action_log.log_call
    async def get_game_page(self, app_id: str):
        """Everything the per-game page (/creamdeck/<appid>) needs in one call."""
        game = steam_library.find_game(app_id)
        if game is None:
            return {"found": False}
        directory = game["game_directory"]

        app_info = await steamcmd.get_app_info(app_id, game["branch"], game["build_id"])
        dlcs = app_info["dlcs"] if app_info else []

        unlockers = unlocker_detection.describe(directory)
        disk_installed = unlocker_detection.currently_installed(directory)

        state = install_state.get_state(app_id)
        json_installed = state["unlocker"] if state and state["installed"] else None

        integrity_error = None
        if json_installed != disk_installed:
            if disk_installed is None:
                # Unambiguous: the game's files no longer show anything installed at
                # all (Steam's "verify integrity" restores the original DLL, which is
                # exactly this case) — nothing to ask the user to check, just correct
                # our own now-stale record to match reality.
                install_state.mark_uninstalled(app_id)
                action_log.log_event(
                    f"[{app_id}] install-state self-healed: json said {json_installed} but "
                    f"disk shows nothing (game files were verified/restored) — cleared"
                )
                json_installed = None
            else:
                json_label = _UNLOCKER_LABELS.get(json_installed, "nothing")
                disk_label = _UNLOCKER_LABELS.get(disk_installed, "nothing")
                integrity_error = (
                    f"CreamDeck's saved state says {json_label} is installed, but this game's "
                    f"files show {disk_label} — please verify this game's file integrity in "
                    f"Steam before installing or uninstalling anything."
                )
                action_log.log_warning(
                    f"[{app_id}] install-state mismatch: json={json_installed} disk={disk_installed}"
                )

        installed_unlocker = json_installed
        selected_unlocker = installed_unlocker or unlocker_detection.recommended_default(directory)

        enabled_dlc_ids = state["enabled_dlc_ids"] if state else []
        proxy_dll = state["proxy_dll"] if state and state["proxy"] else None
        koaloader_autoload = state["koaloader_autoload"] if state else []

        if selected_unlocker in ("smokeapi", "creamapi"):
            proxy_dll_choices = (smokeapi if selected_unlocker == "smokeapi" else creamapi).PROXY_DLL_NAMES
        elif selected_unlocker == "koaloader":
            proxy_dll_choices = koaloader.PROXY_DLL_NAMES
        else:
            proxy_dll_choices = []

        return {
            "found": True,
            "name": game["name"],
            "dlcs": dlcs,
            "enabled_dlc_ids": enabled_dlc_ids,
            "unlockers": unlockers,
            "selected_unlocker": selected_unlocker,
            "installed": installed_unlocker is not None,
            "proxy_dll": proxy_dll,
            "proxy_dll_choices": proxy_dll_choices,
            "koaloader_autoload": koaloader_autoload,
            "integrity_error": integrity_error,
        }

    @action_log.log_call
    async def install_dlc_unlocker(
        self,
        app_id: str,
        unlocker: str,
        enabled_dlc_ids: list[str],
        proxy: bool = False,
        proxy_dll: str = "winmm",
        koaloader_autoload: list[str] | None = None,
    ):
        game = steam_library.find_game(app_id)
        if game is None:
            return {"success": False, "error": "Game not found"}
        directory = game["game_directory"]

        app_info = await steamcmd.get_app_info(app_id, game["branch"], game["build_id"])
        dlcs = app_info["dlcs"] if app_info else []
        all_dlc_ids = [dlc["id"] for dlc in dlcs] if dlcs else enabled_dlc_ids
        enabled_dlcs_with_names = [(d["id"], d["name"]) for d in dlcs if d["id"] in enabled_dlc_ids]

        try:
            await unlocker_detection.uninstall_active(directory)

            if unlocker == "smokeapi":
                if proxy:
                    await smokeapi.proxy_install(directory, all_dlc_ids, enabled_dlc_ids, proxy_dll)
                else:
                    await smokeapi.install(directory, all_dlc_ids, enabled_dlc_ids)
            elif unlocker == "creamapi":
                if proxy:
                    await creamapi.proxy_install(directory, app_id, enabled_dlcs_with_names, proxy_dll)
                else:
                    await creamapi.install(directory, app_id, enabled_dlcs_with_names)
            elif unlocker == "screamapi":
                await screamapi.install(directory)
            elif unlocker == "uplay_r1":
                await uplay_r1.install(directory)
            elif unlocker == "uplay_r2":
                await uplay_r2.install(directory)
            elif unlocker == "koaloader":
                await koaloader.install(
                    directory,
                    proxy_dll,
                    koaloader_autoload or [],
                    all_dlc_ids,
                    enabled_dlc_ids,
                )
            else:
                return {"success": False, "error": f"Unknown unlocker: {unlocker}"}
        except Exception as e:  # noqa: BLE001 - surface any failure to the frontend
            decky.logger.error(f"[DlcUnlocker] Install failed for {app_id} ({unlocker}): {e}")
            action_log.log_warning(f"[{app_id}] install failed ({unlocker}): {e}")
            return {"success": False, "error": str(e)}

        install_state.set_installed(
            app_id,
            unlocker,
            enabled_dlc_ids,
            proxy=proxy,
            proxy_dll=proxy_dll if proxy else None,
            koaloader_autoload=koaloader_autoload,
        )
        action_log.log_event(
            f"[{app_id}] installed {unlocker} (proxy={proxy}, {len(enabled_dlc_ids)} DLC enabled)"
        )
        return {"success": True}

    @action_log.log_call
    async def uninstall_dlc_unlocker(self, app_id: str):
        game = steam_library.find_game(app_id)
        if game is None:
            return {"success": False, "error": "Game not found"}

        try:
            await unlocker_detection.uninstall_active(game["game_directory"])
        except Exception as e:  # noqa: BLE001
            decky.logger.error(f"[DlcUnlocker] Uninstall failed for {app_id}: {e}")
            action_log.log_warning(f"[{app_id}] uninstall failed: {e}")
            return {"success": False, "error": str(e)}

        install_state.mark_uninstalled(app_id)
        action_log.log_event(f"[{app_id}] uninstalled")
        return {"success": True}

    @action_log.log_call
    async def force_cleanup(self, app_id: str):
        """The "something's wrong, just clean everything up" escape hatch — sweeps
        every unlocker's config/proxy/backup files from this game's directory and
        restores the original steam_api(64).dll, regardless of which unlocker
        CreamDeck's own record or file detection thinks is active. For when the
        two have drifted apart (e.g. Steam's "verify integrity" restored the DLL
        but left the unlocker's config file behind, since that's not part of the
        game and Steam has no reason to touch it) and there's nothing left to
        gain by asking the user to keep re-verifying — better to make it easy to
        just remove CreamDeck's leftovers directly."""
        game = steam_library.find_game(app_id)
        if game is None:
            return {"success": False, "error": "Game not found"}

        try:
            await unlocker_detection.force_cleanup(game["game_directory"])
        except Exception as e:  # noqa: BLE001
            decky.logger.error(f"[DlcUnlocker] Force cleanup failed for {app_id}: {e}")
            action_log.log_warning(f"[{app_id}] force cleanup failed: {e}")
            return {"success": False, "error": str(e)}

        install_state.mark_uninstalled(app_id)
        action_log.log_event(f"[{app_id}] force cleanup completed")
        return {"success": True}

    async def _main(self):
        decky.logger.info("CreamDeck plugin loaded")
        action_log.log_event("plugin loaded")

    async def _unload(self):
        decky.logger.info("CreamDeck plugin unloaded")
        action_log.log_event("plugin unloaded")

    async def _uninstall(self):
        decky.logger.info("CreamDeck plugin uninstalled")
        action_log.log_event("plugin uninstalled")
