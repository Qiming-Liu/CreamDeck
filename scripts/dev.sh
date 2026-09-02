#!/usr/bin/env bash
# Live-dev loop for this Deck acting as its own test device:
#   1. Turns on Decky Loader's LIVE_RELOAD (disabled by default) via a systemd
#      drop-in, so frontend rebuilds (dist/index.js) are picked up via Decky's
#      own hot-reload — no restart, no debounce, just `rollup -c -w` writing
#      straight into the live install.
#   2. Swaps the installed plugin's dist/, py_modules/, and main.py for
#      symlinks back into this repo, so both frontend and backend edits are
#      visible without a manual copy.
#   3. Runs the rollup watcher in the foreground, and a background poller that
#      restarts plugin_loader when main.py/py_modules changes — unlike the
#      frontend, the backend does not hot-reload on its own here. This is
#      debounced (BACKEND_DEBOUNCE_SECONDS, default 10s of no further backend
#      changes) rather than restarting on every single save, since a burst of
#      edits saved seconds apart would otherwise mean a jarring restart after
#      each one.
#   4. On exit (Ctrl+C, normal exit, or the terminal closing/SIGHUP) restores
#      the original dist/, py_modules/, and main.py, stops the background
#      poller, and turns LIVE_RELOAD back off, so the Deck is left exactly as
#      a normal plugin install afterwards.
#
# Needs sudo: the plugin folder under ~/homebrew/plugins is root:root, so
# swapping its dist/py_modules/main.py entries (and the systemd override, and
# every backend restart) requires root even though those entries' *contents*
# are deck-owned. sudo is asked for once up front and kept alive in the
# background for the rest of the session, rather than once per restart.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${HOME}/homebrew/plugins/CreamDeck"
OVERRIDE_DIR="/etc/systemd/system/plugin_loader.service.d"
OVERRIDE_FILE="${OVERRIDE_DIR}/creamdeck-dev-live-reload.conf"
LINKED_ENTRIES=(dist py_modules main.py)
WATCH_POLL_SECONDS=1
BACKEND_DEBOUNCE_SECONDS=10

if [[ ! -d "$PLUGIN_DIR" ]]; then
    echo "error: $PLUGIN_DIR doesn't exist — install CreamDeck at least once before running dev mode." >&2
    exit 1
fi

_cleaned_up=0
_watch_pid=""
_sudo_keepalive_pid=""

cleanup() {
    if [[ "$_cleaned_up" -eq 1 ]]; then return; fi
    _cleaned_up=1
    echo
    echo "[dev] restoring plugin install and LIVE_RELOAD..."

    [[ -n "$_watch_pid" ]] && kill "$_watch_pid" 2>/dev/null
    [[ -n "$_sudo_keepalive_pid" ]] && kill "$_sudo_keepalive_pid" 2>/dev/null

    for name in "${LINKED_ENTRIES[@]}"; do
        target="${PLUGIN_DIR}/${name}"
        backup="${PLUGIN_DIR}/${name}.dev-backup"
        if [[ -L "$target" ]]; then
            sudo rm -f "$target"
            if [[ -e "$backup" ]]; then
                sudo mv "$backup" "$target"
            fi
        fi
    done

    if [[ -f "$OVERRIDE_FILE" ]]; then
        sudo rm -f "$OVERRIDE_FILE"
        sudo systemctl daemon-reload
        sudo systemctl restart plugin_loader
    fi

    echo "[dev] done."
}

trap cleanup EXIT INT TERM HUP

echo "[dev] enabling LIVE_RELOAD..."
sudo mkdir -p "$OVERRIDE_DIR"
printf '[Service]\nEnvironment=LIVE_RELOAD=1\n' | sudo tee "$OVERRIDE_FILE" > /dev/null
sudo systemctl daemon-reload
sudo systemctl restart plugin_loader

echo "[dev] keeping sudo alive for the rest of this session (backend restarts need it)..."
( while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done ) &
_sudo_keepalive_pid=$!

echo "[dev] linking dist/, py_modules/, and main.py into $PLUGIN_DIR..."
for name in "${LINKED_ENTRIES[@]}"; do
    target="${PLUGIN_DIR}/${name}"
    backup="${PLUGIN_DIR}/${name}.dev-backup"
    if [[ -L "$target" ]]; then
        continue # already linked from a previous dev session that didn't clean up
    fi
    sudo mv "$target" "$backup"
    sudo ln -s "${REPO_DIR}/${name}" "$target"
done

backend_signature() {
    find "${REPO_DIR}/py_modules" "${REPO_DIR}/main.py" -type f -name '*.py' -printf '%T@\n' 2>/dev/null | sort -n | tail -1
}

watch_backend() {
    # Debounced: a change starts (or resets) a BACKEND_DEBOUNCE_SECONDS quiet
    # timer, and the restart only fires once that timer elapses with no further
    # change — so a burst of saves a few seconds apart triggers exactly one
    # restart, not one per save. Seeded with the current signature before the
    # loop starts so nothing fires just because the poller itself started.
    local settled_sig pending_sig="" pending_since=0 now
    settled_sig=$(backend_signature)
    while true; do
        sleep "$WATCH_POLL_SECONDS"
        cur=$(backend_signature)
        [[ -z "$cur" || "$cur" == "$settled_sig" ]] && continue

        if [[ "$cur" != "$pending_sig" ]]; then
            pending_sig="$cur"
            pending_since=$(date +%s)
            continue
        fi

        now=$(date +%s)
        if (( now - pending_since >= BACKEND_DEBOUNCE_SECONDS )); then
            echo "[dev] backend change settled, restarting plugin_loader..."
            sudo systemctl restart plugin_loader
            settled_sig="$cur"
        fi
    done
}

watch_backend &
_watch_pid=$!

echo "[dev] watching for changes — frontend hot-reloads via LIVE_RELOAD, backend restarts plugin_loader ${BACKEND_DEBOUNCE_SECONDS}s after edits settle."
echo "[dev] Ctrl+C to stop and restore the normal install."
pnpm exec rollup -c -w
