"""Weekly check for a newer CreamDeck release, plus host facts for bug reports.

The result is cached in the plugin settings directory so the GitHub API is
queried at most once every seven days. A failed check is never fatal: callers
then only show the current version.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request

import decky
from atomic_json import write_json
# Decky's bundled Python has no usable system CA store; Decky supplies one.
from helpers import get_ssl_context  # type: ignore

RELEASES_URL = "https://api.github.com/repos/Qiming-Liu/CreamDeck/releases/latest"
CHECK_INTERVAL = 7 * 24 * 60 * 60
# Retry a failed check after an hour instead of on every page open.
FAILURE_INTERVAL = 60 * 60
_VERSION = re.compile(r"^v?(\d+(?:\.\d+)*)$")


def _cache_path() -> str:
    return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "update_check.json")


def _parse(version: str) -> tuple[int, ...] | None:
    match = _VERSION.match(version.strip()) if isinstance(version, str) else None
    return tuple(int(part) for part in match.group(1).split(".")) if match else None


def newer(latest: str | None, current: str) -> bool:
    first, second = _parse(latest or ""), _parse(current)
    return first is not None and second is not None and first > second


def _read_cache() -> dict:
    try:
        with open(_cache_path(), encoding="utf-8") as source:
            value = json.load(source)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _fetch() -> str:
    request = urllib.request.Request(RELEASES_URL, headers={
        "Accept": "application/vnd.github+json", "User-Agent": "CreamDeck-update-check"})
    with urllib.request.urlopen(request, timeout=8, context=get_ssl_context()) as response:
        data = json.loads(response.read(256 * 1024).decode("utf-8"))
    tag = data.get("tag_name") if isinstance(data, dict) else None
    if _parse(tag or "") is None:
        raise ValueError("Unexpected release tag")
    return tag.lstrip("v")


def latest_version(force: bool = False, now: float | None = None) -> str | None:
    """Return the latest released version, or None when it is unknown."""
    now = time.time() if now is None else now
    cache = _read_cache()
    checked = cache.get("checked_at") if isinstance(cache.get("checked_at"), (int, float)) else None
    latest = cache.get("latest") if isinstance(cache.get("latest"), str) else None
    interval = CHECK_INTERVAL if latest else FAILURE_INTERVAL
    if not force and checked is not None and 0 <= now - checked < interval:
        return latest
    try:
        latest = _fetch()
    except Exception as error:  # noqa: BLE001 - network failures only hide the badge
        decky.logger.info(f"Update check failed: {error!r}")
        write_json(_cache_path(), {"checked_at": now, "latest": None})
        return None
    write_json(_cache_path(), {"checked_at": now, "latest": latest})
    return latest


def os_version() -> str:
    """A short operating system description, e.g. 'SteamOS 3.6.19'."""
    try:
        with open("/etc/os-release", encoding="utf-8") as source:
            fields = dict(line.rstrip("\n").split("=", 1) for line in source if "=" in line)
    except OSError:
        return ""
    clean = {key: value.strip().strip('"') for key, value in fields.items()}
    name = clean.get("NAME", "")
    version = clean.get("VERSION_ID") or clean.get("BUILD_ID", "")
    return f"{name} {version}".strip() or clean.get("PRETTY_NAME", "")
