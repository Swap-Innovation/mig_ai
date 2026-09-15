#!/bin/bash
set -euo pipefail
# Spark submit wrapper — crm_account_daily / spark_cust_acct_bridge
: "${SPARK_HOME:?}" "${DWH_WAREHOUSE:?}" "${DWH_BATCH_ID:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name "crm_account_daily.spark_cust_acct_bridge" \
  --conf spark.sql.shuffle.partitions=200 \
  --conf spark.executor.memory=8g \
  "${DAG_DIR}/spark/spark_cust_acct_bridge.py" \
  --sql "${DAG_DIR}/sql/spark_cust_acct_bridge.sql" \
  --batch-id "${DWH_BATCH_ID}" \
  --warehouse "${DWH_WAREHOUSE}"
