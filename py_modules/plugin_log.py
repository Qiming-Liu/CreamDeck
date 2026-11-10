"""One persistent, redacted log file for everything the plugin logs.

A handler on the plugin logger (``decky.logger``) writes every record to
``<log dir>/<name>.log``, so the plugin keeps a single log that survives restarts.
It rotates by size and is never reset on start. Home directories become ``~`` and
secrets are masked before anything reaches the disk, so the file can be exported
and attached to a bug report as it is.

This module does not import ``decky``; the caller passes the logger and paths.
"""
from __future__ import annotations

import functools
import logging
import logging.handlers
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, TypeVar

MAX_BYTES = 2 * 1024 * 1024
BACKUP_COUNT = 4
# The viewer reads only the newest part of the current file.
TAIL_BYTES = 256 * 1024
FRONTEND_MESSAGE_LIMIT = 4000

LINE_FORMAT = "%(asctime)s %(levelname)s %(message)s"
TIME_FORMAT = "%Y-%m-%d %H:%M:%S"
_ENTRY = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ([A-Z]+) (.*)$")

_HOME = re.compile(r"(?:/var)?/home/[^/\s'\"]+")
_URL_QUERY = re.compile(r"(https?://[^\s?#'\"]+)\?[^\s'\"#]*")
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[\w.~+/=-]+")
# A name that ends in key/token/secret/password/... followed by = or :, also as a
# quoted dict key ('token': 'x'), keeps the name and loses the value.
_SECRET = re.compile(
    r"(?i)\b([\w-]*(?:key|token|secret|passw(?:or)?d|authorization|cookie|signature))\b"
    r"([\"']?\s*[:=]\s*[\"']?)([^\s\"'&,;)}\]]+)"
)


def redact(text: str) -> str:
    """Replace home directories with ~ and mask secrets and URL query strings."""
    text = _HOME.sub("~", text)
    text = _URL_QUERY.sub(r"\1?***", text)
    text = _BEARER.sub(r"\1 ***", text)
    return _SECRET.sub(r"\1\2***", text)


class RedactingFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__(LINE_FORMAT, TIME_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


USER_TAG = "[user]"
Method = TypeVar("Method", bound=Callable[..., Awaitable[Any]])


def log_frontend(logger: logging.Logger, level: str, message: Any) -> None:
    """Record what the frontend saw, tagged so it reads apart from backend entries.
    A user action the frontend carried out itself keeps its own [user] tag."""
    write = {"error": logger.error, "warning": logger.warning}.get(level, logger.info)
    text = str(message)[:FRONTEND_MESSAGE_LIMIT]
    if text.startswith(USER_TAG + " "):
        write("%s", text)
    else:
        write("[frontend] %s", text)


def _failure(result: Any) -> str | None:
    """The reason of a result dict that reports failure without raising, else None."""
    if isinstance(result, dict) and (result.get("ok") is False or result.get("success") is False):
        return str(result.get("message") or result.get("error") or "no reason given")
    return None


def user_action(logger: logging.Logger, describe: Callable[..., str]) -> Callable[[Method], Method]:
    """Decorate an RPC that a user action starts: the log gets one line saying what
    the user did and how it ended. ``describe`` takes the RPC's arguments (without
    self) and returns the action in plain words, such as "Turn HV on for app 10".

    Expected refusals (ValueError, PermissionError) are warnings without a
    traceback; other exceptions are errors with one. Reads and polls are not user
    actions and stay out of the log."""
    def decorate(method: Method) -> Method:
        @functools.wraps(method)
        async def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
            try:
                action = describe(*args, **kwargs)
            except Exception:  # a bad description must not break the action
                action = method.__name__
            try:
                result = await method(self, *args, **kwargs)
            except (ValueError, PermissionError) as error:
                logger.warning("%s %s: refused: %s", USER_TAG, action, error)
                raise
            except Exception as error:
                logger.error("%s %s: failed: %s", USER_TAG, action, error, exc_info=True)
                raise
            reason = _failure(result)
            if reason is None:
                logger.info("%s %s: done", USER_TAG, action)
            else:
                logger.warning("%s %s: failed: %s", USER_TAG, action, reason)
            return result
        return wrapper  # type: ignore[return-value]
    return decorate


class PluginLog:
    def __init__(self, directory: Path | str, name: str) -> None:
        self.name = name
        self.path = Path(directory) / f"{name}.log"
        self._handler: logging.Handler | None = None
        self._logger: logging.Logger | None = None

    def attach(self, logger: logging.Logger, banner: str) -> None:
        """Send the logger's records to the file. A second call does nothing."""
        if self._handler is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # A plugin reload builds a new instance; drop the handler the old one left.
        for old in list(logger.handlers):
            if getattr(old, "plugin_log_path", None) == str(self.path):
                logger.removeHandler(old)
                old.close()
        handler = logging.handlers.RotatingFileHandler(
            self.path, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8", delay=True
        )
        handler.setLevel(logging.INFO)
        handler.setFormatter(RedactingFormatter())
        handler.plugin_log_path = str(self.path)  # type: ignore[attr-defined]
        if logger.getEffectiveLevel() > logging.INFO:
            logger.setLevel(logging.INFO)
        logger.addHandler(handler)
        self._handler, self._logger = handler, logger
        logger.info(banner)

    def detach(self) -> None:
        if self._handler is None or self._logger is None:
            return
        self._logger.removeHandler(self._handler)
        self._handler.close()
        self._handler = self._logger = None

    def read(self, limit: int = 500) -> list[dict[str, str]]:
        """The newest entries, oldest first. Lines without a timestamp (tracebacks)
        belong to the entry above them."""
        try:
            with self.path.open("rb") as source:
                source.seek(0, os.SEEK_END)
                size = source.tell()
                source.seek(max(0, size - TAIL_BYTES))
                text = source.read().decode("utf-8", errors="replace")
        except OSError:
            return []
        lines = text.splitlines()
        if size > TAIL_BYTES and lines:
            lines = lines[1:]  # cut in the middle
        entries: list[dict[str, str]] = []
        for line in lines:
            match = _ENTRY.match(line)
            if match:
                entries.append({"time": match[1], "level": match[2], "message": match[3]})
            elif entries and line:
                entries[-1]["message"] += "\n" + line
        return entries[-max(1, int(limit)):]

    def clear(self) -> None:
        """Empty the log and its rotated copies. The handler appends, so the open
        file keeps working after it is truncated."""
        for index in range(1, BACKUP_COUNT + 1):
            try:
                os.remove(f"{self.path}.{index}")
            except OSError:
                pass
        try:
            with self.path.open("w", encoding="utf-8"):
                pass
        except OSError:
            pass

    @staticmethod
    def export_directory(home: Path | str) -> str:
        """The folder the export picker opens in: ~/Downloads, or home without it."""
        downloads = Path(home) / "Downloads"
        return str(downloads if downloads.is_dir() else Path(home))

    def export(self, home: Path | str, folder: Path | str | None = None) -> str:
        """Write the whole log, oldest first, into ``folder`` (~/Downloads when
        none is given) and return its path with ~ for the home directory.
        Raises OSError when it cannot be written."""
        home = Path(home)
        created = False
        if folder:
            directory = Path(folder)
            if not directory.is_absolute() or not directory.is_dir():
                raise NotADirectoryError(f"Not a folder: {folder}")
        else:
            directory = home / "Downloads"
            created = not directory.exists()
            directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = directory / f"{self.name}-log-{stamp}.log"
        sources = [Path(f"{self.path}.{index}") for index in range(BACKUP_COUNT, 0, -1)] + [self.path]
        with target.open("w", encoding="utf-8") as output:
            for source in sources:
                try:
                    text = source.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                # Older files may predate a redaction rule.
                output.write(redact(text))
        # A root backend must leave the files to the user who opens them.
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            owner = home.stat()
            for path in ([directory] if created else []) + [target]:
                os.chown(path, owner.st_uid, owner.st_gid)
        try:
            return "~/" + target.relative_to(home).as_posix()
        except ValueError:
            return target.as_posix()
