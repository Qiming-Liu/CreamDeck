"""Weekly check for a newer CreamDeck release, plus host facts for bug reports.

The result is cached in the plugin settings directory so the GitLab API is
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

# Redirects to the newest release on GitLab.
RELEASES_URL = "https://gitlab.com/api/v4/projects/alan-liu%2FCreamDeck/releases/permalink/latest"
CHECK_INTERVAL = 7 * 24 * 60 * 60
# Retry a failed check after an hour instead of on every page open.
FAILURE_INTERVAL = 60 * 60
# An optional label marks a test build, e.g. "1.0.7-test".
_VERSION = re.compile(r"[vV]?\s*(\d+(?:\.\d+)*)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?")


def _cache_path() -> str:
    return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "update_check.json")


def _canonical(version) -> str | None:
    """A version as "x.y.z" or, for a test build, "x.y.z-label"; None when it is not one.

    Release tags should be "vx.y.z", but a mistyped tag still counts: the "v" may
    be missing and "1.2" or "1.20" (a dropped dot) both mean 1.2.0.
    """
    match = _VERSION.fullmatch(version.strip()) if isinstance(version, str) else None
    if not match:
        return None
    words = match.group(1).split(".")
    if len(words) == 2 and len(words[1]) > 1:
        words = [words[0], words[1][:-1], words[1][-1]]
    words += ["0"] * (3 - len(words))
    label = match.group(2)
    return ".".join(str(int(word)) for word in words) + (f"-{label}" if label else "")


def _parse(version) -> tuple | None:
    """Sort key: the numbers, then a test build before the release of the same
    number, then test labels with their numbers compared as numbers ("test" <
    "test2" < "test10")."""
    canonical = _canonical(version)
    if canonical is None:
        return None
    number, _, label = canonical.partition("-")
    parts = [int(part) for part in number.split(".")]
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    words = tuple((0, int(word)) if word.isdigit() else (1, word.lower())
                  for word in re.findall(r"\d+|[^\d]+", label))
    return tuple(parts), not label, words


def newer(latest: str | None, current: str) -> bool:
    """Whether `latest` is worth offering to someone on `current`.

    A test build is offered only to those already testing: an installed
    release never points at a test build, whatever its number.
    """
    first, second = _parse(latest or ""), _parse(current)
    if first is None or second is None or (not first[1] and second[1]):
        return False
    return first > second


def _read_cache() -> dict:
    try:
        with open(_cache_path(), encoding="utf-8") as source:
            value = json.load(source)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _fetch() -> str:
    request = urllib.request.Request(RELEASES_URL, headers={
        "Accept": "application/json", "User-Agent": "CreamDeck-update-check"})
    with urllib.request.urlopen(request, timeout=8, context=get_ssl_context()) as response:
        data = json.loads(response.read(256 * 1024).decode("utf-8"))
    latest = _canonical(data.get("tag_name") if isinstance(data, dict) else None)
    if latest is None:
        raise ValueError("Unexpected release tag")
    return latest


def latest_version(force: bool = False, now: float | None = None) -> str | None:
    """Return the latest released version, or None when it is unknown."""
    now = time.time() if now is None else now
    cache = _read_cache()
    checked = cache.get("checked_at") if isinstance(cache.get("checked_at"), (int, float)) else None
    latest = _canonical(cache.get("latest"))
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
