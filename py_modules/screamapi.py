"""
Port of CreamInstaller/Resources/ScreamAPI.cs — targets EOSSDK-Win32/64-Shipping.dll
(Epic Online Services SDK, which plenty of Steam-sold games bundle regardless of
storefront). Unlike SmokeAPI/CreamAPI, there is no per-DLC checkbox here: the
original config's `override_dlc_status`/`extra_entitlements` are keyed by Epic
catalog/entitlement ids that only exist if you also scanned the Epic Games Store
(CreamInstaller's EpicStore.cs) — which this Steam-only plugin has no source for.
So this installs in "unlock everything" mode only.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil

import decky
from resource_files import resource_path


def _api32_path(directory: str) -> str:
    return os.path.join(directory, "EOSSDK-Win32-Shipping.dll")


def _api32_backup_path(directory: str) -> str:
    return os.path.join(directory, "EOSSDK-Win32-Shipping_o.dll")


def _api64_path(directory: str) -> str:
    return os.path.join(directory, "EOSSDK-Win64-Shipping.dll")


def _api64_backup_path(directory: str) -> str:
    return os.path.join(directory, "EOSSDK-Win64-Shipping_o.dll")


def _config_path(directory: str) -> str:
    return os.path.join(directory, "ScreamAPI.config.json")


def _bundled_dlls() -> tuple[str, str]:
    return (
        resource_path("ScreamAPI", "EOSSDK-Win32-Shipping.dll"),
        resource_path("ScreamAPI", "EOSSDK-Win64-Shipping.dll"),
    )


def detected(directory: str) -> bool:
    return os.path.isfile(_api32_path(directory)) or os.path.isfile(_api64_path(directory))


def _write_config(directory: str) -> None:
    config = {
        "$version": 3,
        "logging": False,
        "log_eos": False,
        "block_metrics": False,
        "namespace_id": "",
        "default_dlc_status": "unlocked",
        "override_dlc_status": {},
        "extra_graphql_endpoints": [],
        "extra_entitlements": {},
    }
    with open(_config_path(directory), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


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
    decky.logger.info(f"[ScreamAPI] Installed to {directory}")


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
    decky.logger.info(f"[ScreamAPI] Uninstalled from {directory}")


def is_installed(directory: str) -> bool:
    return os.path.isfile(_api32_backup_path(directory)) or os.path.isfile(_api64_backup_path(directory))
