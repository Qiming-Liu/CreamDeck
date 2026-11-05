"""Package a protected CPython 3.14 release without modifying development files."""
import argparse
import json
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

if __package__:
    from .release_python import protect_python
else:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from release_python import protect_python

ROOT = Path(__file__).resolve().parents[1]


def stage(root: Path, destination: Path):
    destination.mkdir()
    for name in ('main.py', 'package.json', 'plugin.json', 'README.md', 'LICENSE'):
        shutil.copy2(root / name, destination / name)
    shutil.copytree(root / 'py_modules', destination / 'py_modules',
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    (destination / 'dist').mkdir()
    shutil.copytree(root / 'resources', destination / 'resources')
    subprocess.run(['node', str(ROOT / 'scripts/obfuscate_release.mjs'),
                    str(root / 'dist/index.js'), str(destination / 'dist/index.js')], check=True)
    for source in sorted(destination.rglob('*.py')):
        protect_python(source, destination)


def package(root: Path = ROOT, output: Path | None = None) -> Path:
    if sys.implementation.name != 'cpython' or sys.version_info[:2] != (3, 14):
        raise RuntimeError("Release packaging requires Decky's CPython 3.14 bytecode format")
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    if not (root / 'dist/index.js').is_file():
        raise FileNotFoundError('Run pnpm build before packaging.')
    output = (output or root / 'out' / f'CreamDeck-v{version}.zip').resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='plugin-release-') as temporary:
        destination = Path(temporary) / 'CreamDeck'
        stage(root, destination)
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(destination.rglob('*')):
                if not path.is_file():
                    continue
                relative = path.relative_to(destination).as_posix()
                entry = zipfile.ZipInfo(f'CreamDeck/{relative}')
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | 0o644) << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(entry, path.read_bytes())
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    print(package(output=parser.parse_args().output))
