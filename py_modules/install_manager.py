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


def candidates(root: str) -> list[dict]:
    base = Path(root).resolve()
    found = []
    visited = 0
    for directory, children, files in os.walk(base, followlinks=False):
        visited += 1
        if visited > 512:
            break
        path = Path(directory)
        recover(str(path))
        children[:] = sorted(c for c in children if not (path / c).is_symlink() and not c.startswith("."))
        if len(path.relative_to(base).parts) >= 4:
            children[:] = []
        markers = any(check(str(path)) for check in unlocker_detection._DETECTORS.values())
        if path == base or markers:
            found.append({"path": str(path.relative_to(base)) if path != base else ".",
                          "bitness": 64 if is_64_bit(str(path)) else 32,
                          "detected": markers})
    return found


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
