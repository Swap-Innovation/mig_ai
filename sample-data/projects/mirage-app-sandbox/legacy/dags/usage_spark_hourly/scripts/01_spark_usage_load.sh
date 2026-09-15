#!/bin/bash
set -euo pipefail
# Spark submit wrapper — usage_spark_hourly / spark_usage_load
: "${SPARK_HOME:?}" "${DWH_WAREHOUSE:?}" "${DWH_BATCH_ID:?}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name "usage_spark_hourly.spark_usage_load" \
  --conf spark.sql.shuffle.partitions=200 \
  --conf spark.executor.memory=8g \
  "${DAG_DIR}/spark/spark_usage_load.py" \
  --sql "${DAG_DIR}/sql/spark_usage_load.sql" \
  --batch-id "${DWH_BATCH_ID}" \
  --warehouse "${DWH_WAREHOUSE}"
