"""Spark job — spark_party_rel_mart (Spark · Party relationship mart)."""
from pyspark.sql import SparkSession

SOURCES = ['dim_party', 'dim_party_addr', 'bridge_party_id', 'stg_party_rel', 'ref_rel_type']
TARGETS = ['fact_party_rel', 'mart_party_360']


def main() -> None:
    spark = SparkSession.builder.appName("spark_party_rel_mart").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
