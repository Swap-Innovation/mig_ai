#!/usr/bin/env bash
# Preview the Pages build locally (with /mig_ai basePath).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PAGES_PREVIEW_PORT:-4173}"
BASE="${NEXT_PUBLIC_BASE_PATH:-/mig_ai}"
BASE="${BASE#/}"

"$ROOT/scripts/build-pages.sh"

STAGE="/tmp/mirage-ghpages-preview"
rm -rf "$STAGE"
mkdir -p "$STAGE/$BASE"
cp -R "$ROOT/frontend/out/." "$STAGE/$BASE/"

echo ""
echo "Preview: http://127.0.0.1:${PORT}/${BASE}/"
echo "Demo:    http://127.0.0.1:${PORT}/${BASE}/demo/"
echo "(Ctrl+C to stop)"
cd "$STAGE"
exec python3 -m http.server "$PORT"
