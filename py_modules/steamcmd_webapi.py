"""
Port of CreamInstaller/Platforms/Steam/SteamCMD.WebAPI.cs. This is the fast path
CreamInstaller actually prefers: a public HTTP mirror of SteamCMD's appinfo
(https://api.steamcmd.net) that avoids running the SteamCMD binary at all in
the common case — steamcmd.py only falls back to actually shelling out to
steamcmd.sh when this fails or returns nothing.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.error
import urllib.request
from typing import Optional

import decky
from helpers import get_ssl_context  # type: ignore

_API_URL = "https://api.steamcmd.net/v1/info/{app_id}"

# Matches SteamCMD.WebAPI.cs's CooldownGame/CooldownDlc: how long a successful
# cached response is trusted before we bother hitting the API again.
COOLDOWN_GAME_SECONDS = 600
COOLDOWN_DLC_SECONDS = 1200


def _appinfo_cache_dir() -> str:
    path = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "appinfo")
    os.makedirs(path, exist_ok=True)
    return path


def _cache_path(app_id: str) -> str:
    return os.path.join(_appinfo_cache_dir(), f"{app_id}.cmd.json")


def _fetch(app_id: str) -> Optional[dict]:
    try:
        with urllib.request.urlopen(
            _API_URL.format(app_id=app_id), timeout=15, context=get_ssl_context()
        ) as response:
            body = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        decky.logger.info(f"[SteamCMD WebAPI] Query failed for {app_id}: {e}")
        return None

    if body.get("status") != "success":
        decky.logger.info(f"[SteamCMD WebAPI] Status not success for {app_id}: {body.get('status')}")
        return None

    data = body.get("data") or {}
    app_data = data.get(app_id) or data.get(str(app_id))
    if not app_data or not (app_data.get("common") or {}).get("name"):
        decky.logger.info(f"[SteamCMD WebAPI] Empty data for {app_id}")
        return None

    return app_data


async def query(app_id: str, is_dlc: bool = False) -> Optional[dict]:
    """Returns the same shape as a parsed SteamCMD VDF block (dict with
    common/depots/extended keys), or None if both the live query and any
    cached fallback failed."""
    cache_file = _cache_path(app_id)
    cooldown = COOLDOWN_DLC_SECONDS if is_dlc else COOLDOWN_GAME_SECONDS

    should_query = True
    if os.path.isfile(cache_file):
        age = time.time() - os.path.getmtime(cache_file)
        should_query = age >= cooldown

    if should_query:
        app_data = await asyncio.get_event_loop().run_in_executor(None, _fetch, app_id)
        if app_data is not None:
            try:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(app_data, f)
            except OSError as e:
                decky.logger.info(f"[SteamCMD WebAPI] Failed to cache response for {app_id}: {e}")
            return app_data

    if os.path.isfile(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            os.remove(cache_file)

    return None
