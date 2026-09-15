"""Spark job — spark_usage_load (Spark · Load usage events)."""
from pyspark.sql import SparkSession

SOURCES = ['stg_usage_cdr', 'stg_usage_session', 'ref_uom', 'ref_network_cell', 'dim_account']
TARGETS = ['fact_usage_evt', 'fact_usage_session']


def main() -> None:
    spark = SparkSession.builder.appName("spark_usage_load").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
