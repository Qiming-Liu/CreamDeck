"""
Minimal stand-in for the real `decky` module (backend/decky_loader/plugin/imports/decky.pyi
in SteamDeckHomebrew/decky-loader), which only exists inside an actual Decky Loader
runtime. This lets CI import main.py and every py_modules/*.py file — and therefore
catch syntax errors, typos, and bad cross-module references — without one.
"""
from __future__ import annotations

import logging
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="creamdeck-ci-")

HOME = os.path.expanduser("~")
USER = "deck"
DECKY_VERSION = "0.0.0-ci"
DECKY_USER = "deck"
DECKY_USER_HOME = HOME
DECKY_HOME = os.path.join(_TMP, "decky_home")
DECKY_PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECKY_PLUGIN_NAME = "CreamDeck"
DECKY_PLUGIN_VERSION = "0.0.0-ci"
DECKY_PLUGIN_AUTHOR = "Qiming-Liu"
DECKY_PLUGIN_SETTINGS_DIR = os.path.join(_TMP, "settings")
DECKY_PLUGIN_RUNTIME_DIR = os.path.join(_TMP, "runtime")
DECKY_PLUGIN_LOG_DIR = os.path.join(_TMP, "logs")
DECKY_PLUGIN_LOG = os.path.join(DECKY_PLUGIN_LOG_DIR, "creamdeck.log")

for _dir in (DECKY_HOME, DECKY_PLUGIN_SETTINGS_DIR, DECKY_PLUGIN_RUNTIME_DIR, DECKY_PLUGIN_LOG_DIR):
    os.makedirs(_dir, exist_ok=True)

logger = logging.getLogger("creamdeck-ci")
logger.addHandler(logging.NullHandler())


def emit(event, *args):
    logger.debug("emit(%s, %s)", event, args)


def migrate_any(target_dir, *files_or_directories):
    pass


def migrate_settings(*files_or_directories):
    pass


def migrate_runtime(*files_or_directories):
    pass


def migrate_logs(*files_or_directories):
    pass
