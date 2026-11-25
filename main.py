from __future__ import annotations
import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "py_modules"))

import decky
import install_manager as manager
import install_state
import memory_watch
import plugin_log
import steam_library
import steamcmd
import unlocker_detection
import update_check


LOG = plugin_log.PluginLog(decky.DECKY_PLUGIN_LOG_DIR, "creamdeck")


def failure(error):
    """The failed result the frontend translates. ``error`` carries the reason into
    the user-action log line; only unexpected errors are logged here, with traceback."""
    if isinstance(error, manager.OperationError):
        return {"success": False, "error_code": error.code, "error": error.code}
    decky.logger.error(f"Unexpected error: {error!r}", exc_info=error)
    return {"success": False, "error_code": "operation_failed", "error": repr(error)}


def game_label(app_id):
    """"app 632360 (Name)" for a user-action line; just the app id when the
    manifest can't be read."""
    try:
        game = steam_library.find_game(app_id) if isinstance(app_id, str) and app_id.isdigit() else None
    except Exception:  # noqa: BLE001 - a label must never break the action
        game = None
    return f"app {app_id} ({game['name']})" if game else f"app {app_id}"


def unlocker_label(key):
    return {u["key"]: u["label"] for u in unlocker_detection.UNLOCKERS}.get(key, str(key))


def describe_install(app_id, unlocker, enabled_dlc_ids, proxy=False, proxy_dll="winmm", target_directory="."):
    state = install_state.get_state(app_id) if isinstance(app_id, str) else None
    verb = "Reinstall" if state and state.get("installed") else "Install"
    mode = f"proxy {proxy_dll}.dll" if proxy else "replacing steam_api"
    where = "" if target_directory in (".", "", None) else f" in {target_directory}"
    return (f"{verb} {unlocker_label(unlocker)} ({mode}, {len(enabled_dlc_ids)} DLC enabled)"
            f"{where} for {game_label(app_id)}")


def describe_uninstall(app_id):
    state = install_state.get_state(app_id) if isinstance(app_id, str) else None
    unlocker = unlocker_label(state["unlocker"]) if state and state.get("installed") else "unlocker"
    return f"Uninstall {unlocker} from {game_label(app_id)}"


def locate(app_id, relative=None):
    if not isinstance(app_id, str) or not app_id.isdigit():
        raise manager.OperationError("game_not_found")
    game = steam_library.find_game(app_id)
    if game is None:
        raise manager.OperationError("game_not_found")
    state = install_state.get_state(app_id)
    if state and state["installed"] and state["unlocker"] not in manager.MODULES:
        raise manager.OperationError("unsupported_install")
    selected = relative if relative is not None else (state or {}).get("target_directory", ".") or "."
    selected = manager.relative_target(game["game_directory"], selected)
    directory = manager.target(game["game_directory"], selected)
    manager.recover(directory)
    state = install_state.get_state(app_id)
    if state and state["installed"] and state["unlocker"] not in manager.MODULES:
        raise manager.OperationError("unsupported_install")
    return game, directory, state, selected


def find_leftover(state):
    """The folder an uninstalled game left behind, known by the recorded files.

    Steam's manifest is gone, so the folder is found by content: an unclaimed
    folder whose unlocker files all match the record. Anything less certain
    (no match, or more than one) yields None and no file is touched.
    """
    matches = []
    for folder in steam_library.leftover_directories():
        try:
            directory = manager.target(folder, state.get("target_directory") or ".")
            if manager.integrity(directory, state)[0] == "healthy":
                matches.append(directory)
        except manager.OperationError:
            continue
    return matches[0] if len(matches) == 1 else None


class Plugin:
    @memory_watch.tracked
    async def get_game_page(self, app_id: str, target_directory: str | None = None):
        # Local state and maintenance remain available without a network.
        async with manager.LOCK:
            try:
                game, directory, state, relative = locate(app_id, target_directory)
                options = await asyncio.to_thread(manager.candidates, game["game_directory"])
                # Discovery can recover a transaction in a nested target too.
                game, directory, state, relative = locate(app_id, target_directory)
                options = [option for option in options if option["detected"]]
                if (not state or not state["installed"]) and target_directory is None and options:
                    if relative not in {option["path"] for option in options}:
                        relative = options[0]["path"]
                        directory = manager.target(game["game_directory"], relative)
                status, changed = manager.integrity(directory, state)
                disk = unlocker_detection.currently_installed(directory)
                installed = state["unlocker"] if state and state["installed"] else None
                integrity_error = None
                if status == "legacy" and disk is None:
                    install_state.mark_uninstalled(app_id)
                    installed = None
                    status = "clean"
                elif status in ("modified", "external", "legacy"):
                    labels = {u["key"]: u["label"] for u in unlocker_detection.UNLOCKERS}
                    integrity_error = f"{labels.get(installed, 'Nothing')} / {labels.get(disk, 'Nothing')}: {', '.join(changed) or status}"
                catalog = steamcmd.cached_page(app_id)
                files = manager.file_report(directory, state) if installed else []
                return {
                    "found": True, "name": game["name"], "game_directory": game["game_directory"], "dlcs": catalog.get("dlcs", []),
                    "dlc_updated_at": catalog.get("updated_at"), "dlc_cached": bool(catalog),
                    "enabled_dlc_ids": state["enabled_dlc_ids"] if state else [],
                    "unlockers": unlocker_detection.describe(directory),
                    "selected_unlocker": installed or "creamapi", "installed": installed is not None,
                    "proxy_dll": state["proxy_dll"] if state and state["proxy"] else None,
                    "integrity_error": integrity_error, "file_status": status,
                    "changed_files": changed, "target_directory": relative, "targets": options,
                    "resource_version": (state or {}).get("resource_version"),
                    "has_record": state is not None, "files": files,
                    "external_files": manager.unlocker_files(directory) if status == "external" else [],
                    "api_dlls": manager.present_api_dlls(directory),
                }
            except Exception as error:
                return {"found": False, **failure(error)}

    @memory_watch.tracked
    async def get_dlc_page(self, app_id: str, force: bool = False):
        # Only a forced refresh comes from the user pressing Refresh; the page
        # load itself is not a user action.
        return await (self._refresh_dlc_page(app_id) if force else self._dlc_page(app_id, False))

    @plugin_log.user_action(decky.logger, lambda app_id: f"Refresh the DLC list for {game_label(app_id)}")
    async def _refresh_dlc_page(self, app_id: str):
        return await self._dlc_page(app_id, True)

    async def _dlc_page(self, app_id: str, force: bool):
        game = steam_library.find_game(app_id)
        if game is None:
            return failure(manager.OperationError("game_not_found"))
        return await steamcmd.get_page(app_id, game["branch"], game["build_id"], force)

    @memory_watch.tracked
    async def diagnose_install(self, app_id: str, unlocker: str, proxy: bool, proxy_dll: str,
                               target_directory: str = "."):
        async with manager.LOCK:
            try:
                _, directory, state, _ = locate(app_id, target_directory)
                result = manager.validate(directory, unlocker, proxy, proxy_dll)
                status, _ = manager.integrity(directory, state)
                if status not in ("healthy", "clean"):
                    raise manager.OperationError("legacy_install" if status == "legacy" else "integrity_conflict")
                manager.check_collisions(directory, unlocker, proxy, proxy_dll,
                                         state.get("files", {}) if state and state["installed"] else ())
                return {"success": True, **result}
            except Exception as error:
                return failure(error)

    @memory_watch.tracked
    @plugin_log.user_action(decky.logger, describe_install)
    async def install_dlc_unlocker(self, app_id: str, unlocker: str, enabled_dlc_ids: list[str],
                                   proxy: bool = False, proxy_dll: str = "winmm",
                                   target_directory: str = "."):
        async with manager.LOCK:
            try:
                _, directory, state, relative = locate(app_id, target_directory)
                checked = manager.validate(directory, unlocker, proxy, proxy_dll)
                proxy = checked["proxy"]
                status, _ = manager.integrity(directory, state)
                if status not in ("healthy", "clean"):
                    raise manager.OperationError("legacy_install" if status == "legacy" else "integrity_conflict")
                if state and state["installed"] and (state.get("target_directory") or ".") != relative:
                    raise manager.OperationError("integrity_conflict")
                catalog = steamcmd.cached_page(app_id)
                if not catalog:
                    raise manager.OperationError("catalog_unavailable")
                dlcs = catalog.get("dlcs", [])
                all_ids = [d["id"] for d in dlcs]
                if not all(isinstance(i, str) and i.isdigit() for i in enabled_dlc_ids):
                    raise manager.OperationError("invalid_selection")
                if any(i not in all_ids for i in enabled_dlc_ids):
                    raise manager.OperationError("invalid_selection")
                names = [(d["id"], d["name"].replace("\n", " ").replace("\r", " ")) for d in dlcs if d["id"] in enabled_dlc_ids]
                owned = {}

                async def mutate(stage):
                    if state and state["installed"]:
                        manager.clean_owned(stage, state)
                    clean = manager.snapshot(stage)
                    manager.check_collisions(stage, unlocker, proxy, proxy_dll)
                    module = manager.MODULES[unlocker]
                    args = (all_ids, enabled_dlc_ids) if unlocker == "smokeapi" else (app_id, names)
                    if proxy:
                        await module.proxy_install(stage, *args, proxy_dll)
                    else:
                        await module.install(stage, *args)
                    after = manager.snapshot(stage)
                    owned.update({name: value for name, value in after.items() if clean.get(name) != value})

                def commit(_after):
                    install_state.set_installed(app_id, unlocker, enabled_dlc_ids, proxy, proxy_dll if proxy else None,
                                                relative, owned, decky.DECKY_PLUGIN_VERSION)
                await manager.transaction(app_id, directory, mutate, commit)
                return {"success": True}
            except Exception as error:
                return failure(error)

    async def _remove(self, app_id: str):
        async with manager.LOCK:
            try:
                _, directory, state, _ = locate(app_id)
                if not state or not state.get("installed"):
                    raise manager.OperationError("legacy_install")
                preserved = []
                if not state.get("files"):
                    state = {**state, "files": manager.legacy_files(directory, state)}

                async def mutate(stage):
                    preserved.extend(manager.clean_owned(stage, state))
                await manager.transaction(app_id, directory, mutate, lambda _: install_state.mark_uninstalled(app_id))
                return {"success": True, "preserved_files": preserved}
            except Exception as error:
                return failure(error)

    @memory_watch.tracked
    @plugin_log.user_action(decky.logger, describe_uninstall)
    async def uninstall_dlc_unlocker(self, app_id: str):
        return await self._remove(app_id)

    @memory_watch.tracked
    @plugin_log.user_action(decky.logger, lambda app_id: f"Force cleanup of unlocker files for {game_label(app_id)}")
    async def force_cleanup(self, app_id: str):
        return await self._remove(app_id)

    @memory_watch.tracked
    @plugin_log.user_action(decky.logger, lambda app_id: f"Remove the leftovers of uninstalled app {app_id}")
    async def remove_leftover(self, app_id: str):
        """Forget a game Steam no longer has, deleting its unlocker files when the
        folder is still there and they are unchanged."""
        async with manager.LOCK:
            try:
                if not isinstance(app_id, str) or not app_id.isdigit():
                    raise manager.OperationError("game_not_found")
                if steam_library.find_game(app_id) is not None:
                    raise manager.OperationError("game_in_library")
                state = install_state.get_state(app_id)
                directory = None
                if state and state.get("installed") and state.get("files"):
                    directory = await asyncio.to_thread(find_leftover, state)
                if directory is None:
                    install_state.restore(app_id, None)
                    return {"success": True, "files_removed": False}

                async def mutate(stage):
                    manager.clean_owned(stage, state)
                await manager.transaction(app_id, directory, mutate, lambda _: install_state.restore(app_id, None))
                return {"success": True, "files_removed": True}
            except Exception as error:
                return failure(error)

    @memory_watch.tracked
    async def list_installed_games(self):
        """Read-only summary of recorded installations; never locks, recovers or hashes."""
        def collect():
            games = []
            for app_id, state in install_state.all_states().items():
                if not state.get("installed"):
                    continue
                game = steam_library.find_game(app_id)
                games.append({"app_id": app_id, "name": game["name"] if game else None,
                              "unlocker": state["unlocker"], "proxy": state["proxy"],
                              "dlc_count": len(state["enabled_dlc_ids"])})
            return sorted(games, key=lambda game: ((game["name"] or "").casefold(), game["app_id"]))
        try:
            return {"success": True, "games": await asyncio.to_thread(collect)}
        except Exception as error:
            return failure(error)

    @memory_watch.tracked
    async def get_log(self, limit: int = 500):
        return await asyncio.to_thread(LOG.read, max(1, min(int(limit), 2000)))

    @memory_watch.tracked
    @plugin_log.user_action(decky.logger, lambda: "Clear the log")
    async def clear_log(self):
        await asyncio.to_thread(LOG.clear)

    @memory_watch.tracked
    async def get_log_export_directory(self):
        return await asyncio.to_thread(LOG.export_directory, decky.DECKY_USER_HOME)

    @memory_watch.tracked
    @plugin_log.user_action(decky.logger, lambda directory="": f"Export the log to {directory or '~/Downloads'}")
    async def export_log(self, directory: str = ""):
        return await asyncio.to_thread(LOG.export, decky.DECKY_USER_HOME, directory or None)

    @memory_watch.tracked
    async def log_frontend(self, level: str, message: str):
        plugin_log.log_frontend(decky.logger, level, message)

    @memory_watch.tracked
    async def get_update_info(self, force: bool = False):
        current = decky.DECKY_PLUGIN_VERSION
        try:
            latest = await asyncio.to_thread(update_check.latest_version, bool(force), None, current)
        except Exception as error:  # noqa: BLE001 - the badge is optional
            decky.logger.info(f"Update check failed: {error!r}")
            latest = None
        return {"current": current, "latest": latest if update_check.newer(latest, current) else None,
                "os": await asyncio.to_thread(update_check.os_version)}

    async def _main(self):
        LOG.attach(decky.logger, f"CreamDeck v{decky.DECKY_PLUGIN_VERSION} started")
        if not memory_watch.start(decky.logger.warning):
            decky.logger.info("memory watch unavailable: resident memory can't be read")

    async def _unload(self):
        memory_watch.stop()
        decky.logger.info("plugin unloaded")
        LOG.detach()

    async def _uninstall(self):
        decky.logger.info("plugin uninstalled")
