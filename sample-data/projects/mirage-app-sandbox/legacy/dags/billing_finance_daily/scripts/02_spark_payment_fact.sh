#!/bin/bash
set -euo pipefail
# Spark submit wrapper — billing_finance_daily / spark_payment_fact
: "${SPARK_HOME:?}" "${DWH_WAREHOUSE:?}" "${DWH_BATCH_ID:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name "billing_finance_daily.spark_payment_fact" \
  --conf spark.sql.shuffle.partitions=200 \
  --conf spark.executor.memory=8g \
  "${DAG_DIR}/spark/spark_payment_fact.py" \
  --sql "${DAG_DIR}/sql/spark_payment_fact.sql" \
  --batch-id "${DWH_BATCH_ID}" \
  --warehouse "${DWH_WAREHOUSE}"
