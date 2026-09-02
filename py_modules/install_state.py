"""
The plugin's own on-disk record of "what's installed and which DLC are enabled"
per game — this JSON file is the source of truth main.py reads from, instead of
re-parsing each unlocker's own config file format (SmokeAPI.config.json,
cream_api.ini, ...) on every page load. It's written right after a successful
install/uninstall.

Since this is *our* record of what *we* did, it can drift from what's actually
on disk — Steam's "verify game files" restoring the original DLL, someone
editing files by hand, a previous CreamInstaller-style install this plugin
never wrote the record for, etc. main.py cross-checks this against
unlocker_detection's live disk read and surfaces a mismatch rather than
silently trusting either side.
"""
from __future__ import annotations

import json
import os
from typing import Optional, TypedDict

import decky


class InstallState(TypedDict):
    installed: bool
    unlocker: str
    proxy: bool
    proxy_dll: Optional[str]
    enabled_dlc_ids: list[str]
    koaloader_autoload: list[str]


def _store_path() -> str:
    return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "install_state.json")


def _load() -> dict[str, InstallState]:
    path = _store_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save(data: dict[str, InstallState]) -> None:
    os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
    with open(_store_path(), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_state(app_id: str) -> Optional[InstallState]:
    return _load().get(app_id)


def set_installed(
    app_id: str,
    unlocker: str,
    enabled_dlc_ids: list[str],
    proxy: bool = False,
    proxy_dll: Optional[str] = None,
    koaloader_autoload: Optional[list[str]] = None,
) -> None:
    data = _load()
    data[app_id] = InstallState(
        installed=True,
        unlocker=unlocker,
        proxy=proxy,
        proxy_dll=proxy_dll,
        enabled_dlc_ids=enabled_dlc_ids,
        koaloader_autoload=koaloader_autoload or [],
    )
    _save(data)


def mark_uninstalled(app_id: str) -> None:
    """Flips installed to False but keeps the rest of the record (unlocker choice,
    DLC selection) around, so re-opening Install after an Uninstall starts from
    what was last configured instead of blank defaults."""
    data = _load()
    if app_id in data:
        data[app_id]["installed"] = False
        _save(data)
