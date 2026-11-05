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
import threading
import time
from typing import Optional, TypedDict

import decky
from atomic_json import write_json

_lock = threading.RLock()


class InstallState(TypedDict):
    installed: bool
    unlocker: str
    proxy: bool
    proxy_dll: Optional[str]
    enabled_dlc_ids: list[str]
    target_directory: str
    files: dict[str, str]
    resource_version: str


def _store_path() -> str:
    return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "install_state.json")


def valid_state(value) -> bool:
    return (isinstance(value, dict) and isinstance(value.get("installed"), bool)
            and isinstance(value.get("unlocker"), str) and isinstance(value.get("proxy"), bool)
            and (value.get("proxy_dll") is None or isinstance(value.get("proxy_dll"), str))
            and isinstance(value.get("target_directory", ""), str)
            and isinstance(value.get("resource_version", ""), str)
            and isinstance(value.get("enabled_dlc_ids"), list)
            and all(isinstance(x, str) for x in value["enabled_dlc_ids"])
            and isinstance(value.get("files", {}), dict)
            and all(isinstance(k, str) and isinstance(h, str) for k, h in value.get("files", {}).items()))


def _load() -> dict[str, InstallState]:
    path = _store_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or any(not valid_state(v) for v in data.values()):
            raise ValueError("Invalid install state")
        return data
    except (ValueError, OSError) as error:
        # Keep the evidence instead of silently overwriting a damaged record.
        if os.path.isfile(path):
            os.replace(path, f"{path}.corrupt-{time.time_ns()}")
        decky.logger.warning(f"Preserved damaged install state: {error}")
        return {}


def _save(data: dict[str, InstallState]) -> None:
    write_json(_store_path(), data)


def get_state(app_id: str) -> Optional[InstallState]:
    with _lock:
        return _load().get(app_id)


def restore(app_id: str, state: Optional[InstallState]) -> None:
    with _lock:
        data = _load()
        if state is None:
            data.pop(app_id, None)
        else:
            data[app_id] = state
        _save(data)


def set_installed(
    app_id: str,
    unlocker: str,
    enabled_dlc_ids: list[str],
    proxy: bool = False,
    proxy_dll: Optional[str] = None,
    target_directory: str = "",
    files: Optional[dict[str, str]] = None,
    resource_version: str = "",
) -> None:
    state = InstallState(
        installed=True,
        unlocker=unlocker,
        proxy=proxy,
        proxy_dll=proxy_dll,
        enabled_dlc_ids=enabled_dlc_ids,
        target_directory=target_directory,
        files=files or {},
        resource_version=resource_version,
    )
    restore(app_id, state)


def mark_uninstalled(app_id: str) -> None:
    """Flips installed to False but keeps the rest of the record (unlocker choice,
    DLC selection) around, so re-opening Install after an Uninstall starts from
    what was last configured instead of blank defaults."""
    with _lock:
        data = _load()
        if app_id in data:
            data[app_id]["installed"] = False
            _save(data)
