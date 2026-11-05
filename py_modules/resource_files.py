"""
Locates the plugin's bundled unlocker DLLs (vendored, at decky/resources/,
copied straight from this repo's own CreamInstaller/Resources/* — the same
binaries the .NET app embeds as assembly resources). No runtime download.
"""
from __future__ import annotations

import os

_RESOURCES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "resources")


def resource_path(*parts: str) -> str:
    path = os.path.join(_RESOURCES_DIR, *parts)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Bundled resource not found: {path}")
    return path
