"""Check staging boundaries and installable archive permissions."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from scripts import package_release


class ReleasePackageTests(unittest.TestCase):
    def fixture(self, root):
        for name in ('main.py', 'package.json', 'plugin.json', 'README.md', 'NOTICE.md', 'LICENSE',
                     'py_modules/__init__.py', 'py_modules/worker.py', 'dist/index.js',
                     'dist/index.js.map', 'resources/example.dll',
                     '.env', 'py_modules/__pycache__/stale.pyc'):
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('pass\n' if path.suffix == '.py' else 'fixture')
        (root / 'package.json').write_text(json.dumps({'version': '0.1.0'}))

    def javascript(self, args, **kwargs):
        Path(args[-1]).write_text('export default {};')

    def test_staging_excludes_env_maps_and_caches_and_preserves_sources(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'source'
            self.fixture(root)
            destination = Path(temporary) / 'staged'
            with patch.object(package_release.subprocess, 'run', side_effect=self.javascript):
                package_release.stage(root, destination)
            names = [path.relative_to(destination).as_posix() for path in destination.rglob('*') if path.is_file()]
            self.assertEqual([name for name in names if name.endswith('.py')], ['main.py'])
            self.assertIn('py_modules/worker.pyc', names)
            self.assertFalse(any('.env' in name or '__pycache__' in name
                                 or name.endswith('.map') for name in names))
            self.assertEqual((root / 'py_modules/worker.py').read_text(), 'pass\n')
            self.assertFalse((root / 'py_modules/worker.pyc').exists())

    @unittest.skipUnless(sys.version_info[:2] == (3, 14), 'Release archives require CPython 3.14')
    def test_archive_has_one_plugin_root_and_runtime_permissions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'source'
            self.fixture(root)
            with patch.object(package_release.subprocess, 'run', side_effect=self.javascript):
                output = package_release.package(root)
            plugin = package_release.ROOT.name
            with zipfile.ZipFile(output) as archive:
                self.assertTrue(all(name.startswith(plugin + '/') for name in archive.namelist()))
                self.assertEqual(archive.getinfo(plugin + '/main.py').external_attr >> 16 & 0o777, 0o644)
                self.assertEqual(archive.read(plugin + '/resources/example.dll'), b'fixture')

    def test_wrong_python_version_fails_before_packaging(self):
        with patch.object(package_release.sys, 'version_info', (3, 12)):
            with self.assertRaisesRegex(RuntimeError, 'CPython 3.14'):
                package_release.package(Path('unused-fixture-path'))
