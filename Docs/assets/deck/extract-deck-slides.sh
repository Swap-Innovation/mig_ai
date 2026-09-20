#!/usr/bin/env bash
# Extract full-bleed Executive Briefing slides from the PPTX and write optimized JPEGs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PPTX="$ROOT/Docs/management/Mirage_Suite_Deck.pptx"
OUT="$ROOT/Docs/assets/deck/slides"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$PPTX" ]]; then
  echo "Missing PPTX: $PPTX" >&2
  exit 1
fi

mkdir -p "$OUT"

python3 - "$PPTX" "$TMP" <<'PY'
import re, sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

pptx, tmp = Path(sys.argv[1]), Path(sys.argv[2])
with ZipFile(pptx) as z:
    for i in range(1, 16):
        rel = f"ppt/slides/_rels/slide{i}.xml.rels"
        root = ET.fromstring(z.read(rel))
        media = None
        for el in root:
            t = el.attrib.get("Target", "")
            if "media/" in t or t.lower().endswith((".png", ".jpg", ".jpeg")):
                media = ("ppt/" + t[3:]) if t.startswith("../") else t
                break
        if not media:
            raise SystemExit(f"No media for slide {i}")
        dest = tmp / f"slide-{i:02d}.png"
        dest.write_bytes(z.read(media))
        print(f"extracted slide {i} <- {media}")
PY

for i in $(seq -w 1 15); do
  src="$TMP/slide-$i.png"
  dest="$OUT/slide-$i.jpg"
  # Resize to max width 1920, then JPEG ~80
  sips -Z 1920 "$src" --out "$TMP/slide-$i-resized.png" >/dev/null
  sips -s format jpeg -s formatOptions 80 "$TMP/slide-$i-resized.png" --out "$dest" >/dev/null
  bytes=$(wc -c < "$dest" | tr -d ' ')
  shasum=$(shasum -a 256 "$dest" | awk '{print $1}')
  echo "wrote $dest ($bytes bytes) sha256=$shasum"
done

echo "Done. Slides in $OUT"
du -sh "$OUT"
