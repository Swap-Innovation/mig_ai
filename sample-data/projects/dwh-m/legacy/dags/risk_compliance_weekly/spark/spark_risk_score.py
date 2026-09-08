"""Spark job — spark_risk_score (Spark · Risk score factors)."""
from pyspark.sql import SparkSession

SOURCES = ['mart_acct_360', 'mart_finance_360', 'agg_usage_hourly', 'stg_risk_signal', 'ref_risk_band']
TARGETS = ['fact_risk_score', 'bridge_risk_factor']


def main() -> None:
    spark = SparkSession.builder.appName("spark_risk_score").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
