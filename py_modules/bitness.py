"""
Shared 32/64-bit heuristic used by smokeapi.py, creamapi.py and koaloader.py:
no PE header parsing, just "does this game directory have a steam_api64.dll
(or a backup of one)". Defaults to 64-bit when there's no signal either way,
since that covers the overwhelming majority of current games.
"""
from __future__ import annotations

import os


def is_64_bit(directory: str) -> bool:
    if os.path.isfile(os.path.join(directory, "steam_api64.dll")) or os.path.isfile(
        os.path.join(directory, "steam_api64_o.dll")
    ):
        return True
    if os.path.isfile(os.path.join(directory, "steam_api.dll")) or os.path.isfile(
        os.path.join(directory, "steam_api_o.dll")
    ):
        return False
    return True
