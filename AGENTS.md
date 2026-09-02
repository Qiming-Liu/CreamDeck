# AGENTS.md

Notes for an AI coding agent working in this repo, distilled from a session that
found and fixed several real bugs by testing live on a Steam Deck. See
[README.md](README.md) for what the plugin does and how a user uses it — this
file is about *working on* the code, not using it.

## Commands

```bash
pnpm install
pnpm run build              # rollup build → dist/index.js
node_modules/.bin/tsc --noEmit -p .   # frontend typecheck (no emit)
python -m unittest discover -s tests -v   # backend unit tests (no decky-loader runtime needed)
pnpm dev                    # live on-device testing, see below
```

Always run the typecheck and the unit tests after a change, even a small one —
both are fast and this repo has bitten itself on type errors and dead-import
regressions that a quick source read didn't catch.

## Architecture in one paragraph

`main.py` is the Decky Loader `Plugin` class (the RPC surface the frontend
calls via `@decky/api`'s `callable()`). It delegates to `py_modules/*.py`, one
module per unlocker (`smokeapi.py`, `creamapi.py`, `screamapi.py`,
`uplay_r1.py`, `uplay_r2.py`, `koaloader.py`) plus shared pieces:
`unlocker_detection.py` (marker-file detection, dispatch, `force_cleanup`),
`steamcmd.py`/`steamcmd_webapi.py`/`steam_store_api.py` (three-tier DLC-info
lookup), `install_state.py` (the JSON source of truth for what's installed —
see below), `action_log.py` (persistent action logging), `steam_library.py`,
`vdf_lite.py`, `bitness.py`, `resource_files.py`. The frontend is a single
page, `src/views/CreamDeckPage.tsx`, registered as a full-page route
(`/creamdeck/<appid>`) by `src/index.tsx`; `src/utils/backend.ts` wraps the
`callable()` RPC bindings.

`install_state.json` (`~/homebrew/settings/CreamDeck/install_state.json`) is
the source of truth for "what's installed and which DLC are enabled" — written
right after install/uninstall. Don't reintroduce re-parsing each unlocker's own
config file format (`SmokeAPI.config.json`, `cream_api.ini`, ...) to answer
that question; `get_game_page` used to work that way and it was fragile (see
Gotchas). The one thing still read live off disk is *whether a marker file
exists at all* (`unlocker_detection.describe`'s `detected` flag, and
`currently_installed` for the integrity cross-check) — that's inherently about
the game's files, not CreamDeck's own actions.

## On-device testing

This plugin only makes sense tested live in Big Picture / Game Mode — there is
no meaningful way to exercise the actual install flow otherwise. `scripts/dev.sh`
(`pnpm dev`) symlinks `dist/`, `py_modules/`, and `main.py` from the installed
plugin location back into this repo and watches for changes:

- **Frontend** (`dist/index.js`): relies on Decky's `LIVE_RELOAD` (a systemd
  env var the script sets). This does *not* reliably hot-swap an
  already-mounted page's JS — see Gotchas.
- **Backend** (`main.py`/`py_modules/*.py`): does **not** hot-reload at all
  here, despite what an earlier version of this script's own comment claimed.
  `dev.sh` restarts `plugin_loader` automatically, debounced 10s after the
  last backend edit settles (so a burst of saves triggers one restart, not
  one per save).

`dev.sh` needs `sudo` once at startup (kept alive in the background for the
session) since `~/homebrew/plugins/CreamDeck/` is root-owned. If you (the
agent) don't have a way to enter the user's sudo password non-interactively,
you can't restart `plugin_loader` yourself — ask the user to run
`sudo systemctl restart plugin_loader`, or better, tell them to have `pnpm dev`
running so it happens automatically.

### Verifying a UI change without asking the user for a screenshot every time

Decky's Big Picture UI (SteamOS's `steamwebhelper`) exposes a Chrome DevTools
Protocol endpoint on `127.0.0.1:8080`. This was the single most useful
technique this session — use it instead of guessing whether a frontend change
actually worked:

```bash
curl -s http://127.0.0.1:8080/json/list   # find the target — look for "Steam 大屏幕模式" / "Steam Big Picture Mode"
```

Then, with Node (this repo's `nvm` node has a global `WebSocket`):

```js
const ws = new WebSocket('ws://localhost:8080/devtools/page/<id>');
ws.onopen = () => ws.send(JSON.stringify({id:1, method:'Runtime.evaluate',
  params:{expression: 'document.body.innerText', returnByValue:true}}));
ws.onmessage = (e) => console.log(e.data);
```

`Runtime.evaluate` can inspect any DOM state (measure element rects to check
layout, read computed styles, grep for text) and `Page.captureScreenshot`
(base64 PNG in the result) gives an actual screenshot without waiting on the
user. The target list changes across Big Picture restarts — always re-fetch
`/json/list` rather than reusing a cached target id.

One real trap: **a route that was already open before your change landed
keeps running the old JS** — Decky doesn't re-fetch/re-execute an
already-loaded plugin script just because the file on disk changed or you
navigated within the SPA. If a DOM check still shows old behavior after a
rebuild, first rule out "page just needs a fresh mount" (back out and back in,
or a real `plugin_loader` restart) before assuming the fix didn't work.

## Gotchas worth not re-discovering

- **Full-page routes render underneath Big Picture's fixed status bar**
  (clock/battery/etc, `position: absolute`, `z-index: 6000`, ~40px tall) —
  nothing in the outer chrome reserves space for it. `@decky/ui`'s
  `SidebarNavigation` does *not* fix this on its own (its title's vertical
  offset is incidental to its multi-tab sidebar's height, not a deliberate
  safe-area); the actual fix is a plain top-padding offset
  (`PAGE_TOP_OFFSET` in `CreamDeckPage.tsx`, currently `56px`) on the page's
  own content. If Big Picture's chrome ever changes height, that constant is
  where to adjust.
- **SmokeAPI and CreamAPI back up the original DLL under the exact same
  filename** (`steam_api(64)_o.dll`) — don't use bare backup-file presence to
  tell them apart; key off each one's own config file
  (`SmokeAPI.config.json` / `cream_api.ini`) instead. `screamapi.py`/
  `uplay_r1.py`/`uplay_r2.py`'s `is_installed()` still use the old
  backup-file check and have the same latent aliasing bug — not yet fixed
  since it hasn't caused a reported issue like SmokeAPI/CreamAPI did.
- **DLC unlockers only spoof the Steamworks ownership check — they never
  download DLC content.** Enabling a DLC whose files were never downloaded
  makes the game think it owns content it can't load, which can crash on
  launch with no useful error. Some games (Risk of Rain 2 confirmed) bundle
  all DLC content in the base install regardless of ownership specifically
  for mixed-ownership multiplayer — for those, `Verify integrity of game
  files` in Steam is enough. Don't assume this generalizes to every game.
- **Steam's "Verify integrity" always undoes a direct-replace install**
  (restores the original DLL) but never removes an unlocker's own leftover
  files, since it doesn't recognize them as part of the game — this is
  exactly what `force_cleanup`/the integrity-mismatch self-heal in
  `get_game_page` exist to handle. It doesn't undo **proxy mode** installs
  (the real DLL is never touched), which is why proxy mode is recommended
  over direct-replace for anything that needs to survive game updates.
- **Proxy mode needs a Proton-specific launch option.** Wine ships its own
  builtin `winmm.dll`/`version.dll`/`winhttp.dll` and prefers those over the
  one dropped into the game folder by default — the unlocker's hook silently
  never runs otherwise, with zero error (game launches fine, DLC stays
  locked). Needs `WINEDLLOVERRIDES="<dll>=n,b" %command%` in the game's Steam
  launch options; `src/utils/wineDllOverride.ts` sets this automatically via
  `SteamClient.Apps.{Get,Set}AppLaunchOptions` (a real, typed Decky/Steam
  Client API — `declare global { var SteamClient }` from `@decky/ui`).
- **`api.steamcmd.net` (the public SteamCMD web API mirror) often returns
  only the `common` section** for a game (no `depots`/`extended`), flagged
  `_missing_token`/`public_only` — this reads as a "successful" response
  (it has the game's name) so the code doesn't fall back to the local
  SteamCMD binary. `steamcmd.get_app_info` now falls back to
  `steam_store_api.py` (Steam's public store `appdetails` API) for just the
  DLC id list in that case — much lighter than shelling out to the actual
  SteamCMD binary, which was the only other fallback.

## Commit style

Look at `git log` before writing a commit message — this repo uses a
concise imperative title (~70 char) followed by a blank line and one or more
prose paragraphs explaining *why*, not a changelog-style bullet list of what
changed. Split unrelated changes into separate commits; a session that touches
five different concerns should usually be five commits, each leaving the repo
in a working, tested state on its own (backend tests pass, frontend
typechecks) — not necessarily replaying the literal edit history, but grouped
so `git bisect` and code review both make sense.
