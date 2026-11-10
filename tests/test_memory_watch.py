"""Tests for the backend memory watcher. Thresholds are injected, so they don't
depend on how much memory the test process really uses."""
from __future__ import annotations

import os
import sys
import threading
import tracemalloc
import unittest
from unittest.mock import patch

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_PLUGIN_DIR = os.path.dirname(_TESTS_DIR)
_PY_MODULES_DIR = os.path.join(_PLUGIN_DIR, "py_modules")
for path in (_TESTS_DIR, _PY_MODULES_DIR, _PLUGIN_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

import memory_watch  # noqa: E402


class WatcherTest(unittest.TestCase):
    def setUp(self):
        self.tracing_before = tracemalloc.is_tracing()
        self.notes: list[str] = []
        self.reports: list[str] = []
        self.watcher = memory_watch.Watcher(self.notes.append, self.reports.append,
                                            start_mb=100, report_mb=(200, 400), detail_limit_mb=300)

    def tearDown(self):
        self.watcher.close()
        if tracemalloc.is_tracing() and not self.tracing_before:
            tracemalloc.stop()

    def test_normal_memory_does_nothing(self):
        self.watcher.check(50)
        self.watcher.check(None)
        self.assertEqual((self.notes, self.reports), ([], []))
        self.assertEqual(self.watcher.peak, 50)

    def test_growth_starts_tracing_then_reports_each_threshold_once(self):
        if self.tracing_before:
            self.skipTest("tracemalloc already running in this interpreter")
        self.watcher.check(120)
        self.assertTrue(tracemalloc.is_tracing())
        self.assertEqual(self.reports, [])
        self.assertIn("allocation tracing started", self.notes[0])

        memory_watch.note_call("get_game_page")
        self.watcher.check(250)
        self.watcher.check(260)
        self.assertEqual(len(self.reports), 1)
        report = self.reports[0]
        self.assertIn("crossed 200 MB", report)
        self.assertIn("get_game_page", report)
        self.assertIn("[thread stacks]", report)
        self.assertIn("[allocation sites since tracing started]", report)
        self.assertIn("[traced python memory]", report)

        self.watcher.check(450)
        self.assertEqual(len(self.reports), 2)
        self.assertIn("crossed 400 MB", self.reports[1])
        # Past the detail limit only the cheap sections are written.
        self.assertNotIn("[allocation sites", self.reports[1])
        self.assertEqual(self.watcher.peak, 450)

    def test_a_jump_past_several_thresholds_writes_one_report(self):
        self.watcher.check(500)
        self.assertEqual(len(self.reports), 1)
        self.assertIn("crossed 400 MB", self.reports[0])
        self.watcher.check(500)
        self.assertEqual(len(self.reports), 1)

    def test_close_stops_only_tracing_it_started(self):
        if self.tracing_before:
            self.skipTest("tracemalloc already running in this interpreter")
        self.watcher.check(120)
        self.watcher.close()
        self.assertFalse(tracemalloc.is_tracing())


class TrackedTest(unittest.IsolatedAsyncioTestCase):
    async def test_tracked_records_call_and_keeps_result(self):
        class Dummy:
            @memory_watch.tracked
            async def get_update_info(self, force=False):
                return {"force": force}

        self.assertEqual(await Dummy().get_update_info(True), {"force": True})
        self.assertEqual(memory_watch._recent[-1][1], "get_update_info")


class ReportFileTest(unittest.TestCase):
    def test_append_rotates_large_file(self):
        path = memory_watch.report_path()
        with open(path, "w", encoding="utf-8") as out:
            out.write("old")
        with patch.object(memory_watch, "MAX_REPORT_BYTES", 1):
            memory_watch.append_report("new report\n")
        with open(path, encoding="utf-8") as source:
            self.assertEqual(source.read(), "new report\n")
        with open(f"{path}.1", encoding="utf-8") as source:
            self.assertEqual(source.read(), "old")


class SamplerThreadTest(unittest.TestCase):
    def test_start_and_stop_thread(self):
        with patch.object(memory_watch, "rss_mb", return_value=40.0), \
                patch.object(memory_watch, "INTERVAL_SECONDS", 0.01):
            self.assertTrue(memory_watch.start(lambda message: None))
            self.assertTrue(any(t.name == "creamdeck-memory-watch" for t in threading.enumerate()))
            memory_watch.stop()
        self.assertFalse(any(t.name == "creamdeck-memory-watch" for t in threading.enumerate()))

    def test_start_refuses_without_proc(self):
        with patch.object(memory_watch, "rss_mb", return_value=None):
            self.assertFalse(memory_watch.start(lambda message: None))

    def test_rss_reads_proc_or_returns_none(self):
        value = memory_watch.rss_mb()
        self.assertTrue(value is None or value > 0)


if __name__ == "__main__":
    unittest.main()
