#!/usr/bin/env bash
# pnpm supplies Node; Git Bash supplies ssh/tar on Windows.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export MSYS_NO_PATHCONV=1
exec node scripts/dev.mjs
