"""Preflight, bounded discovery and recoverable filesystem transactions.

Installers run against a staging directory. A journal is published before game
files change, so a restart can restore both files and the previous install record.
"""
from __future__ import annotations
import asyncio
import hashlib
import json
import os
import shutil
import tempfile
import time
from collections import deque
from pathlib import Path

import creamapi
import decky
import install_state
import smokeapi
import unlocker_detection
from atomic_json import write_json
from bitness import is_64_bit

LOCK = asyncio.Lock()
MODULES = {"smokeapi": smokeapi, "creamapi": creamapi}
NAMES = {".dlc_unlocker_proxy.json", ".dlc_unlocker_creamapi_proxy.json"}
for module in MODULES.values():
    for function in ("_api32_path", "_api64_path", "_api32_backup_path", "_api64_backup_path", "_config_path"):
        NAMES.add(os.path.basename(getattr(module, function)("")))
    NAMES.update(f"{name}.dll" for name in module.PROXY_DLL_NAMES)
JOURNAL = ".creamdeck-transaction"


class OperationError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()



def snapshot(directory: str) -> dict[str, str]:
    result = {}
    for name in sorted(NAMES):
        path = Path(directory, name)
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise OperationError("file_conflict")
        if path.is_file():
            result[name] = digest(path)
    return result


# The fallback scan stops at whichever limit it reaches first.
SCAN_DEPTH = 8
SCAN_DIRECTORIES = 4096
SCAN_SECONDS = 2.0
# Asset folders that never hold the Steamworks DLL but can be huge.
SKIPPED_FOLDERS = {"content", "paks", "streamingassets", "movies", "localization",
                   "managed", "monobleedingedge", "shadercache", "__pycache__"}


def _subfolders(path: Path) -> list[str]:
    try:
        with os.scandir(path) as entries:
            return sorted(entry.name for entry in entries
                          if not entry.name.startswith(".") and entry.is_dir(follow_symlinks=False))
    except OSError:
        return []


def _real_folder(base: Path, parts: tuple[str, ...]) -> Path | None:
    """Return base/parts when every step is a real folder, never a symlink."""
    path = base
    for part in parts:
        path = path / part
        if path.is_symlink() or not path.is_dir():
            return None
    return path


def _steam_sdk_version(name: str) -> int:
    digits = "".join(character for character in name if character.isdigit())
    return int(digits) if digits else -1


def likely_folders(base: Path) -> list[tuple[str, ...]]:
    """Known Steamworks DLL locations, most likely first.

    Unreal Engine 4/5 loads the DLL from its Steamworks third-party folder (newest
    SDK first); Unity keeps native plugins under <Name>_Data/Plugins; older Unreal
    builds and most other engines keep it next to the executable.
    """
    top = _subfolders(base)
    found: list[tuple[str, ...]] = []
    steamworks = ("Engine", "Binaries", "ThirdParty", "Steamworks")
    if _real_folder(base, steamworks):
        versions = sorted(_subfolders(base.joinpath(*steamworks)), key=_steam_sdk_version, reverse=True)
        found += [(*steamworks, version, arch) for version in versions for arch in ("Win64", "Win32")]
    for name in top:
        if name.endswith("_Data"):
            found += [(name, "Plugins", "x86_64"), (name, "Plugins", "x86"), (name, "Plugins")]
    for name in top:
        found += [(name, "Binaries", "Win64"), (name, "Binaries", "Win32")]
    found += [("Binaries", "Win64"), ("Binaries", "Win32"), ()]
    if _real_folder(base, ("lib",)):
        found += [("lib", name) for name in _subfolders(base / "lib")] + [("lib",)]
    return list(dict.fromkeys(found))


def candidates(root: str) -> list[dict]:
    """Find folders holding a Steamworks DLL: known locations first, then a bounded scan.

    The breadth-first scan only runs when no known location matches. It visits
    shallow folders first and stops at SCAN_DEPTH, SCAN_DIRECTORIES or SCAN_SECONDS.
    """
    base = Path(root).resolve()
    found = []
    checked = set()

    def check(path: Path) -> None:
        checked.add(path)
        recover(str(path))
        if any(detect(str(path)) for detect in unlocker_detection._DETECTORS.values()):
            found.append({"path": str(path.relative_to(base)) if path != base else ".",
                          "bitness": 64 if is_64_bit(str(path)) else 32, "detected": True})

    for parts in likely_folders(base):
        path = _real_folder(base, parts)
        if path is not None:
            check(path)
    if not found:
        deadline = time.monotonic() + SCAN_SECONDS
        queue = deque([(base, 0)])
        visited = 0
        while queue and visited < SCAN_DIRECTORIES and time.monotonic() < deadline:
            path, depth = queue.popleft()
            visited += 1
            if path not in checked:
                check(path)
            if depth < SCAN_DEPTH:
                queue.extend((path / name, depth + 1) for name in _subfolders(path)
                             if name.lower() not in SKIPPED_FOLDERS)
    if not any(option["path"] == "." for option in found):
        found.append({"path": ".", "bitness": 64 if is_64_bit(str(base)) else 32, "detected": False})
    return found


def relative_target(root: str, supplied: str) -> str:
    """Accept the ways people copy a DLL location, and return a plain relative path.

    Windows separators, a leading install-folder name, an absolute path inside the
    installation and a trailing DLL file name all point at the same directory.
    """
    if not isinstance(supplied, str):
        raise OperationError("invalid_target")
    text = supplied.strip().strip("\"'").replace("\\", "/")
    base = Path(root)
    if text.startswith("/") or Path(text).is_absolute():
        for prefix in (base, base.resolve()):
            try:
                text = Path(text).relative_to(prefix).as_posix()
                break
            except ValueError:
                continue
        else:
            raise OperationError("invalid_target")
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if parts and parts[0] == base.resolve().name and not base.joinpath(parts[0]).exists():
        parts = parts[1:]
    if parts and ".." not in parts and base.joinpath(*parts).is_file():
        parts = parts[:-1]
    return str(Path(*parts)) if parts else "."


def target(root: str, relative: str = ".") -> str:
    base = Path(root).resolve()
    supplied = Path(relative)
    if supplied.is_absolute() or ".." in supplied.parts:
        raise OperationError("invalid_target")
    current = base
    for part in supplied.parts:
        current /= part
        if current.is_symlink():
            raise OperationError("invalid_target")
    resolved = current.resolve()
    if not resolved.is_relative_to(base) or not resolved.is_dir():
        raise OperationError("invalid_target")
    return str(resolved)


def integrity(directory: str, state: dict | None) -> tuple[str, list[str]]:
    if not state or not state.get("installed"):
        return ("external" if unlocker_detection.currently_installed(directory) else "clean"), []
    if not state.get("files"):
        return "legacy", []
    actual = snapshot(directory)
    changed = [name for name, expected in state["files"].items() if actual.get(name) != expected]
    # Also flag a second installation placed beside our own files.
    owned = state["files"]
    for module in MODULES.values():
        config = os.path.basename(module._config_path(""))
        if config in actual and config not in owned:
            changed.append(config)
    return ("modified" if changed else "healthy"), changed



def legacy_files(directory: str, state: dict) -> dict[str, str]:
    """Adopt an old record only when bundled bytes prove the DLL ownership."""
    key = state.get("unlocker")
    if key not in MODULES:
        raise OperationError("legacy_install")
    module = MODULES[key]
    actual = snapshot(directory)
    names = set()
    pairs = []
    bits = is_64_bit(directory)
    if state.get("proxy"):
        proxy = state.get("proxy_dll")
        if proxy not in module.PROXY_DLL_NAMES:
            raise OperationError("legacy_install")
        source = module._bundled_dlls()[1 if bits else 0]
        pairs.append((f"{proxy}.dll", source))
        names.add(os.path.basename(module._proxy_state_path("")))
    else:
        for bit, source in zip(("32", "64"), module._bundled_dlls()):
            name = os.path.basename(getattr(module, f"_api{bit}_path")(""))
            backup = os.path.basename(getattr(module, f"_api{bit}_backup_path")(""))
            if backup in actual:
                # A matching original means Steam already restored this DLL.
                if actual.get(name) != actual[backup]:
                    pairs.append((name, source))
                names.add(backup)
    if not pairs and not names:
        raise OperationError("legacy_install")
    for name, source in pairs:
        if name not in actual or not Path(source).is_file() or actual[name] != digest(Path(source)):
            raise OperationError("legacy_install")
        names.add(name)
    names.add(os.path.basename(module._config_path("")))
    return {name: actual[name] for name in names if name in actual}


def validate(directory: str, unlocker: str, proxy: bool, proxy_dll: str) -> dict:
    if unlocker not in MODULES:
        raise OperationError("invalid_unlocker")
    module = MODULES[unlocker]
    if proxy and proxy_dll not in module.PROXY_DLL_NAMES:
        raise OperationError("invalid_proxy")
    try:
        sources = list(module._bundled_dlls())
    except FileNotFoundError as error:
        raise OperationError("missing_resource") from error
    if not any(Path(getattr(module, f"_api{bit}_path")(directory)).is_file() for bit in ("32", "64")):
        raise OperationError("target_not_found")
    if any(not Path(p).is_file() or Path(p).stat().st_size == 0 for p in sources):
        raise OperationError("missing_resource")
    if not os.access(directory, os.W_OK):
        raise OperationError("not_writable")
    return {"bitness": 64 if is_64_bit(directory) else 32, "proxy": proxy}


def check_collisions(directory: str, unlocker: str, proxy: bool, proxy_dll: str, owned=()):
    module = MODULES[unlocker]
    names = {os.path.basename(module._config_path(""))}
    if proxy:
        names.add(f"{proxy_dll}.dll")
    else:
        names.update(os.path.basename(getattr(module, f"_api{bit}_backup_path")("")) for bit in ("32", "64"))
    if any(name not in owned and os.path.lexists(Path(directory, name)) for name in names):
        raise OperationError("file_conflict")


def _restore_files(directory: str, journal: Path, record: dict) -> None:
    for name in record["changed"]:
        if name not in NAMES:
            raise OperationError("file_conflict")
        destination = Path(directory, name)
        if destination.is_symlink():
            raise OperationError("file_conflict")
        if destination.is_file():
            current = digest(destination)
            known = (record["before"].get(name), record["after"].get(name))
            if current not in known:
                decky.logger.warning(f"Recovery preserved externally changed file: {destination}")
                continue
        saved = journal / "before" / name
        if saved.is_file():
            temporary = journal / "restore"
            shutil.copy2(saved, temporary)
            os.replace(temporary, destination)
        elif destination.exists():
            destination.unlink()



def recover(directory: str) -> None:
    journal = Path(directory, JOURNAL)
    if not journal.exists():
        return
    if journal.is_symlink():
        raise OperationError("file_conflict")
    try:
        record = json.loads((journal / "journal.json").read_text(encoding="utf-8"))
        if (not isinstance(record, dict) or not isinstance(record.get("app_id"), str)
                or not record["app_id"].isdigit() or not isinstance(record.get("changed"), list)
                or not all(isinstance(name, str) and name in NAMES for name in record["changed"])
                or not isinstance(record.get("before"), dict) or not isinstance(record.get("after"), dict)
                or "state" not in record
                or (record["state"] is not None and not install_state.valid_state(record["state"]))):
            raise ValueError("Invalid recovery journal")
    except (OSError, ValueError) as error:
        raise OperationError("recovery_failed") from error
    _restore_files(directory, journal, record)
    install_state.restore(record["app_id"], record["state"])
    shutil.rmtree(journal)



async def transaction(app_id: str, directory: str, mutate, commit) -> None:
    recover(directory)
    before = snapshot(directory)
    old_state = install_state.get_state(app_id)
    with tempfile.TemporaryDirectory(prefix=".creamdeck-stage-", dir=directory) as temporary:
        stage = Path(temporary)
        for name in before:
            shutil.copy2(Path(directory, name), stage / name)
        await mutate(str(stage))
        after = snapshot(str(stage))
        changed = sorted(name for name in before.keys() | after.keys() if before.get(name) != after.get(name))
        # Detect external edits made while the staged operation was running.
        if snapshot(directory) != before:
            raise OperationError("file_conflict")
        backup = stage / "before"
        backup.mkdir()
        for name in changed:
            if name in before:
                shutil.copy2(Path(directory, name), backup / name)
        write_json(str(stage / "journal.json"), {"app_id": app_id, "state": old_state, "changed": changed,
                                                "before": before, "after": after})
        journal = Path(directory, JOURNAL)
        stage.rename(journal)
        try:
            for name in changed:
                destination = Path(directory, name)
                if name in after:
                    os.replace(journal / name, destination)
                else:
                    destination.unlink()
            commit(after)
            committed = Path(directory, f".creamdeck-committed-{os.path.basename(temporary)}")
            journal.rename(committed)
        except BaseException:
            recover(directory)
            raise
        # The journal disappearing is the commit point. A crash before this
        # rolls back on the next page load; a crash after it keeps the new state.
        shutil.rmtree(committed, ignore_errors=True)



API_DLLS = {os.path.basename(getattr(smokeapi, f"_api{bit}_path")("")):
            os.path.basename(getattr(smokeapi, f"_api{bit}_backup_path")("")) for bit in ("32", "64")}
CONFIGS = {os.path.basename(module._config_path("")) for module in MODULES.values()}


def _role(name: str) -> str:
    if name in API_DLLS:
        return "dll"
    if name in API_DLLS.values():
        return "backup"
    if name in CONFIGS:
        return "config"
    if name.endswith(".dll"):
        return "proxy"
    return "record"


def present_api_dlls(directory: str) -> list[str]:
    return [name for name in sorted(API_DLLS) if os.path.isfile(os.path.join(directory, name))]


def unlocker_files(directory: str) -> list[str]:
    """Names of every unlocker-related file present, for read-only display."""
    return [name for name in sorted(NAMES) if os.path.isfile(os.path.join(directory, name))]


def file_report(directory: str, state: dict) -> list[dict]:
    """Describe what uninstall would do with each recorded file, without changing anything.

    Mirrors clean_owned: unchanged files are removed, an unchanged backup is
    moved back over our unchanged DLL, and anything modified is kept.
    """
    expected = state.get("files") or {}
    if not expected:
        try:
            expected = legacy_files(directory, state)
        except OperationError:
            return []
    actual = snapshot(directory)
    backups_ok = all(actual.get(backup) == expected[backup]
                     for backup in API_DLLS.values() if backup in expected)
    rows = []
    for name in sorted(expected):
        status = "same" if actual.get(name) == expected[name] else "missing" if name not in actual else "modified"
        role = _role(name)
        if not backups_ok:
            action = "blocked"
        elif role == "backup":
            dll = next(dll for dll, backup in API_DLLS.items() if backup == name)
            action = "restore" if actual.get(dll) in (None, expected.get(dll)) else "delete"
        elif role == "dll" and API_DLLS[name] in expected:
            action = "restore" if status != "modified" else "keep"
        else:
            action = "none" if status == "missing" else "delete" if status == "same" else "keep"
        rows.append({"name": name, "role": role, "status": status, "action": action})
    # A second installation beside our own files is reported but never touched.
    for name in sorted(CONFIGS - expected.keys()):
        if name in actual:
            rows.append({"name": name, "role": "config", "status": "foreign", "action": "keep"})
    return rows


def clean_owned(directory: str, state: dict) -> list[str]:
    """Keep modified files; restore original DLLs only over our unchanged DLL."""
    expected = state.get("files", {})
    if not expected:
        raise OperationError("legacy_install")
    actual = snapshot(directory)
    preserved = []
    handled = set()
    for module in (smokeapi,):
        for bit in ("32", "64"):
            name = os.path.basename(getattr(module, f"_api{bit}_path")(""))
            backup = os.path.basename(getattr(module, f"_api{bit}_backup_path")(""))
            if backup not in expected:
                continue
            if actual.get(backup) != expected[backup]:
                raise OperationError("backup_changed")
            if actual.get(name) in (None, expected.get(name)):
                os.replace(Path(directory, backup), Path(directory, name))
            else:
                # Steam has replaced the DLL; its current copy takes precedence.
                preserved.append(name)
                Path(directory, backup).unlink()
            handled.update((name, backup))
    for name, value in expected.items():
        if name in handled or name not in actual:
            continue
        if actual[name] == value:
            Path(directory, name).unlink()
        else:
            preserved.append(name)
    return preserved
