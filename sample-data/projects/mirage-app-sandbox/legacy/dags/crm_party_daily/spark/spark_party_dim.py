"""Spark job — spark_party_dim (Spark · Build party dimensions)."""
from pyspark.sql import SparkSession

SOURCES = ['stg_party_raw', 'stg_party_addr', 'stg_party_contact', 'ref_country', 'ref_party_type']
TARGETS = ['dim_party', 'dim_party_addr']


def main() -> None:
    spark = SparkSession.builder.appName("spark_party_dim").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
