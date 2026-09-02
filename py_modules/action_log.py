"""
A dedicated, persistent action log for CreamDeck — separate from decky's own
per-session log files (which get replaced fresh every plugin reload, at
DECKY_PLUGIN_LOG_DIR/<timestamp>.log). This one accumulates across restarts
under a fixed filename, specifically so a bug report can be answered with one
file that has "everything CreamDeck has done" — every Plugin RPC call (args,
outcome, timing) plus notable non-RPC events like install-state mismatches —
and the version line at the top of each run makes clear which build produced it.
"""
from __future__ import annotations

import functools
import logging
import logging.handlers
import os
import time
from typing import Any, Callable

import decky

_LOG_FILE_NAME = "creamdeck_actions.log"
_MAX_BYTES = 5 * 1024 * 1024
_BACKUP_COUNT = 2

_logger: logging.Logger | None = None


def _get_logger() -> logging.Logger:
    global _logger
    if _logger is not None:
        return _logger

    logger = logging.getLogger("creamdeck.actions")
    logger.setLevel(logging.INFO)
    logger.propagate = False  # this is a separate log, not a mirror of decky's own

    log_path = os.path.join(decky.DECKY_PLUGIN_LOG_DIR, _LOG_FILE_NAME)
    handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=_MAX_BYTES, backupCount=_BACKUP_COUNT, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)

    logger.info(f"===== CreamDeck v{decky.DECKY_PLUGIN_VERSION} starting =====")
    _logger = logger
    return logger


def log_call(func: Callable) -> Callable:
    """Decorator for a Plugin async method — logs the call going in (name + args)
    and either its result or its exception coming out, with timing. Re-raises
    whatever it caught, so callers still handle failures exactly as before."""

    @functools.wraps(func)
    async def wrapper(self, *args, **kwargs):
        logger = _get_logger()
        logger.info(f"{func.__name__} called: args={args!r} kwargs={kwargs!r}")
        start = time.monotonic()
        try:
            result = await func(self, *args, **kwargs)
        except Exception as e:  # noqa: BLE001 - log then re-raise, callers still handle it
            elapsed_ms = int((time.monotonic() - start) * 1000)
            logger.error(f"{func.__name__} raised after {elapsed_ms}ms: {e!r}")
            raise
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.info(f"{func.__name__} returned after {elapsed_ms}ms: {_summarize(result)}")
        return result

    return wrapper


def log_event(message: str) -> None:
    """For notable things that aren't a Plugin RPC call itself — e.g. install-state
    writes, integrity-check mismatches."""
    _get_logger().info(message)


def log_warning(message: str) -> None:
    _get_logger().warning(message)


def _summarize(result: Any) -> str:
    if isinstance(result, dict):
        # Full payloads (dlcs/unlockers lists) would bloat every line — only the
        # top-level shape is what actually matters for debugging a call.
        return "{" + ", ".join(f"{k}={_short(v)}" for k, v in result.items()) + "}"
    return _short(result)


def _short(value: Any) -> str:
    if isinstance(value, (list, dict, set, tuple)):
        return f"<{type(value).__name__} len={len(value)}>"
    return repr(value)
