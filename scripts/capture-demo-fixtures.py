#!/usr/bin/env python3
"""Capture live API responses into frontend/lib/demo/fixtures for GitHub Pages demo mode.

Requires API on http://127.0.0.1:8001 (or DEMO_FIXTURE_API).
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get("DEMO_FIXTURE_API", "http://127.0.0.1:8001")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "lib" / "demo" / "fixtures"


def req(method, path, data=None, token=None, form=False):
    headers = {}
    body = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    r = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=60) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    login = req(
        "POST",
        "/auth/login",
        {"username": "architect@demo.local", "password": "demo"},
        form=True,
    )
    token = login["access_token"]
    projects = req("GET", "/projects", token=token)
    pid = next(
        (
            p["id"]
            for p in projects
            if "party" in f"{p.get('name','')}{p.get('slug','')}".lower()
        ),
        projects[0]["id"],
    )
    fixtures = {
        "GET /auth/demo-users": req("GET", "/auth/demo-users"),
        "GET /health": req("GET", "/health"),
        "GET /me": req("GET", "/me", token=token),
        "GET /projects": projects,
        "GET /estate/samples": req("GET", "/estate/samples", token=token),
        "GET /portfolio/dashboard": req("GET", "/portfolio/dashboard", token=token),
    }
    paths = [
        "mobilisation",
        "udp-hub",
        "inventory",
        "lineage",
        "jobs",
        "agents/runs",
        "estate",
        "discovery/runs",
        "products",
        "mappings",
        "mappings/scorecard",
        "disposition",
        "disposition/benefits",
        "metadata",
        "metadata/completeness",
        "catalogue/tags",
        "build/artifacts",
        "build/summary",
        "reviews",
        "pipeline/runs",
        "cutover",
        "audit",
        "hypercare",
        "plan",
        "discovery/hitl",
    ]
    for suffix in paths:
        path = f"/projects/{pid}/{suffix}"
        try:
            fixtures[f"GET {path}"] = req("GET", path, token=token)
            print("ok", path)
        except Exception as e:
            print("skip", path, e)

    (OUT / "meta.json").write_text(
        json.dumps(
            {
                "project_id": pid,
                "login": {k: login[k] for k in ("email", "name", "role") if k in login},
            },
            indent=2,
        )
        + "\n"
    )
    (OUT / "store.json").write_text(
        json.dumps(fixtures, indent=2, default=str) + "\n"
    )
    print(f"wrote {len(fixtures)} fixtures → {OUT}")


if __name__ == "__main__":
    main()
