"""
Port of the detection half of CreamInstaller/Resources/Resources.cs's
GetDllDirectoriesFromGameDirectory: given a game's install directory, figure out
which unlocker(s) are actually relevant to it by looking for each one's marker
file(s). Only checks the root game directory (not every subdirectory like the
original does) — a reasonable v1 simplification since almost every unlocker's
target DLL sits next to the main executable.
"""
from __future__ import annotations

import os

import creamapi
import koaloader
import screamapi
import smokeapi
import uplay_r1
import uplay_r2


def _steamworks_marker_present(directory: str) -> bool:
    for name in ("steam_api.dll", "steam_api64.dll", "steam_api_o.dll", "steam_api64_o.dll"):
        if os.path.isfile(os.path.join(directory, name)):
            return True
    return False


UNLOCKERS = [
    {"key": "smokeapi", "label": "SmokeAPI", "supports_dlc_list": True},
    {"key": "creamapi", "label": "CreamAPI", "supports_dlc_list": True},
    {"key": "screamapi", "label": "ScreamAPI", "supports_dlc_list": False},
    {"key": "uplay_r1", "label": "Uplay R1 Unlocker", "supports_dlc_list": False},
    {"key": "uplay_r2", "label": "Uplay R2 Unlocker", "supports_dlc_list": False},
    {"key": "koaloader", "label": "Koaloader (proxy)", "supports_dlc_list": True},
]

_DETECTORS = {
    "smokeapi": _steamworks_marker_present,
    "creamapi": _steamworks_marker_present,
    "screamapi": screamapi.detected,
    "uplay_r1": uplay_r1.detected,
    "uplay_r2": uplay_r2.detected,
    # Koaloader isn't "detected" by a marker file of its own — it's an alternative
    # way to install the others, always offered.
    "koaloader": lambda _directory: False,
}

_INSTALLED_CHECKS = {
    "smokeapi": smokeapi.is_installed,
    "creamapi": creamapi.is_installed,
    "screamapi": screamapi.is_installed,
    "uplay_r1": uplay_r1.is_installed,
    "uplay_r2": uplay_r2.is_installed,
    "koaloader": koaloader.is_installed,
}


def describe(directory: str) -> list[dict]:
    """Returns UNLOCKERS annotated with `detected`/`installed` for this directory."""
    return [
        {
            **entry,
            "detected": _DETECTORS[entry["key"]](directory),
            "installed": _INSTALLED_CHECKS[entry["key"]](directory),
        }
        for entry in UNLOCKERS
    ]


def currently_installed(directory: str) -> str | None:
    for key, check in _INSTALLED_CHECKS.items():
        if check(directory):
            return key
    return None


def recommended_default(directory: str) -> str:
    """SmokeAPI is the modern, actively-maintained pick over CreamAPI when both would
    apply (same marker file) — matches CreamInstaller's own default preference."""
    if _steamworks_marker_present(directory):
        return "smokeapi"
    if screamapi.detected(directory):
        return "screamapi"
    if uplay_r1.detected(directory):
        return "uplay_r1"
    if uplay_r2.detected(directory):
        return "uplay_r2"
    return "smokeapi"


async def uninstall_active(directory: str) -> None:
    """Uninstalls whichever unlocker (if any) is currently active, so a switch to a
    newly chosen unlocker never leaves stale files/config from the previous one."""
    installed = currently_installed(directory)
    if installed is None:
        return
    if installed == "smokeapi":
        if smokeapi.get_active_proxy_dll(directory) is not None:
            await smokeapi.proxy_uninstall(directory)
        else:
            await smokeapi.uninstall(directory)
    elif installed == "creamapi":
        if creamapi.get_active_proxy_dll(directory) is not None:
            await creamapi.proxy_uninstall(directory)
        else:
            await creamapi.uninstall(directory)
    elif installed == "screamapi":
        await screamapi.uninstall(directory)
    elif installed == "uplay_r1":
        await uplay_r1.uninstall(directory)
    elif installed == "uplay_r2":
        await uplay_r2.uninstall(directory)
    elif installed == "koaloader":
        await koaloader.uninstall(directory)


async def force_cleanup(directory: str) -> None:
    """Unconditionally runs every unlocker's uninstall (direct and proxy) against
    this directory, regardless of what currently_installed() thinks is active.

    Each one's uninstall is already a no-op unless its own specific files are
    present, so calling all of them is safe — this is the "just clean everything
    up" escape hatch for when the game's files no longer agree with CreamDeck's
    own record. That mismatch usually isn't real corruption: Steam's "verify
    integrity" only restores files it recognizes as belonging to the game, so it
    puts the original steam_api(64).dll back but never removes an unlocker's
    extra files (SmokeAPI.config.json, cream_api.ini, a dropped-in winmm.dll,
    ...) since it has no idea those exist — leaving them behind is what makes
    currently_installed() keep reporting something's installed after a verify.
    """
    for module in (smokeapi, creamapi, screamapi, uplay_r1, uplay_r2):
        await module.uninstall(directory)
    await smokeapi.proxy_uninstall(directory)
    await creamapi.proxy_uninstall(directory)
    await koaloader.uninstall(directory)
