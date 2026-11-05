"""Verify protected releases preserve behavior while dropping debug metadata."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest

from scripts.release_python import compile_release, protect_python


class ReleaseMetadataTests(unittest.TestCase):
    def test_nested_metadata_is_removed_without_disabling_checks(self):
        source = b'''"""private module documentation"""
from __future__ import annotations
class Example:
    """private class documentation"""
    def check(self, value):
        """private method documentation"""
        assert value, "required runtime check"
        def nested():
            """private nested documentation"""
            return __debug__
        return nested()
async def asynchronous():
    """private async documentation"""
    return 7
'''
        code = compile_release(source, 'py_modules/example.py')
        def check_metadata(value):
            self.assertEqual(value.co_filename, 'py_modules/example.py')
            self.assertEqual(value.co_linetable, b'')
            for constant in value.co_consts:
                if isinstance(constant, types.CodeType):
                    check_metadata(constant)
                elif isinstance(constant, str):
                    self.assertNotIn('private', constant)
        check_metadata(code)
        namespace = {}
        exec(code, namespace)
        example = namespace['Example']()
        self.assertIsNone(namespace.get('__doc__'))
        self.assertIsNone(example.__doc__)
        self.assertIsNone(example.check.__doc__)
        self.assertTrue(example.check(True))
        with self.assertRaisesRegex(AssertionError, 'required runtime check'):
            example.check(False)

    def test_packed_entry_and_sourceless_package_import_and_traceback(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'example').mkdir()
            (root / 'example/__init__.py').write_text('from .worker import result\n')
            (root / 'example/worker.py').write_text(
                '"""private worker documentation"""\ndef result():\n return 42\n')
            (root / 'main.py').write_text(
                'from example import result\nclass Plugin:\n def run(self):\n  return result()\n')
            for path in sorted(root.rglob('*.py')):
                protect_python(path, root)
            self.assertEqual(list(root.rglob('*.py')), [root / 'main.py'])
            result = subprocess.run([sys.executable, '-c',
                "import sys,importlib.util; sys.path.insert(0,sys.argv[1]); "
                "s=importlib.util.spec_from_file_location('release_plugin',sys.argv[1]+'/main.py'); "
                "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
                "print(m.Plugin().run())", str(root)], capture_output=True, text=True, check=True)
            self.assertEqual(result.stdout.strip(), '42')
            failing = root / 'failing.py'
            failing.write_text('def fail():\n raise ValueError("fixture failure")\nfail()\n')
            protect_python(failing, root)
            result = subprocess.run([sys.executable, str(root / 'failing.pyc')], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('ValueError: fixture failure', result.stderr)
            self.assertNotIn('Error in sys.excepthook', result.stderr)

    def test_vendor_documentation_is_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            vendor = root / 'py_modules/_vendor'
            vendor.mkdir(parents=True)
            path = vendor / 'example.py'
            path.write_text('"""vendor documentation"""\n')
            protect_python(path, root)
            spec = importlib.util.spec_from_file_location('release_vendor_fixture', path.with_suffix('.pyc'))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            self.assertEqual(module.__doc__, 'vendor documentation')


if __name__ == '__main__':
    unittest.main()
