"""
Port of CreamInstaller/Resources/CreamAPI.cs. Targets the same steam_api(64).dll
as SmokeAPI (they are mutually exclusive alternatives for the same job — installing
one should uninstall the other first, handled in main.py's dispatch).
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

PROXY_DLL_NAMES = ["winmm", "winhttp", "version"]


def _proxy_state_path(directory: str) -> str:
    return os.path.join(directory, ".dlc_unlocker_creamapi_proxy.json")


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
    return os.path.join(directory, "cream_api.ini")


def _bundled_dlls() -> tuple[str, str]:
    return resource_path("CreamAPI", "steam_api.dll"), resource_path("CreamAPI", "steam_api64.dll")


def _write_config(directory: str, app_id: str, enabled_dlcs: Iterable[tuple[str, str]]) -> None:
    """CreamAPI's cream_api.ini uses an INI [dlc] section of `id=name` pairs — unlike
    SmokeAPI's config, only *enabled* DLC are listed at all (nothing lists the disabled ones)."""
    lines = ["[steam]", f"AppId={app_id}", "", "[dlc]"]
    for dlc_id, name in enabled_dlcs:
        lines.append(f"{dlc_id}={name}")
    with open(_config_path(directory), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


async def install(directory: str, app_id: str, enabled_dlcs: list[tuple[str, str]]) -> None:
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

        _write_config(directory, app_id, enabled_dlcs)

    await asyncio.get_event_loop().run_in_executor(None, _install)
    decky.logger.info(f"[CreamAPI] Installed to {directory} ({len(enabled_dlcs)} DLC enabled)")


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
    decky.logger.info(f"[CreamAPI] Uninstalled from {directory}")


async def proxy_install(
    directory: str, app_id: str, enabled_dlcs: list[tuple[str, str]], proxy_dll: str = "winmm"
) -> None:
    if proxy_dll not in PROXY_DLL_NAMES:
        raise ValueError(f"Unknown proxy DLL: {proxy_dll}")
    api32, api64 = _bundled_dlls()
    source_dll = api64 if is_64_bit(directory) else api32

    def _install() -> None:
        target = _proxy_dll_path(directory, proxy_dll)
        if os.path.isfile(target) and not os.path.isfile(_proxy_state_path(directory)):
            raise RuntimeError(f"A non-CreamAPI {proxy_dll}.dll already exists in this directory")

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

        _write_config(directory, app_id, enabled_dlcs)

    await asyncio.get_event_loop().run_in_executor(None, _install)
    decky.logger.info(f"[CreamAPI] Proxy-installed ({proxy_dll}.dll) to {directory} ({len(enabled_dlcs)} DLC enabled)")


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
    decky.logger.info(f"[CreamAPI] Proxy-uninstalled from {directory}")


def get_active_proxy_dll(directory: str) -> Optional[str]:
    state_path = _proxy_state_path(directory)
    if not os.path.isfile(state_path):
        return None
    with open(state_path, "r", encoding="utf-8") as f:
        return json.load(f).get("proxy_dll")


def is_installed(directory: str) -> bool:
    # SmokeAPI backs up the original DLL under this exact same filename, so a bare
    # backup-file check can't tell the two apart — cream_api.ini is the one marker
    # that's actually unique to CreamAPI.
    return (
        os.path.isfile(_config_path(directory))
        or get_active_proxy_dll(directory) is not None
    )
