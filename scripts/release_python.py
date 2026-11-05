"""Prepare source-free releases; reversible packing is not encryption."""
from __future__ import annotations

import ast
import importlib.util
import marshal
import os
from pathlib import Path
import struct
import types
import zlib


class StripDocstrings(ast.NodeTransformer):
    def strip(self, node):
        self.generic_visit(node)
        if (node.body and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
                and isinstance(node.body[0].value.value, str)):
            docstring = node.body.pop(0)
            if not node.body:
                node.body.append(ast.copy_location(ast.Pass(), docstring))
        return node

    visit_Module = strip
    visit_ClassDef = strip
    visit_FunctionDef = strip
    visit_AsyncFunctionDef = strip


def strip_metadata(code: types.CodeType) -> types.CodeType:
    return code.replace(
        co_consts=tuple(strip_metadata(value) if isinstance(value, types.CodeType) else value
                        for value in code.co_consts),
        co_linetable=b"", co_firstlineno=1,
    )


def compile_release(source: bytes, filename: str, *, strip_debug: bool = True):
    tree = ast.parse(source, filename=filename)
    if strip_debug:
        tree = StripDocstrings().visit(tree)
    # Preserve asserts and __debug__: optimization must not remove runtime checks.
    code = compile(tree, filename, "exec", dont_inherit=True, optimize=0)
    return strip_metadata(code) if strip_debug else code


def packed_loader(source: bytes, filename: str, *, strip_debug: bool = True) -> str:
    code = compile_release(source, filename, strip_debug=strip_debug)
    key = os.urandom(32)
    payload = zlib.compress(marshal.dumps(code), level=9)
    payload = bytes(value ^ key[index % len(key)] for index, value in enumerate(payload))
    return (
        "def _release_unpack():\n"
        " import marshal,zlib\n"
        f" k={key!r}\n"
        f" p={payload!r}\n"
        " return marshal.loads(zlib.decompress(bytes(v^k[i%len(k)] for i,v in enumerate(p))))\n"
        "exec(_release_unpack(),globals())\n"
        "del _release_unpack\n"
    )


def protect_python(path: Path, root: Path):
    filename = path.relative_to(root).as_posix()
    # Third-party packages can depend on their docstrings or line metadata.
    strip_debug = "_vendor" not in path.relative_to(root).parts
    loader = packed_loader(path.read_bytes(), filename, strip_debug=strip_debug)
    if filename == "main.py":
        # Decky requires this source entry point; the implementation stays packed.
        path.write_text(loader, encoding="utf-8")
        return
    code = compile_release(loader.encode(), filename)
    header = importlib.util.MAGIC_NUMBER + struct.pack("<III", 0, 0, 0)
    path.with_suffix(".pyc").write_bytes(header + marshal.dumps(code))
    path.unlink()
