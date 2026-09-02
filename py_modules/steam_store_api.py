"""
Steam's public store page API (store.steampowered.com/api/appdetails), used
only for its "dlc" id list. SteamCMD's appinfo (steamcmd.py/steamcmd_webapi.py)
is the primary source for DLC data, but the public api.steamcmd.net mirror often
comes back missing the depots/extended sections a DLC list is extracted from
(flagged "_missing_token"/"public_only" — an anonymous login without a license
for the game) even though it can still see the game's own name and other
"common" fields. A store page's DLC list is public storefront data and doesn't
need any of that, so it's the fallback for exactly the case SteamCMD can't cover.
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

_API_URL = "https://store.steampowered.com/api/appdetails?appids={app_id}&filters=basic"

# The store page's DLC list changes rarely — cache about as long as SteamCMD's
# own game-level cooldown (steamcmd_webapi.COOLDOWN_GAME_SECONDS).
COOLDOWN_SECONDS = 600


def _cache_dir() -> str:
    path = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "storeapi")
    os.makedirs(path, exist_ok=True)
    return path


def _cache_path(app_id: str) -> str:
    return os.path.join(_cache_dir(), f"{app_id}.dlc.json")


def _fetch(app_id: str) -> Optional[list[str]]:
    try:
        with urllib.request.urlopen(
            _API_URL.format(app_id=app_id), timeout=15, context=get_ssl_context()
        ) as response:
            body = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        decky.logger.info(f"[Store API] Query failed for {app_id}: {e}")
        return None

    entry = body.get(app_id) or body.get(str(app_id))
    if not entry or not entry.get("success"):
        decky.logger.info(f"[Store API] No success entry for {app_id}")
        return None

    dlc_ids = (entry.get("data") or {}).get("dlc") or []
    return [str(dlc_id) for dlc_id in dlc_ids]


async def get_dlc_ids(app_id: str) -> Optional[list[str]]:
    """Returns app_id's DLC appids per its Steam store page, or None if the
    query failed and there's no usable cache."""
    cache_file = _cache_path(app_id)

    should_query = True
    if os.path.isfile(cache_file):
        age = time.time() - os.path.getmtime(cache_file)
        should_query = age >= COOLDOWN_SECONDS

    if should_query:
        dlc_ids = await asyncio.get_event_loop().run_in_executor(None, _fetch, app_id)
        if dlc_ids is not None:
            try:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(dlc_ids, f)
            except OSError as e:
                decky.logger.info(f"[Store API] Failed to cache response for {app_id}: {e}")
            return dlc_ids

    if os.path.isfile(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            os.remove(cache_file)

    return None
