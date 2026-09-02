"""
Port of CreamInstaller/Resources/UplayR1.cs — targets uplay_r1_loader(64).dll
(Ubisoft Connect / legacy Uplay R1). Like ScreamAPI, the original config's
"blacklist" is keyed by Ubisoft product ids from CreamInstaller's own Ubisoft
store scan (UbisoftStore.cs), which this Steam-only plugin has no source for —
so this always installs with an empty blacklist ("unlock everything").
"""
from __future__ import annotations

import asyncio
import os
import shutil

import decky
from resource_files import resource_path


def _api32_path(directory: str) -> str:
    return os.path.join(directory, "uplay_r1_loader.dll")


def _api32_backup_path(directory: str) -> str:
    return os.path.join(directory, "uplay_r1_loader_o.dll")


def _api64_path(directory: str) -> str:
    return os.path.join(directory, "uplay_r1_loader64.dll")


def _api64_backup_path(directory: str) -> str:
    return os.path.join(directory, "uplay_r1_loader64_o.dll")


def _config_path(directory: str) -> str:
    return os.path.join(directory, "UplayR1Unlocker.jsonc")


def _bundled_dlls() -> tuple[str, str]:
    return (
        resource_path("UplayR1", "uplay_r1_loader.dll"),
        resource_path("UplayR1", "uplay_r1_loader64.dll"),
    )


def detected(directory: str) -> bool:
    return os.path.isfile(_api32_path(directory)) or os.path.isfile(_api64_path(directory))


def _write_config(directory: str) -> None:
    with open(_config_path(directory), "w", encoding="utf-8") as f:
        f.write('{\n  "logging": false,\n  "lang": "default",\n  "hook_loader": false,\n  "blacklist": []\n}\n')


async def install(directory: str) -> None:
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

        _write_config(directory)

    await asyncio.get_event_loop().run_in_executor(None, _install)
    decky.logger.info(f"[UplayR1] Installed to {directory}")


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
    decky.logger.info(f"[UplayR1] Uninstalled from {directory}")


def is_installed(directory: str) -> bool:
    return os.path.isfile(_api32_backup_path(directory)) or os.path.isfile(_api64_backup_path(directory))
