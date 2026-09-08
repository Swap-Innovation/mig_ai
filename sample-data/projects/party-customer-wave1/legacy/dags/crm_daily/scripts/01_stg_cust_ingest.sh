#!/bin/bash
set -euo pipefail
# DAG: crm_daily · task: stg_cust_ingest
: "${DB_HOST:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
: "${LANDING_DIR:=/data/landing}"
INFILE="${LANDING_DIR}/cust_${RUN_DATE}.csv"
psql -h "$DB_HOST" -U "$DB_USER" -c "\\copy legacy.stg_cust_daily FROM '${INFILE}' CSV HEADER"
