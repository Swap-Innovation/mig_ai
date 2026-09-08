"""Spark job — spark_usage_agg (Spark · Usage hourly aggregates)."""
from pyspark.sql import SparkSession

SOURCES = ['fact_usage_evt', 'fact_usage_session', 'dim_account', 'ref_uom', 'bridge_acct_product']
TARGETS = ['agg_usage_hourly']


def main() -> None:
    spark = SparkSession.builder.appName("spark_usage_agg").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
