"""Spark job — spark_account_dim (Spark · Account dimension)."""
from pyspark.sql import SparkSession

SOURCES = ['stg_acct_raw', 'stg_acct_status', 'ref_acct_type', 'ref_brand', 'dim_party']
TARGETS = ['dim_account', 'dim_account_status']


def main() -> None:
    spark = SparkSession.builder.appName("spark_account_dim").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
