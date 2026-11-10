"""The persistent, redacted plugin log."""
from __future__ import annotations

import logging
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py_modules"))

import plugin_log  # noqa: E402


class PluginLogTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.logger = logging.getLogger(f"plugin-log-test-{self.id()}")
        self.logger.propagate = False

    def attach(self) -> plugin_log.PluginLog:
        log = plugin_log.PluginLog(self.directory / "logs", "creamdeck")
        log.attach(self.logger, "started")
        # Registered after the directory cleanup, so it runs first and releases the file.
        self.addCleanup(log.detach)
        return log

    def test_redacts_home_directories_and_secrets(self):
        text = plugin_log.redact(
            "/home/deck/.steam token=abc {'api_key': 'x'} https://example.com/a?sig=1&b=2 /var/home/deck/y")
        self.assertEqual(text, "~/.steam token=*** {'api_key': '***'} https://example.com/a?*** ~/y")

    def test_entries_survive_a_second_attach(self):
        first = self.attach()
        self.logger.info("before reload")
        first.detach()
        second = self.attach()
        messages = [entry["message"] for entry in second.read()]
        self.assertEqual(messages, ["started", "before reload", "started"])

    def test_read_folds_traceback_lines_into_the_entry_above(self):
        log = self.attach()
        try:
            raise ValueError("boom")
        except ValueError:
            self.logger.exception("call failed in /home/deck/game")
        entry = log.read()[-1]
        self.assertEqual(entry["level"], "ERROR")
        lines = entry["message"].splitlines()
        self.assertEqual(lines[0], "call failed in ~/game")
        self.assertEqual(lines[1], "Traceback (most recent call last):")
        self.assertEqual(lines[-1], "ValueError: boom")

    def test_export_writes_rotated_files_oldest_first(self):
        log = plugin_log.PluginLog(self.directory / "logs", "creamdeck")
        log.path.parent.mkdir(parents=True)
        Path(f"{log.path}.2").write_text("oldest\n", encoding="utf-8")
        Path(f"{log.path}.1").write_text("older /home/deck/x\n", encoding="utf-8")
        log.path.write_text("newest\n", encoding="utf-8")
        exported = log.export(self.directory)
        self.assertTrue(exported.startswith("~/Downloads/creamdeck-log-"))
        text = (self.directory / exported[2:]).read_text(encoding="utf-8")
        self.assertEqual(text, "oldest\nolder ~/x\nnewest\n")

    def test_export_writes_into_the_chosen_folder(self):
        log = plugin_log.PluginLog(self.directory / "logs", "creamdeck")
        log.path.parent.mkdir(parents=True)
        log.path.write_text("line\n", encoding="utf-8")
        home = self.directory / "home"
        chosen = home / "Desktop"
        chosen.mkdir(parents=True)
        self.assertEqual(log.export_directory(home), str(home))
        exported = log.export(home, chosen)
        self.assertTrue(exported.startswith("~/Desktop/creamdeck-log-"))
        self.assertEqual((home / exported[2:]).read_text(encoding="utf-8"), "line\n")
        with self.assertRaises(NotADirectoryError):
            log.export(home, home / "missing")


if __name__ == "__main__":
    unittest.main()
