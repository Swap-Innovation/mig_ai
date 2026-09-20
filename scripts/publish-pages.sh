#!/usr/bin/env bash
# Publish the stabilized static site to the gh-pages branch (GitHub Pages).
# Local main/dev stays untouched — this only updates the published branch.
#
# One-time repo setup:
#   Settings → Pages → Build and deployment → Source: Deploy from a branch
#   Branch: gh-pages / (root)
#
# Usage:
#   ./scripts/publish-pages.sh              # build + force-push gh-pages
#   ./scripts/publish-pages.sh --dry-run    # build only
#   ./scripts/publish-pages.sh --skip-build # push existing frontend/out
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
touch "$OUT/.nojekyll"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run — not pushing. Artifact at $OUT"
  exit 0
fi

SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
MSG="Publish Mirage Pages from ${SHA}"
INDEX="$ROOT/.git/pages-index.$$"

cleanup() { rm -f "$INDEX"; }
trap cleanup EXIT

# Build an orphan commit from frontend/out without checking out gh-pages
# (avoids nested git init + keeps main working tree intact).
export GIT_INDEX_FILE="$INDEX"
git --git-dir="$ROOT/.git" --work-tree="$OUT" add -A
TREE="$(git --git-dir="$ROOT/.git" write-tree)"
COMMIT="$(git --git-dir="$ROOT/.git" commit-tree "$TREE" -m "$MSG")"
unset GIT_INDEX_FILE

# Brace COMMIT so zsh does not treat :r as a modifier
git -C "$ROOT" push origin "${COMMIT}:refs/heads/gh-pages" --force

echo ""
echo "Pushed static site → origin/gh-pages (from $SHA)"
echo "Enable once: Settings → Pages → Deploy from a branch → gh-pages / (root)"
echo "Live: https://swap-innovation.github.io/mig_ai/"
echo "Demo: https://swap-innovation.github.io/mig_ai/demo/"
