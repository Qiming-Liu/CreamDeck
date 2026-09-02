"""
Port of CreamInstaller/Resources/SmokeAPI.cs (install/uninstall/config generation),
using this repo's own vendored SmokeAPI DLLs (decky/resources/SmokeAPI/) instead of
a runtime download — the exact same binaries CreamInstaller embeds as .NET assembly
resources, just read from disk instead of an assembly manifest.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
from typing import Iterable, Optional

import decky
from bitness import is_64_bit
from resource_files import resource_path

# Same three proxy DLL choices CreamInstaller offers (Resources/SmokeAPI.cs ProxyDLLs);
# a proxy is used instead of replacing steam_api(64).dll directly, for games that dislike
# having their own steam_api swapped out.
PROXY_DLL_NAMES = ["winmm", "winhttp", "version"]


def _proxy_state_path(directory: str) -> str:
    # Tracks which proxy filename we wrote, since (unlike CreamInstaller) this port has no
    # embedded-resource MD5 list to recognize "is this file one of ours" for cleanup.
    return os.path.join(directory, ".dlc_unlocker_proxy.json")


def _proxy_dll_path(directory: str, proxy_dll: str) -> str:
    return os.path.join(directory, f"{proxy_dll}.dll")


def _api32_path(directory: str) -> str:
    return os.path.join(directory, "steam_api.dll")


def _api32_backup_path(directory: str) -> str:
    return os.path.join(directory, "steam_api_o.dll")


def _api64_path(directory: str) -> str:
    return os.path.join(directory, "steam_api64.dll")


def _api64_backup_path(directory: str) -> str:
    return os.path.join(directory, "steam_api64_o.dll")


def _config_path(directory: str) -> str:
    return os.path.join(directory, "SmokeAPI.config.json")


def _bundled_dlls() -> tuple[str, str]:
    """Returns (steam_api.dll path, steam_api64.dll path) from the plugin's vendored resources."""
    return resource_path("SmokeAPI", "steam_api.dll"), resource_path("SmokeAPI", "steam_api64.dll")


def _write_config(directory: str, disabled_dlc_ids: Iterable[str]) -> None:
    config = {
        "$version": 4,
        "logging": False,
        "log_steam_http": False,
        "default_app_status": "unlocked",
        "override_app_status": {},
        "override_dlc_status": {dlc_id: "locked" for dlc_id in disabled_dlc_ids},
        "auto_inject_inventory": True,
        "extra_inventory_items": [],
        "extra_dlcs": {},
    }
    with open(_config_path(directory), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


async def install(directory: str, all_dlc_ids: list[str], enabled_dlc_ids: list[str]) -> None:
    api32, api64 = _bundled_dlls()

    def _install() -> None:
        if os.path.isfile(_api32_path(directory)) and not os.path.isfile(_api32_backup_path(directory)):
            os.rename(_api32_path(directory), _api32_backup_path(directory))
        if os.path.isfile(_api32_backup_path(directory)):
            shutil.copyfile(api32, _api32_path(directory))

        if os.path.isfile(_api64_path(directory)) and not os.path.isfile(_api64_backup_path(directory)):
            os.rename(_api64_path(directory), _api64_backup_path(directory))
        if os.path.isfile(_api64_backup_path(directory)):
            shutil.copyfile(api64, _api64_path(directory))

        disabled = [dlc_id for dlc_id in all_dlc_ids if dlc_id not in enabled_dlc_ids]
        _write_config(directory, disabled)

    await asyncio.get_event_loop().run_in_executor(None, _install)
    decky.logger.info(f"[SmokeAPI] Installed to {directory} ({len(enabled_dlc_ids)}/{len(all_dlc_ids)} DLC enabled)")


async def uninstall(directory: str) -> None:
    def _uninstall() -> None:
        if os.path.isfile(_api32_backup_path(directory)):
            if os.path.isfile(_api32_path(directory)):
                os.remove(_api32_path(directory))
            os.rename(_api32_backup_path(directory), _api32_path(directory))

        if os.path.isfile(_api64_backup_path(directory)):
            if os.path.isfile(_api64_path(directory)):
                os.remove(_api64_path(directory))
            os.rename(_api64_backup_path(directory), _api64_path(directory))

        if os.path.isfile(_config_path(directory)):
            os.remove(_config_path(directory))

    await asyncio.get_event_loop().run_in_executor(None, _uninstall)
    decky.logger.info(f"[SmokeAPI] Uninstalled from {directory}")


async def proxy_install(
    directory: str,
    all_dlc_ids: list[str],
    enabled_dlc_ids: list[str],
    proxy_dll: str = "winmm",
) -> None:
    if proxy_dll not in PROXY_DLL_NAMES:
        raise ValueError(f"Unknown proxy DLL: {proxy_dll}")
    api32, api64 = _bundled_dlls()
    source_dll = api64 if is_64_bit(directory) else api32

    def _install() -> None:
        target = _proxy_dll_path(directory, proxy_dll)
        if os.path.isfile(target) and not os.path.isfile(_proxy_state_path(directory)):
            raise RuntimeError(f"A non-SmokeAPI {proxy_dll}.dll already exists in this directory")

        # Remove any previous proxy install under a different filename first.
        if os.path.isfile(_proxy_state_path(directory)):
            with open(_proxy_state_path(directory), "r", encoding="utf-8") as f:
                previous = json.load(f).get("proxy_dll")
            if previous and previous != proxy_dll:
                previous_path = _proxy_dll_path(directory, previous)
                if os.path.isfile(previous_path):
                    os.remove(previous_path)

        shutil.copyfile(source_dll, target)
        with open(_proxy_state_path(directory), "w", encoding="utf-8") as f:
            json.dump({"proxy_dll": proxy_dll}, f)

        disabled = [dlc_id for dlc_id in all_dlc_ids if dlc_id not in enabled_dlc_ids]
        _write_config(directory, disabled)

    await asyncio.get_event_loop().run_in_executor(None, _install)
    decky.logger.info(
        f"[SmokeAPI] Proxy-installed ({proxy_dll}.dll) to {directory} "
        f"({len(enabled_dlc_ids)}/{len(all_dlc_ids)} DLC enabled)"
    )


async def proxy_uninstall(directory: str) -> None:
    def _uninstall() -> None:
        state_path = _proxy_state_path(directory)
        if os.path.isfile(state_path):
            with open(state_path, "r", encoding="utf-8") as f:
                proxy_dll = json.load(f).get("proxy_dll")
            if proxy_dll:
                proxy_path = _proxy_dll_path(directory, proxy_dll)
                if os.path.isfile(proxy_path):
                    os.remove(proxy_path)
            os.remove(state_path)

        if os.path.isfile(_config_path(directory)):
            os.remove(_config_path(directory))

    await asyncio.get_event_loop().run_in_executor(None, _uninstall)
    decky.logger.info(f"[SmokeAPI] Proxy-uninstalled from {directory}")


def get_active_proxy_dll(directory: str) -> Optional[str]:
    state_path = _proxy_state_path(directory)
    if not os.path.isfile(state_path):
        return None
    with open(state_path, "r", encoding="utf-8") as f:
        return json.load(f).get("proxy_dll")


def is_installed(directory: str) -> bool:
    # CreamAPI backs up the original DLL under this exact same filename, so a bare
    # backup-file check can't tell the two apart — SmokeAPI's own config file is
    # the one marker that's actually unique to it.
    return (
        os.path.isfile(_config_path(directory))
        or get_active_proxy_dll(directory) is not None
    )


