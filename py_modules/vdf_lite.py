"""
Minimal recursive-descent parser for Valve's KeyValues (VDF) text format,
just enough to read libraryfolders.vdf, appmanifest_*.acf and SteamCMD's
app_info_print output. Not a general-purpose VDF library.
"""
from __future__ import annotations

from typing import Any, Dict


def _skip_whitespace_and_comments(text: str, i: int) -> int:
    n = len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] not in "\r\n":
                i += 1
            continue
        break
    return i


def _read_string(text: str, i: int) -> tuple[str, int]:
    n = len(text)
    if i < n and text[i] == '"':
        i += 1
        start = i
        buf = []
        while i < n and text[i] != '"':
            if text[i] == "\\" and i + 1 < n:
                buf.append(text[i + 1])
                i += 2
                continue
            buf.append(text[i])
            i += 1
        return "".join(buf), i + 1
    # Unquoted token (rare in these files, but be lenient)
    start = i
    while i < n and text[i] not in ' \t\r\n{}"':
        i += 1
    return text[start:i], i


def parse(text: str) -> Dict[str, Any]:
    """Parses a VDF document and returns {rootKey: {...}} (or {} on failure)."""
    i = 0
    n = len(text)
    result: Dict[str, Any] = {}

    def parse_object(i: int) -> tuple[Dict[str, Any], int]:
        obj: Dict[str, Any] = {}
        while True:
            i = _skip_whitespace_and_comments(text, i)
            if i >= n:
                break
            if text[i] == "}":
                return obj, i + 1
            key, i = _read_string(text, i)
            i = _skip_whitespace_and_comments(text, i)
            if i >= n:
                break
            if text[i] == "{":
                value, i = parse_object(i + 1)
            else:
                value, i = _read_string(text, i)
            obj[key] = value
        return obj, i

    i = _skip_whitespace_and_comments(text, i)
    while i < n:
        key, i = _read_string(text, i)
        i = _skip_whitespace_and_comments(text, i)
        if i < n and text[i] == "{":
            value, i = parse_object(i + 1)
        else:
            value, i = _read_string(text, i)
        result[key] = value
        i = _skip_whitespace_and_comments(text, i)
    return result


def get_child(obj: Any, *path: str) -> Any:
    """Case-insensitive nested lookup, mirroring ValveDataFile.GetChild usage in CreamInstaller."""
    cur = obj
    for key in path:
        if not isinstance(cur, dict):
            return None
        match = next((v for k, v in cur.items() if k.lower() == key.lower()), None)
        cur = match
    return cur
