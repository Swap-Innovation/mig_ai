#!/bin/bash
set -e
: "${DB_PASSWORD:?}"
psql -f /etl/sql/mart_cust_360_team_a.sql
psql -f /etl/sql/mart_cust_360_team_b.sql
