#!/bin/bash
set -euo pipefail
# DAG: crm_daily · task: mart_cust_360
: "${DB_HOST:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
psql -h "$DB_HOST" -U "$DB_USER" -f "${SCRIPT_DIR}/../sql/mart_cust_360_team_a.sql"
psql -h "$DB_HOST" -U "$DB_USER" -f "${SCRIPT_DIR}/../sql/mart_cust_360_team_b.sql"
