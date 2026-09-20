#!/usr/bin/env bash
# Publish the stabilized static site to the gh-pages branch (GitHub Pages).
# Local main/dev stays untouched — this only updates the published branch.
#
# One-time repo setup:
#   Settings → Pages → Build and deployment → Source: Deploy from a branch
#   Branch: gh-pages / (root)
#
# Usage:
#   ./scripts/publish-pages.sh           # build + force-push gh-pages
#   ./scripts/publish-pages.sh --dry-run # build only
#   ./scripts/publish-pages.sh --skip-build  # push existing frontend/out
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  "$ROOT/scripts/build-pages.sh"
fi

OUT="$ROOT/frontend/out"
if [[ ! -f "$OUT/index.html" ]]; then
  echo "Build missing $OUT/index.html" >&2
  exit 1
fi
if [[ ! -f "$OUT/.nojekyll" ]]; then
  touch "$OUT/.nojekyll"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run — not pushing. Artifact at $OUT"
  exit 0
fi

REMOTE_URL="$(git -C "$ROOT" remote get-url origin)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
MSG="Publish Mirage Pages from ${SHA}"
STAGE="$ROOT/.pages-publish"

rm -rf "$STAGE"
mkdir -p "$STAGE"

# Must be its own repo — never fall back to the parent .git
git -C "$STAGE" init -b gh-pages
if [[ ! -d "$STAGE/.git" ]]; then
  echo "Failed to create isolated git repo in $STAGE" >&2
  exit 1
fi

# Confirm we are not using the parent repository
PARENT_GIT="$(git -C "$ROOT" rev-parse --git-dir)"
STAGE_GIT="$(git -C "$STAGE" rev-parse --git-dir)"
if [[ "$(cd "$STAGE" && pwd)/.git" != "$(cd "$STAGE_GIT" 2>/dev/null && pwd)" && "$STAGE_GIT" != ".git" ]]; then
  # Accept STAGE/.git as relative
  :
fi
ABS_STAGE_GIT="$(cd "$STAGE" && cd "$(git rev-parse --git-dir)" && pwd)"
ABS_PARENT_GIT="$(cd "$ROOT" && cd "$(git rev-parse --git-dir)" && pwd)"
if [[ "$ABS_STAGE_GIT" == "$ABS_PARENT_GIT" ]]; then
  echo "Refusing to publish: stage git dir resolved to parent repo" >&2
  rm -rf "$STAGE"
  exit 1
fi

cp -R "$OUT"/. "$STAGE"/
git -C "$STAGE" add -A
git -C "$STAGE" -c user.email="pages-bot@users.noreply.github.com" \
  -c user.name="Mirage Pages Bot" \
  commit -m "$MSG"
git -C "$STAGE" remote add origin "$REMOTE_URL"
git -C "$STAGE" push origin HEAD:gh-pages --force

rm -rf "$STAGE"
echo ""
echo "Pushed static site → origin/gh-pages (from $SHA)"
echo "Enable once: Settings → Pages → Deploy from a branch → gh-pages / (root)"
echo "Live: https://swap-innovation.github.io/mig_ai/"
echo "Demo: https://swap-innovation.github.io/mig_ai/demo/"
