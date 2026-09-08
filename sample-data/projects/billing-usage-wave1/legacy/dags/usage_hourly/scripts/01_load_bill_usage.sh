#!/bin/bash
set -euo pipefail
: "${DB_HOST:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
psql -h "$DB_HOST" -U "$DB_USER" -f "${SCRIPT_DIR}/../sql/load_bill_usage.sql"
