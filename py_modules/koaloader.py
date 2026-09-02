"""
Port of CreamInstaller/Resources/Koaloader.cs. Koaloader doesn't unlock anything
itself — it's a generic loader that hooks a proxy DLL name the game already loads
(version.dll, winmm.dll, dxgi.dll, ...) and, in "auto_load" mode, looks alongside
itself for known-named DLLs (SmokeAPI64.dll, ScreamAPI64.dll, UplayR1Unlocker64.dll,
UplayR2Unlocker64.dll) and loads whichever are present. Unlike a direct SmokeAPI/
CreamAPI install, these auto-load files don't replace anything already in the game
directory, so there's no backup/restore dance for them.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
from typing import Iterable, Optional

import decky
import screamapi
import smokeapi
import uplay_r1
import uplay_r2
from bitness import is_64_bit
from resource_files import resource_path

PROXY_DLL_NAMES = ["version", "winmm", "winhttp", "dxgi", "d3d9", "d3d10", "d3d11", "dinput8"]

# unlocker key -> (32-bit autoload filename, 64-bit autoload filename, resource subfolder, 32-bit resource file, 64-bit resource file)
_AUTOLOAD_UNLOCKERS = {
    "smokeapi": ("SmokeAPI32.dll", "SmokeAPI64.dll", "SmokeAPI", "steam_api.dll", "steam_api64.dll"),
    "screamapi": ("ScreamAPI32.dll", "ScreamAPI64.dll", "ScreamAPI", "EOSSDK-Win32-Shipping.dll", "EOSSDK-Win64-Shipping.dll"),
    "uplay_r1": ("UplayR1Unlocker32.dll", "UplayR1Unlocker64.dll", "UplayR1", "uplay_r1_loader.dll", "uplay_r1_loader64.dll"),
    "uplay_r2": ("UplayR2Unlocker32.dll", "UplayR2Unlocker64.dll", "UplayR2", "upc_r2_loader.dll", "upc_r2_loader64.dll"),
}


def _proxy_path(directory: str, proxy_dll: str) -> str:
    return os.path.join(directory, f"{proxy_dll}.dll")


def _config_path(directory: str) -> str:
    return os.path.join(directory, "Koaloader.config.json")


def _state_path(directory: str) -> str:
    return os.path.join(directory, ".dlc_unlocker_koaloader.json")


def _bundled_proxy_dll(proxy_dll: str, bit64: bool) -> str:
    return resource_path("Koaloader", proxy_dll, f"{proxy_dll}{'64' if bit64 else '32'}.dll")


def _autoload_path(directory: str, unlocker: str, bit64: bool) -> str:
    filename = _AUTOLOAD_UNLOCKERS[unlocker][1 if bit64 else 0]
    return os.path.join(directory, filename)


def _bundled_autoload_dll(unlocker: str, bit64: bool) -> str:
    _, _, subfolder, file32, file64 = _AUTOLOAD_UNLOCKERS[unlocker]
    return resource_path(subfolder, file64 if bit64 else file32)


def _write_koaloader_config(directory: str) -> None:
    config = {
        "logging": False,
        "enabled": True,
        "auto_load": True,
        "targets": [],
        "modules": [],
    }
    with open(_config_path(directory), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


async def install(
    directory: str,
    proxy_dll: str,
    unlockers: Iterable[str],
    smokeapi_all_dlc_ids: list[str] | None = None,
    smokeapi_enabled_dlc_ids: list[str] | None = None,
) -> None:
    if proxy_dll not in PROXY_DLL_NAMES:
        raise ValueError(f"Unknown proxy DLL: {proxy_dll}")
    unlockers = list(unlockers)
    for unlocker in unlockers:
        if unlocker not in _AUTOLOAD_UNLOCKERS:
            raise ValueError(f"Unknown Koaloader auto-load unlocker: {unlocker}")

    bit64 = is_64_bit(directory)
    proxy_source = _bundled_proxy_dll(proxy_dll, bit64)
    autoload_sources = {u: _bundled_autoload_dll(u, bit64) for u in unlockers}

    def _install() -> None:
        # main.py always uninstalls whatever's currently active before calling this, so
        # there's never a previous Koaloader install (different proxy/unlockers) to clean
        # up here — only a genuinely foreign, non-Koaloader file could already be at `target`.
        target = _proxy_path(directory, proxy_dll)
        if os.path.isfile(target):
            raise RuntimeError(f"A non-Koaloader DLL named {proxy_dll}.dll already exists in this directory")

        shutil.copyfile(proxy_source, target)

        for unlocker, source in autoload_sources.items():
            shutil.copyfile(source, _autoload_path(directory, unlocker, bit64))
            if unlocker == "smokeapi":
                all_ids = smokeapi_all_dlc_ids or []
                enabled_ids = smokeapi_enabled_dlc_ids or []
                disabled = [dlc_id for dlc_id in all_ids if dlc_id not in enabled_ids]
                smokeapi._write_config(directory, disabled)  # noqa: SLF001 - shared config writer, same file either way
            elif unlocker == "screamapi":
                screamapi._write_config(directory)  # noqa: SLF001
            elif unlocker == "uplay_r1":
                uplay_r1._write_config(directory)  # noqa: SLF001
            elif unlocker == "uplay_r2":
                uplay_r2._write_config(directory)  # noqa: SLF001

        _write_koaloader_config(directory)
        with open(_state_path(directory), "w", encoding="utf-8") as f:
            json.dump({"proxy_dll": proxy_dll, "unlockers": unlockers}, f)

    await asyncio.get_event_loop().run_in_executor(None, _install)
    decky.logger.info(f"[Koaloader] Installed ({proxy_dll}.dll, autoloading {unlockers}) to {directory}")


async def uninstall(directory: str) -> None:
    def _uninstall() -> None:
        state_path = _state_path(directory)
        unlockers: list[str] = []
        if os.path.isfile(state_path):
            with open(state_path, "r", encoding="utf-8") as f:
                state = json.load(f)
            proxy_dll = state.get("proxy_dll")
            unlockers = state.get("unlockers", [])
            if proxy_dll:
                proxy_path = _proxy_path(directory, proxy_dll)
                if os.path.isfile(proxy_path):
                    os.remove(proxy_path)
            os.remove(state_path)

        config_path_by_unlocker = {
            "smokeapi": smokeapi._config_path,  # noqa: SLF001
            "screamapi": screamapi._config_path,  # noqa: SLF001
            "uplay_r1": uplay_r1._config_path,  # noqa: SLF001
            "uplay_r2": uplay_r2._config_path,  # noqa: SLF001
        }
        for unlocker in unlockers:
            for bit in (False, True):
                path = _autoload_path(directory, unlocker, bit)
                if os.path.isfile(path):
                    os.remove(path)
            config_file = config_path_by_unlocker[unlocker](directory)
            if os.path.isfile(config_file):
                os.remove(config_file)

        if os.path.isfile(_config_path(directory)):
            os.remove(_config_path(directory))

    await asyncio.get_event_loop().run_in_executor(None, _uninstall)
    decky.logger.info(f"[Koaloader] Uninstalled from {directory}")


def get_state(directory: str) -> Optional[dict]:
    state_path = _state_path(directory)
    if not os.path.isfile(state_path):
        return None
    with open(state_path, "r", encoding="utf-8") as f:
        return json.load(f)


def is_installed(directory: str) -> bool:
    return get_state(directory) is not None
