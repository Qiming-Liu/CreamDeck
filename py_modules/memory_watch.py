"""
Catch runaway memory growth in the backend process and record where it happens.

A daemon thread samples this process's resident memory once a second. It runs
outside asyncio, so it still reports when the event loop is blocked. Normal use
stays near 50 MB. Once memory passes START_MB, Python allocation tracing starts,
so only abnormal growth pays its cost. At each REPORT_MB threshold a report goes
to creamdeck_memory.log beside the plugin log: resident and traced memory, the
largest mappings, every thread's stack, the most recent RPC calls, the most
common object types and the top allocation sites. Traced memory far below
resident memory means the growth is native, outside Python objects.
"""
from __future__ import annotations

import collections
import functools
import gc
import os
import re
import sys
import threading
import time
import traceback
import tracemalloc
from typing import Callable, Iterable, Optional

import decky

INTERVAL_SECONDS = 1.0
START_MB = 160
REPORT_MB = (256, 512, 1024, 2048, 4096)
# Snapshots and object counts grow with the leak itself; past this, report stacks only.
DETAIL_LIMIT_MB = 1024
TRACE_FRAMES = 10
TOP_SITES = 15
REPORT_FILE = "creamdeck_memory.log"
MAX_REPORT_BYTES = 4 * 1024 * 1024

_recent: collections.deque = collections.deque(maxlen=20)
_recent_lock = threading.Lock()
_loaded_at = time.time()
_thread: Optional[threading.Thread] = None
_stop = threading.Event()
_MAPPING = re.compile(r"^[0-9a-f]+-[0-9a-f]+ ")


def note_call(name: str) -> None:
    with _recent_lock:
        _recent.append((time.time(), name))


def tracked(func: Callable) -> Callable:
    """Remember a Plugin RPC for the memory report's recent calls. Every RPC has it."""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        note_call(func.__name__)
        return await func(*args, **kwargs)
    return wrapper


def rss_mb() -> Optional[float]:
    """This process's resident memory in MiB, or None where /proc is unavailable."""
    try:
        with open("/proc/self/statm", encoding="ascii") as source:
            pages = int(source.read().split()[1])
        return pages * os.sysconf("SC_PAGE_SIZE") / (1024 * 1024)
    except (OSError, ValueError, IndexError, AttributeError):
        return None


def report_path() -> str:
    return os.path.join(decky.DECKY_PLUGIN_LOG_DIR, REPORT_FILE)


def append_report(text: str) -> None:
    path = report_path()
    try:
        if os.path.getsize(path) > MAX_REPORT_BYTES:
            os.replace(path, f"{path}.1")
    except OSError:
        pass
    with open(path, "a", encoding="utf-8") as out:
        out.write(text)


def _largest_mappings(limit: int = 8) -> list[str]:
    rows = []
    name, size = "", 0
    try:
        with open("/proc/self/smaps", encoding="utf-8", errors="replace") as source:
            for line in source:
                if _MAPPING.match(line):
                    if size:
                        rows.append((size, name))
                    parts = line.split()
                    name, size = (parts[5] if len(parts) > 5 else "[anonymous]"), 0
                elif line.startswith("Rss:"):
                    size = int(line.split()[1])
        if size:
            rows.append((size, name))
    except (OSError, ValueError, IndexError):
        return []
    totals: collections.Counter = collections.Counter()
    for size, mapping in rows:
        totals[mapping] += size
    return [f"{kb / 1024:9.1f} MB  {mapping}" for mapping, kb in totals.most_common(limit)]


def _thread_stacks() -> list[str]:
    names = {thread.ident: thread.name for thread in threading.enumerate()}
    lines = []
    for ident, frame in sys._current_frames().items():
        if ident == threading.get_ident():
            continue
        lines.append(f"--- thread {names.get(ident, ident)}")
        lines.extend(line.rstrip() for line in traceback.format_stack(frame))
    return lines


def _object_types(limit: int = 15) -> list[str]:
    counts = collections.Counter(type(item).__name__ for item in gc.get_objects())
    return [f"{count:10d}  {name}" for name, count in counts.most_common(limit)]


def _allocation_sites() -> list[str]:
    if not tracemalloc.is_tracing():
        return ["(allocation tracing is not running)"]
    snapshot = tracemalloc.take_snapshot().filter_traces((
        tracemalloc.Filter(False, tracemalloc.__file__),
        tracemalloc.Filter(False, __file__),
    ))
    lines = []
    for stat in snapshot.statistics("traceback")[:TOP_SITES]:
        lines.append(f"{stat.size / (1024 * 1024):9.1f} MB in {stat.count} blocks")
        lines.extend(f"    {line.strip()}" for line in stat.traceback.format(limit=TRACE_FRAMES) if line.strip())
    return lines


def _section(title: str, lines: Iterable[str]) -> str:
    body = "\n".join(lines) or "(none)"
    return f"[{title}]\n{body}\n"


def build_report(rss: float, peak: float, threshold: int, detailed: bool) -> str:
    now = time.time()
    header = (f"===== {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now))} "
              f"CreamDeck v{decky.DECKY_PLUGIN_VERSION} pid={os.getpid()} "
              f"crossed {threshold} MB: rss={rss:.0f} MB peak={peak:.0f} MB "
              f"uptime={now - _loaded_at:.0f}s =====\n")
    parts = [header]
    if tracemalloc.is_tracing():
        current, traced_peak = tracemalloc.get_traced_memory()
        parts.append(_section("traced python memory", [
            f"current={current / (1024 * 1024):.1f} MB peak={traced_peak / (1024 * 1024):.1f} MB "
            f"(tracing started at {START_MB} MB)"]))
    parts.append(_section("gc", [f"counts={gc.get_count()}"]))
    parts.append(_section("largest mappings", _largest_mappings()))
    with _recent_lock:
        recent = list(_recent)
    parts.append(_section("recent calls", [
        f"{time.strftime('%H:%M:%S', time.localtime(at))} ({now - at:.0f}s ago) {name}" for at, name in recent]))
    parts.append(_section("thread stacks", _thread_stacks()))
    if detailed:
        parts.append(_section("object types", _object_types()))
        parts.append(_section("allocation sites since tracing started", _allocation_sites()))
    return "".join(parts) + "\n"


class Watcher:
    """Decides when to start tracing and when to write a report; one per process."""

    def __init__(self, notify: Callable[[str], None], write: Callable[[str], None] = append_report,
                 start_mb: float = START_MB, report_mb: Iterable[int] = REPORT_MB,
                 detail_limit_mb: float = DETAIL_LIMIT_MB):
        self.notify = notify
        self.write = write
        self.start_mb = start_mb
        self.report_mb = tuple(sorted(report_mb))
        self.detail_limit_mb = detail_limit_mb
        self.peak = 0.0
        self.reported: set[int] = set()
        self.started_tracing = False

    def check(self, rss: Optional[float]) -> None:
        if rss is None:
            return
        self.peak = max(self.peak, rss)
        if rss >= self.start_mb and not tracemalloc.is_tracing():
            tracemalloc.start(TRACE_FRAMES)
            self.started_tracing = True
            self.notify(f"Backend memory reached {rss:.0f} MB; allocation tracing started")
        due = [mb for mb in self.report_mb if rss >= mb and mb not in self.reported]
        if not due:
            return
        self.reported.update(due)
        threshold = max(due)
        self.write(build_report(rss, self.peak, threshold, rss <= self.detail_limit_mb))
        self.notify(f"Backend memory reached {rss:.0f} MB; report written to {REPORT_FILE}")

    def close(self) -> None:
        if self.started_tracing and tracemalloc.is_tracing():
            tracemalloc.stop()
        self.started_tracing = False


def _run(watcher: Watcher, read: Callable[[], Optional[float]]) -> None:
    failed = False
    while not _stop.wait(INTERVAL_SECONDS):
        try:
            watcher.check(read())
        except Exception as error:  # noqa: BLE001 - diagnostics must never stop the plugin
            if not failed:
                failed = True
                watcher.notify(f"Memory watcher error: {error!r}")
    watcher.close()


def start(notify: Callable[[str], None]) -> bool:
    """Start the sampler thread; returns False where resident memory can't be read."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return True
    if rss_mb() is None:
        return False
    _stop.clear()
    _thread = threading.Thread(target=_run, args=(Watcher(notify), rss_mb),
                               name="creamdeck-memory-watch", daemon=True)
    _thread.start()
    return True


def stop() -> None:
    global _thread
    _stop.set()
    if _thread is not None:
        _thread.join(timeout=2)
    _thread = None
