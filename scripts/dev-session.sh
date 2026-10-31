#!/usr/bin/env bash
# One privileged session owns setup and cleanup, including after its SSH TTY closes.
set -euo pipefail
if (( EUID != 0 )); then exec sudo -- bash "$0"; fi
GUEST_UID="${SUDO_UID:?Start this script as the SSH user}"
GUEST_HOME="$(getent passwd "$GUEST_UID" | cut -d: -f6)"
DEV="/tmp/creamdeck-dev-$GUEST_UID"
PLUGIN="$GUEST_HOME/homebrew/plugins/CreamDeck"
OVERRIDE="/etc/systemd/system/plugin_loader.service.d/90-creamdeck-remote-dev.conf"
ENTRIES=(dist py_modules main.py package.json plugin.json resources)
test ! -L "$DEV" && [[ $(stat -c %u "$DEV") == "$GUEST_UID" ]]
exec 9>"$DEV/session.lock"
flock -n 9 || { echo '[dev] Another development session is running.' >&2; exit 1; }
test -d "$PLUGIN" || { echo '[dev] Install the ZIP first.' >&2; exit 1; }
linked=0
cleanup() {
    trap - EXIT
    # A second Ctrl+C or lost SSH TTY must not interrupt file restoration.
    trap '' HUP INT TERM
    set +e
    echo '[dev] Restoring the installed plugin…'
    if (( linked )); then
        echo '[dev] Stopping Decky (up to 10 seconds)…'
        timeout --kill-after=1s 10s systemctl stop plugin_loader || echo '[dev] Decky stop is still pending; continuing file restoration.'
        for name in "${ENTRIES[@]}"; do
            target="$PLUGIN/$name"
            backup="$target.dev-backup"
            if [[ -L "$target" && $(readlink "$target") == "$DEV/current/$name" ]]; then
                rm -- "$target"
                if [[ -e "$backup" || -L "$backup" ]]; then mv -- "$backup" "$target"; fi
            elif [[ ! -e "$target" && ! -L "$target" && ( -e "$backup" || -L "$backup" ) ]]; then
                mv -- "$backup" "$target"
            fi
        done
        rm -f -- "$OVERRIDE"
        timeout --kill-after=1s 3s systemctl daemon-reload
        if [[ $(timeout --kill-after=1s 2s systemctl is-system-running 2>/dev/null) != stopping ]]; then
            echo '[dev] Requesting Decky startup…'
            timeout --kill-after=1s 3s systemctl start --no-block plugin_loader
        fi
        echo '[dev] Installed plugin restored; development session closed.'
    fi
}
trap cleanup EXIT
trap 'exit 0' HUP INT TERM

backend_signature() {
    if [[ -d "$DEV/current/py_modules" ]]; then
        find "$DEV/current/py_modules" "$DEV/current/main.py" "$DEV/current/package.json" "$DEV/current/plugin.json" "$DEV/current/resources" -type f ! -name '*.pyc' ! -path '*/__pycache__/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum
    fi
}

reload_after_start() {
    # Decky v3 waits ten seconds before enabling its watcher. A service
    # restart alone can leave Steam running the previous frontend module.
    sleep 11
    touch -h -- "$PLUGIN/main.py"
}

apply_pending() {
    [[ -f "$DEV/pending" ]] || return 0
    mv -- "$DEV/pending" "$DEV/processing"
    IFS= read -r incoming < "$DEV/processing"
    [[ "$incoming" == "$DEV"/.upload.* && -d "$incoming" && ! -L "$incoming" ]] || { echo '[dev] Invalid upload path.' >&2; exit 1; }
    mkdir -p "$DEV/current"
    previous=$(backend_signature)
    # Keep the watched mirror stable and remove deleted runtime files.
    rsync -rc --delete "$incoming/" "$DEV/current/"
    current=$(backend_signature)
    rm -rf -- "$incoming"
    rm -f -- "$DEV/processing"
    if (( linked )) && [[ "$previous" != "$current" ]]; then
        echo '[dev] Backend changed; restarting Decky…'
        systemctl restart plugin_loader
        reload_after_start
    elif (( linked )); then
        # Decky's recursive watcher does not follow our dist symlink, and
        # rsync publishes files by rename. Notify it through the main.py link
        # in the watched plugin directory, after the whole upload is applied.
        # -h changes the link itself rather than its unwatched /tmp target.
        touch -h -- "$PLUGIN/main.py"
        echo '[dev] Frontend synchronized; Decky live reload requested.'
    fi
}

apply_pending
[[ -f "$DEV/current/main.py" ]] || { echo '[dev] Initial source upload is missing.' >&2; exit 1; }
systemctl stop plugin_loader
linked=1
for name in "${ENTRIES[@]}"; do
    target="$PLUGIN/$name"
    backup="$target.dev-backup"
    if [[ -L "$target" && $(readlink "$target") == "$DEV/current/$name" ]]; then continue; fi
    [[ ! -e "$backup" && ! -L "$backup" ]] || { echo "[dev] Existing backup requires recovery: $backup" >&2; exit 1; }
    if [[ -e "$target" || -L "$target" ]]; then mv -- "$target" "$backup"; fi
    ln -s -- "$DEV/current/$name" "$target"
done
mkdir -p -- "$(dirname "$OVERRIDE")"
printf '[Service]\nEnvironment=LIVE_RELOAD=1\n' | tee "$OVERRIDE" >/dev/null
systemctl daemon-reload
systemctl start plugin_loader
reload_after_start
touch "$DEV/heartbeat"
chown "$GUEST_UID" "$DEV/heartbeat"
echo '[dev] Live session ready. Source changes sync automatically; Ctrl+C restores the installed version.'
while sleep 1; do
    if (( $(date +%s) - $(stat -c %Y "$DEV/heartbeat") > 60 )); then
        echo '[dev] Host heartbeat expired.'
        exit 1
    fi
    apply_pending
done
