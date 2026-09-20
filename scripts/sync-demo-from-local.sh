#!/usr/bin/env bash
# Sync local (running API) → Pages demo fixtures.
# Run while backend is up. Does not publish the site.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${DEMO_FIXTURE_API:-http://127.0.0.1:8001}"

echo "Syncing demo fixtures from $API …"
DEMO_FIXTURE_API="$API" python3 "$ROOT/scripts/capture-demo-fixtures.py"

# Keep marketing homepage images in sync with Docs screenshots when present
SRC="$ROOT/Docs/assets/screenshots"
DST="$ROOT/frontend/public/marketing"
mkdir -p "$DST"
for f in \
  02-workspace-home.png \
  02b-suite-gallery.png \
  03-discovery-inventory.png \
  06-build-dags.png
do
  if [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$DST/$f"
    echo "  marketing ← $f"
  fi
done

echo "Sync complete."
echo "Next: review fixtures, then run scripts/publish-pages.sh when ready to go live."
