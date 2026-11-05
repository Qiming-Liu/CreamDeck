"""
Minimal stand-in for the real `helpers` module (backend/decky_loader/helpers.py in
SteamDeckHomebrew/decky-loader), which only exists inside an actual Decky Loader
runtime. Real Decky exposes get_ssl_context() there so plugins get a certifi-backed
SSL context instead of relying on the host's (sometimes broken) system CA store —
see py_modules/steamcmd.py and py_modules/steamcmd_webapi.py for why that matters.
"""
from __future__ import annotations

import ssl

try:
    import certifi

    _ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ssl_ctx = ssl.create_default_context()


def get_ssl_context() -> ssl.SSLContext:
    return _ssl_ctx
