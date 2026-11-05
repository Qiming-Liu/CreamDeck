# VM live development

Install the CreamDeck ZIP through Decky once, enable SSH in the VM, and configure
key login from the host. The guest needs `bash`, `rsync`, `sudo`, `flock`, `timeout`, and Decky.
The host needs Node 20.12 or later and installed frontend dependencies. On Windows,
install Git for Windows: the watcher finds its SSH and tar executables automatically.

Copy `.env.example` to `.env` and configure:

- `DECKY_HOST`: SSH host alias or `user@host`.
- `DECKY_PORT`: SSH port (defaults to 22).
- `DECKY_SSH_IDENTITY`: optional private key path.
- `DECKY_SSH_KNOWN_HOSTS`: optional pinned known-hosts file.

Relative paths are resolved from the repository root; `~/` is supported. Process
environment variables override `.env`. Keep keys in ignored `.decky-dev/` or an
existing private location. Never store passwords in configuration files. Neither
`.env` nor `.decky-dev/` is synchronized or packaged.

```bash
pnpm install
pnpm dev
```

The Node watcher builds the frontend locally and uploads `dist`, `main.py`,
`py_modules`, `resources`, `package.json`, and `plugin.json` over SSH. CreamDeck
needs no Python dependency vendoring. Its bundled unlocker
DLLs are included in the mirror so resource lookups still work through symlinks.

A single remote SSH TTY session asks for sudo if needed, backs up the installed
runtime entries, and links them to `/tmp/creamdeck-dev-<uid>/current`. This keeps
the development mirror off the VM's system partition. The session enables
`LIVE_RELOAD` through its own systemd override and restarts Decky.

Edits are debounced for one second, rebuilt, and synchronized automatically.
Deleted runtime files are removed from the mirror; unchanged files keep their
timestamps. Frontend changes request Decky's native plugin reload by touching
the installed `main.py` symlink, since its recursive watcher does not follow
development symlinks. Backend, metadata, or resource changes restart Decky.
Startup and restarts wait eleven seconds for Decky's watcher before requesting
the initial reload. An already-mounted Steam page may need reopening.

Restart `pnpm dev` after editing either development script. Ctrl+C or SSH
disconnection restores the installed runtime and removes this session's systemd
override. A host heartbeat also ends abandoned sessions. Only one CreamDeck
development session can own the VM plugin at a time. Settings and logs remain
in their normal Decky locations throughout development.

The host owns terminal input so Ctrl+C works even when the guest is unresponsive.
The first Ctrl+C stops builds/uploads and allows up to 25 seconds for remote
restoration; a second Ctrl+C forces local SSH exit. Guest cleanup ignores further
interrupts while restoring files, limits its service-control waits, and requests
Decky startup without waiting for it to finish. A lost SSH connection is normally
detected after roughly nine seconds of unanswered keepalives. The host then
terminates remaining children and restores terminal mode. Exit `pnpm dev` before
powering off the VM: a powered-off guest cannot finish restoring its plugin files.
If the session ends without cleanup anyway (forced power-off, killed process),
the `/tmp` mirror disappears and the installed entries become dangling links.
To cover this, the session registers `/var/lib/creamdeck-dev/recover-<uid>.sh` as
an `ExecStartPre` in its Decky drop-in. When Decky next starts without a live
session holding the lock, the script restores the `.dev-backup` entries and
removes itself and the drop-in.

Verification:

```bash
pnpm exec tsc --noEmit -p .
pnpm run test:tooling
python -m unittest discover -s tests -v
```

## Protected release packaging

Release packaging requires CPython 3.14, matching the target Decky runtime.
Run `pnpm package` with that Python on PATH; normal builds and `pnpm dev`
keep readable development files. The packager stages an isolated copy, obfuscates
JavaScript without property/global renaming, and excludes source maps.
Python implementations ship as packed bytecode; Decky's required `main.py`
contains only a loader. Packing is reversible and is not encryption.

Project Python docstrings and line tables are removed recursively, and code
filenames are relative to the plugin root. Assertions and `__debug__` behavior
are preserved. Vendored third-party Python retains its documentation and line
metadata for compatibility. Required runtime errors/logging remain available,
but release tracebacks have reduced line detail. Prebuilt native dependencies
are copied unchanged; this process does not strip or rebuild their symbols.
Keep credentials outside distributable code; packing cannot protect secrets.
