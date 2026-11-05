from __future__ import annotations
import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "py_modules"))

import action_log
import decky
import install_manager as manager
import install_state
import steam_library
import steamcmd
import unlocker_detection


def failure(error):
    action_log.log_warning(f"Operation failed: {error!r}")
    return {"success": False, "error_code": error.code if isinstance(error, manager.OperationError) else "operation_failed"}


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
    directory = manager.target(game["game_directory"], selected)
    manager.recover(directory)
    state = install_state.get_state(app_id)
    if state and state["installed"] and state["unlocker"] not in manager.MODULES:
        raise manager.OperationError("unsupported_install")
    return game, directory, state, selected


class Plugin:
    @action_log.log_call
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
                return {
                    "found": True, "name": game["name"], "dlcs": catalog.get("dlcs", []),
                    "dlc_updated_at": catalog.get("updated_at"), "dlc_cached": bool(catalog),
                    "enabled_dlc_ids": state["enabled_dlc_ids"] if state else [],
                    "unlockers": unlocker_detection.describe(directory),
                    "selected_unlocker": installed or "creamapi", "installed": installed is not None,
                    "proxy_dll": state["proxy_dll"] if state and state["proxy"] else None,
                    "integrity_error": integrity_error, "file_status": status,
                    "changed_files": changed, "target_directory": relative, "targets": options,
                    "resource_version": (state or {}).get("resource_version"),
                }
            except Exception as error:
                return {"found": False, **failure(error)}

    @action_log.log_call
    async def get_dlc_page(self, app_id: str, force: bool = False):
        game = steam_library.find_game(app_id)
        if game is None:
            return failure(manager.OperationError("game_not_found"))
        return await steamcmd.get_page(app_id, game["branch"], game["build_id"], force)

    @action_log.log_call
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

    @action_log.log_call
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

    @action_log.log_call
    async def uninstall_dlc_unlocker(self, app_id: str):
        return await self._remove(app_id)

    @action_log.log_call
    async def force_cleanup(self, app_id: str):
        return await self._remove(app_id)

    async def _main(self):
        action_log.log_event("plugin loaded")

    async def _unload(self):
        action_log.log_event("plugin unloaded")

    async def _uninstall(self):
        action_log.log_event("plugin uninstalled")
