"""Spark job — spark_finance_mart (Spark · Finance 360 mart)."""
from pyspark.sql import SparkSession

SOURCES = ['fact_invoice', 'fact_invoice_line', 'fact_payment', 'dim_account', 'agg_usage_hourly']
TARGETS = ['mart_finance_360', 'mart_ar_aging']


def main() -> None:
    spark = SparkSession.builder.appName("spark_finance_mart").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
