#!/usr/bin/env bash
# Build the static GitHub Pages site (demo mode).
# Isolates from frontend/.env.local so local API config never bleeds into the publish build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
ENV_FILE="$FRONTEND/.env.pages"
LOCAL_ENV="$FRONTEND/.env.local"
LOCAL_BAK=""

cleanup() {
  if [[ -n "$LOCAL_BAK" && -f "$LOCAL_BAK" ]]; then
    mv "$LOCAL_BAK" "$LOCAL_ENV"
  fi
}
trap cleanup EXIT

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

cd "$FRONTEND"

# Park local env so Next cannot merge it into the Pages build
if [[ -f "$LOCAL_ENV" ]]; then
  LOCAL_BAK="$LOCAL_ENV.__pages_bak"
  mv "$LOCAL_ENV" "$LOCAL_BAK"
fi

rm -rf .next out

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Building Pages site with:"
echo "  DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE:-}"
echo "  STATIC_EXPORT=${NEXT_PUBLIC_STATIC_EXPORT:-}"
echo "  BASE_PATH=${NEXT_PUBLIC_BASE_PATH:-}"

npx next build
touch out/.nojekyll
echo "OK → $FRONTEND/out"
