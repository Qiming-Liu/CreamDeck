"""Daily check for a newer CreamDeck release, plus host facts for bug reports.

The result is cached in the plugin settings directory so the GitHub API is
queried at most once a day. A failed check is never fatal: callers
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

# The newest releases, test builds (pre-releases) included: GitHub's "latest" leaves those out.
RELEASES_URL = "https://api.github.com/repos/Qiming-Liu/CreamDeck/releases?per_page=30"
CHECK_INTERVAL = 24 * 60 * 60
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


def newest(tags) -> tuple[str | None, str | None]:
    """The newest of `tags` overall and the newest release among them (None when none)."""
    found = sorted((version for version in map(_canonical, tags) if version), key=_parse)
    releases = [version for version in found if "-" not in version]
    return (found[-1] if found else None, releases[-1] if releases else None)


def _fetch() -> tuple[str, str | None]:
    """The newest published version and the newest release."""
    request = urllib.request.Request(RELEASES_URL, headers={
        "Accept": "application/vnd.github+json", "User-Agent": "CreamDeck-update-check"})
    with urllib.request.urlopen(request, timeout=8, context=get_ssl_context()) as response:
        data = json.loads(response.read(1024 * 1024).decode("utf-8"))
    if not isinstance(data, list):
        raise ValueError("Unexpected release list")
    latest, release = newest(item.get("tag_name") for item in data
                             if isinstance(item, dict) and not item.get("draft"))
    if latest is None:
        raise ValueError("No release tag")
    return latest, release


def latest_version(force: bool = False, now: float | None = None, current: str = "") -> str | None:
    """The newest version worth comparing with `current`, or None when it is unknown:
    a test build looks at every published version, a release only at releases."""
    now = time.time() if now is None else now
    cache = _read_cache()
    checked = cache.get("checked_at") if isinstance(cache.get("checked_at"), (int, float)) else None
    latest, release = _canonical(cache.get("latest")), _canonical(cache.get("release"))
    interval = CHECK_INTERVAL if latest else FAILURE_INTERVAL
    if force or checked is None or not 0 <= now - checked < interval:
        try:
            latest, release = _fetch()
        except Exception as error:  # noqa: BLE001 - network failures only hide the badge
            decky.logger.info(f"Update check failed: {error!r}")
            write_json(_cache_path(), {"checked_at": now, "latest": None, "release": None})
            return None
        write_json(_cache_path(), {"checked_at": now, "latest": latest, "release": release})
    return latest if "-" in (_canonical(current) or "") else release


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
