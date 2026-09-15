#!/usr/bin/env bash
# Start Mirage API on 0.0.0.0:8000 (reachable from localhost and 127.0.0.1).
# Default: stable (no --reload). Pass --reload for local code iteration.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

RELOAD=0
if [[ "${1:-}" == "--reload" ]]; then
  RELOAD=1
fi

if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8000 already in use:"
  lsof -nP -iTCP:8000 -sTCP:LISTEN || true
  if curl -fsS -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    echo "Health OK — leaving existing process running."
    curl -fsS -m 3 http://127.0.0.1:8000/health
    echo
    exit 0
  fi
  echo "Port busy but health failed — refusing to start a second copy."
  exit 1
fi

if [[ -x .venv/bin/uvicorn ]]; then
  UV=.venv/bin/uvicorn
elif [[ -x ../.venv/bin/uvicorn ]]; then
  UV=../.venv/bin/uvicorn
else
  UV=uvicorn
fi

ARGS=(app.main:app --host 0.0.0.0 --port 8000)
if [[ "$RELOAD" == "1" ]]; then
  ARGS+=(--reload)
  echo "Starting API with $UV (reload) on 0.0.0.0:8000 …"
else
  echo "Starting API with $UV (stable) on 0.0.0.0:8000 …"
  echo "Tip: use scripts/start-api.sh --reload while editing backend code."
fi

exec "$UV" "${ARGS[@]}"
