"""
Port of CreamInstaller/Platforms/Steam/SteamCMD.cs, trimmed down for the
single-game-on-demand flow (no batching/parallel locks — the desktop version
needed those because it scanned a whole library at once; here we only ever
query one appid at a time, right after the user opens that game's page).

Like the original, the public SteamCMD web API (steamcmd_webapi.py) is tried
first and trusted unconditionally if it returns data — only the local
SteamCMD-binary/.vdf-cache path below needs the buildid staleness check,
since that's the plugin's own on-disk cache that can go stale as the game
updates, whereas the web API's data is assumed reasonably fresh already.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import tarfile
import urllib.request
from typing import Optional, TypedDict

import decky
import steam_store_api
import steamcmd_webapi
from helpers import get_ssl_context  # type: ignore
from vdf_lite import get_child, parse

LINUX_STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"


class SteamCmdUnavailable(Exception):
    """Raised when steamcmd can't be downloaded/installed (network, TLS, disk, etc)."""


def _steamcmd_dir() -> str:
    return os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "steamcmd")


def _steamcmd_bin() -> str:
    return os.path.join(_steamcmd_dir(), "steamcmd.sh")


def _appinfo_cache_dir() -> str:
    path = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "appinfo")
    os.makedirs(path, exist_ok=True)
    return path


async def ensure_installed() -> None:
    if os.path.isfile(_steamcmd_bin()):
        return

    def _download_and_extract() -> None:
        os.makedirs(_steamcmd_dir(), exist_ok=True)
        archive_path = os.path.join(_steamcmd_dir(), "steamcmd_linux.tar.gz")
        with urllib.request.urlopen(LINUX_STEAMCMD_URL, context=get_ssl_context()) as response:
            with open(archive_path, "wb") as f:
                f.write(response.read())
        with tarfile.open(archive_path) as tar:
            tar.extractall(_steamcmd_dir())
        os.remove(archive_path)
        os.chmod(_steamcmd_bin(), 0o755)

    try:
        await asyncio.get_event_loop().run_in_executor(None, _download_and_extract)
    except (OSError, tarfile.TarError) as e:
        decky.logger.error(f"[SteamCMD] Failed to download/install steamcmd: {e}")
        raise SteamCmdUnavailable(str(e)) from e


async def _run_app_info_print(app_id: str) -> str:
    """Runs `steamcmd +login anonymous +app_info_print <appid> +quit` and returns the raw VDF block."""
    try:
        await ensure_installed()
    except SteamCmdUnavailable:
        return ""

    def _run() -> str:
        process = subprocess.run(
            [_steamcmd_bin(), "+login", "anonymous", "+app_info_print", app_id, "+quit"],
            cwd=_steamcmd_dir(),
            capture_output=True,
            text=True,
            timeout=120,
        )
        output = process.stdout or ""
        open_bracket = output.find("{")
        close_bracket = output.rfind("}")
        if open_bracket == -1 or close_bracket == -1 or close_bracket <= open_bracket:
            return ""
        return f'"{app_id}"\n' + output[open_bracket:close_bracket + 1]

    return await asyncio.get_event_loop().run_in_executor(None, _run)


class DlcInfo(TypedDict):
    id: str
    name: str


class AppInfo(TypedDict):
    app_id: str
    name: str
    dlcs: list[DlcInfo]


def _vdf_cache_path(app_id: str) -> str:
    return os.path.join(_appinfo_cache_dir(), f"{app_id}.vdf")


async def _get_app_data_from_local_cmd(app_id: str, branch: str, build_id: int) -> Optional[dict]:
    """Runs (or reuses a cached run of) `steamcmd +app_info_print`, retrying if the
    cached copy's buildid for `branch` is older than `build_id` (the game update
    Steam actually has installed) — port of GetAppInfo's staleness-check loop."""
    cache_file = _vdf_cache_path(app_id)

    attempts = 0
    while attempts < 10:
        attempts += 1
        raw: Optional[str] = None
        if os.path.isfile(cache_file):
            with open(cache_file, "r", encoding="utf-8", errors="ignore") as f:
                raw = f.read()
        if not raw:
            raw = await _run_app_info_print(app_id)
            if not raw:
                decky.logger.error(f"[SteamCMD] app_info_print produced no output for {app_id}")
                return None
            with open(cache_file, "w", encoding="utf-8") as f:
                f.write(raw)

        data = parse(raw)
        app_data = get_child(data, app_id)
        if not isinstance(app_data, dict):
            os.remove(cache_file)
            return None

        app_type = get_child(get_child(app_data, "common"), "type")
        if app_type is not None and app_type != "Game":
            return app_data

        cached_build_id = get_child(app_data, "depots", "branches", branch, "buildid")
        if cached_build_id is None:
            return app_data
        try:
            cached_build_id_int = int(cached_build_id)
        except ValueError:
            return app_data

        if cached_build_id_int >= build_id:
            return app_data

        # Cache is for an older build than what's actually installed — drop it (and its
        # DLC caches) and loop around to re-fetch.
        decky.logger.info(f"[SteamCMD] Cached appinfo for {app_id} is stale (cached buildid {cached_build_id_int} < {build_id}), refreshing")
        for dlc_id in _extract_dlc_ids(app_data):
            dlc_cache_file = _vdf_cache_path(dlc_id)
            if os.path.isfile(dlc_cache_file):
                os.remove(dlc_cache_file)
        os.remove(cache_file)

    return None


def _extract_dlc_ids(app_data: dict) -> set[str]:
    dlc_ids: set[str] = set()

    extended = get_child(app_data, "extended")
    dlc_field = get_child(extended, "listofdlc")
    if dlc_field:
        for token in dlc_field.split(","):
            token = token.strip()
            if token.isdigit() and int(token) > 0:
                dlc_ids.add(token)

    depots = get_child(app_data, "depots")
    if isinstance(depots, dict):
        for key, depot in depots.items():
            if not key.isdigit() or not isinstance(depot, dict):
                continue
            dlc_app_id = get_child(depot, "dlcappid")
            if dlc_app_id and str(dlc_app_id).isdigit() and int(dlc_app_id) > 0:
                dlc_ids.add(str(dlc_app_id))

    return dlc_ids


def _dlc_name_from_cache(dlc_id: str) -> Optional[str]:
    """Best-effort DLC display name from whichever cache (web API or local VDF) we
    might already have for it, without triggering a new query."""
    cmd_json_file = os.path.join(_appinfo_cache_dir(), f"{dlc_id}.cmd.json")
    if os.path.isfile(cmd_json_file):
        try:
            with open(cmd_json_file, "r", encoding="utf-8") as f:
                dlc_data = json.load(f)
            name = get_child(get_child(dlc_data, "common"), "name")
            if name:
                return name
        except (json.JSONDecodeError, OSError):
            pass

    vdf_file = _vdf_cache_path(dlc_id)
    if os.path.isfile(vdf_file):
        with open(vdf_file, "r", encoding="utf-8", errors="ignore") as f:
            dlc_raw = f.read()
        dlc_data = get_child(parse(dlc_raw), dlc_id)
        name = get_child(get_child(dlc_data, "common"), "name")
        if name:
            return name

    return None


async def _dlc_name(dlc_id: str) -> str:
    """A DLC's display name — cached copy if we have one, otherwise a fresh (and
    then cached) SteamCMD web API lookup. Unlike the base game, a DLC entry's own
    "common" section (which is all a name needs) comes through fine even when the
    web API can't see the base game's depots/extended data, so this is cheap and
    reliable — falls back to the bare id only if the lookup itself fails."""
    cached = _dlc_name_from_cache(dlc_id)
    if cached:
        return cached
    dlc_data = await steamcmd_webapi.query(dlc_id, is_dlc=True)
    name = get_child(get_child(dlc_data, "common"), "name") if dlc_data else None
    return name or dlc_id


async def get_app_info(app_id: str, branch: str = "public", build_id: int = 0) -> Optional[AppInfo]:
    app_data = await steamcmd_webapi.query(app_id)
    if app_data is None:
        app_data = await _get_app_data_from_local_cmd(app_id, branch, build_id)
    if app_data is None:
        return None

    name = get_child(get_child(app_data, "common"), "name") or app_id
    dlc_ids = _extract_dlc_ids(app_data)
    if not dlc_ids:
        # The web API's anonymous-login response is often missing depots/extended
        # (flagged "_missing_token"/"public_only") even when it has the game's own
        # name — the store page's DLC list is public data that doesn't need that.
        store_dlc_ids = await steam_store_api.get_dlc_ids(app_id)
        if store_dlc_ids:
            dlc_ids = set(store_dlc_ids)

    dlcs = [
        DlcInfo(id=dlc_id, name=await _dlc_name(dlc_id)) for dlc_id in sorted(dlc_ids, key=int)
    ]
    return AppInfo(app_id=app_id, name=name, dlcs=dlcs)
