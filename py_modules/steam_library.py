"""
Port of CreamInstaller/Platforms/Steam/SteamLibrary.cs, scoped to a single
appid instead of enumerating the whole library (per the plugin's per-game
navigation flow: the game is already chosen via the library context menu,
so there is no need to scan every installed game up front).
"""
from __future__ import annotations

import os
from typing import Optional, TypedDict

from vdf_lite import get_child, parse

DEFAULT_STEAM_ROOT_CANDIDATES = [
    os.path.expanduser("~/.local/share/Steam"),
    os.path.expanduser("~/.steam/steam"),
    os.path.expanduser("~/.steam/root"),
]


class GameInfo(TypedDict):
    app_id: str
    name: str
    branch: str
    build_id: int
    game_directory: str


def _steam_root() -> Optional[str]:
    for candidate in DEFAULT_STEAM_ROOT_CANDIDATES:
        if os.path.isdir(candidate):
            return candidate
    return None


def _library_folders() -> list[str]:
    """Returns every steamapps folder (default + any additional Steam library, e.g. on an SD card)."""
    root = _steam_root()
    if root is None:
        return []

    folders: list[str] = []
    default_steamapps = os.path.join(root, "steamapps")
    if os.path.isdir(default_steamapps):
        folders.append(default_steamapps)

    library_folders_vdf = os.path.join(default_steamapps, "libraryfolders.vdf")
    if os.path.isfile(library_folders_vdf):
        with open(library_folders_vdf, "r", encoding="utf-8", errors="ignore") as f:
            data = parse(f.read())
        root_obj = get_child(data, "libraryfolders")
        if isinstance(root_obj, dict):
            for key, entry in root_obj.items():
                if not key.isdigit() or not isinstance(entry, dict):
                    continue
                raw_path = get_child(entry, "path")
                if not raw_path:
                    continue
                steamapps_path = os.path.join(raw_path, "steamapps")
                if os.path.isdir(steamapps_path) and steamapps_path not in folders:
                    folders.append(steamapps_path)
    return folders


def find_game(app_id: str) -> Optional[GameInfo]:
    """Looks for appmanifest_<app_id>.acf across every known library folder."""
    for library_dir in _library_folders():
        manifest_path = os.path.join(library_dir, f"appmanifest_{app_id}.acf")
        if not os.path.isfile(manifest_path):
            continue
        with open(manifest_path, "r", encoding="utf-8", errors="ignore") as f:
            data = parse(f.read())
        app_state = get_child(data, "AppState")
        if not isinstance(app_state, dict):
            continue

        install_dir = get_child(app_state, "installdir")
        name = get_child(app_state, "name")
        build_id = get_child(app_state, "buildid")
        if not install_dir or not name or not build_id:
            continue

        branch = get_child(app_state, "UserConfig", "BetaKey") or get_child(
            app_state, "MountedConfig", "BetaKey"
        ) or "public"

        game_directory = os.path.join(library_dir, "common", install_dir)
        if not os.path.isdir(game_directory):
            continue

        try:
            build_id_int = int(build_id)
        except ValueError:
            build_id_int = 0

        return GameInfo(
            app_id=app_id,
            name=name,
            branch=branch,
            build_id=build_id_int,
            game_directory=game_directory,
        )
    return None
