#!/usr/bin/env python3
"""Seed Pages demo fixtures with Atlas discovery/profiling from sample-data/demo."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))
from seed_demo_discovery_lib import seed  # noqa: E402


def main() -> None:
    stats = seed(ROOT)
    print(
        "Seeded demo discovery fixtures:",
        f"runs={stats['runs']}",
        f"inventory={stats['inventory']}",
        f"jobs={stats['jobs']}",
        f"edges={stats['edges']}",
        f"steps={stats['steps']}",
        f"store_bytes={stats['bytes']}",
    )


if __name__ == "__main__":
    main()
