"""Spark job — spark_acct_product (Spark · Account product holdings)."""
from pyspark.sql import SparkSession

SOURCES = ['dim_account', 'stg_prod_hold', 'ref_product', 'ref_prod_family']
TARGETS = ['bridge_acct_product']


def main() -> None:
    spark = SparkSession.builder.appName("spark_acct_product").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
