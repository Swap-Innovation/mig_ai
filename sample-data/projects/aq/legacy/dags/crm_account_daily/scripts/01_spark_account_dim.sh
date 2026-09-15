#!/bin/bash
set -euo pipefail
# Spark submit wrapper — crm_account_daily / spark_account_dim
: "${SPARK_HOME:?}" "${DWH_WAREHOUSE:?}" "${DWH_BATCH_ID:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name "crm_account_daily.spark_account_dim" \
  --conf spark.sql.shuffle.partitions=200 \
  --conf spark.executor.memory=8g \
  "${DAG_DIR}/spark/spark_account_dim.py" \
  --sql "${DAG_DIR}/sql/spark_account_dim.sql" \
  --batch-id "${DWH_BATCH_ID}" \
  --warehouse "${DWH_WAREHOUSE}"
