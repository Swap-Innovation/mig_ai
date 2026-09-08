#!/bin/bash
set -euo pipefail
# Wrapper — credential refs only, never values
: "${DB_HOST:?}"
: "${DB_USER:?}"
: "${DB_PASSWORD:?}"
: "${LANDING_DIR:=/data/landing}"

INFILE="${LANDING_DIR}/cust_${RUN_DATE}.csv"
psql -h "$DB_HOST" -U "$DB_USER" -f /etl/sql/load_customer_account.sql
if [[ $? -ne 0 ]]; then
  exit 1
fi
