#!/usr/bin/env bash
# Smoke-test the control-plane journey against a running API on :8000
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"

login() {
  curl -s -X POST "$API/auth/login" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "username=$1&password=demo" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])'
}

ENG=$(login engineer@demo.local)
ARCH=$(login architect@demo.local)
BOARD=$(login board@demo.local)
OWNER=$(login owner@demo.local)
PID=$(curl -s -H "Authorization: Bearer $ENG" "$API/projects" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')

auth() { curl -s -H "Authorization: Bearer $1" "${@:2}"; }

wait_discovery() {
  local token="$1" run_id="$2"
  for _ in $(seq 1 60); do
    local st
    st=$(auth "$token" "$API/projects/$PID/discovery/runs/$run_id" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
    if [[ "$st" == "completed" || "$st" == "failed" ]]; then
      [[ "$st" == "completed" ]] || { echo "Discovery failed"; exit 1; }
      return 0
    fi
    sleep 0.4
  done
  echo "Discovery timed out"; exit 1
}

wait_agent() {
  local token="$1" run_id="$2"
  for _ in $(seq 1 40); do
    local st
    st=$(auth "$token" "$API/projects/$PID/agents/runs/$run_id" | python3 -c 'import sys,json; print(json.load(sys.stdin)["status"])')
    if [[ "$st" == "completed" || "$st" == "failed" ]]; then
      [[ "$st" == "completed" ]] || { echo "Agent run $run_id failed"; exit 1; }
      return 0
    fi
    sleep 0.4
  done
  echo "Agent timed out"; exit 1
}

DR=$(auth "$ENG" -X POST "$API/projects/$PID/discovery/run")
DRID=$(echo "$DR" | python3 -c 'import sys,json; print(json.load(sys.stdin)["run_id"])')
wait_discovery "$ENG" "$DRID"
auth "$ARCH" -X POST "$API/projects/$PID/inventory/signoff" >/dev/null
auth "$ENG" -X POST "$API/projects/$PID/disposition/compute" >/dev/null
auth "$BOARD" -X POST "$API/projects/$PID/disposition/approve" >/dev/null
auth "$ENG" -X POST "$API/projects/$PID/mappings/generate" >/dev/null
auth "$ARCH" -X POST "$API/projects/$PID/mappings/approve" >/dev/null
auth "$ENG" -X POST "$API/projects/$PID/metadata/seed" >/dev/null
auth "$OWNER" -X POST "$API/projects/$PID/metadata/complete" >/dev/null
AR=$(auth "$ENG" -X POST "$API/projects/$PID/agents/data_product_identification/runs" \
  -H 'Content-Type: application/json' -d '{"payload":{}}')
ARID=$(echo "$AR" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
wait_agent "$ENG" "$ARID"
RID=$(auth "$OWNER" "$API/projects/$PID/reviews" | python3 -c 'import sys,json; rs=json.load(sys.stdin); print(next(r["id"] for r in rs if r["status"]=="pending" and r["review_type"]=="data_product_identification"))')
auth "$OWNER" -X POST "$API/projects/$PID/reviews/$RID/decide" \
  -H 'Content-Type: application/json' -d '{"decision":"approve","notes":"demo"}' >/dev/null
PRODID=$(auth "$ENG" "$API/projects/$PID/products" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')
auth "$ENG" -X POST "$API/projects/$PID/products/$PRODID/pipeline/run" >/dev/null
auth "$ENG" -X POST "$API/projects/$PID/products/$PRODID/reconcile" | tee /tmp/reconcile.json
echo
echo "Demo smoke test complete for project $PID"
