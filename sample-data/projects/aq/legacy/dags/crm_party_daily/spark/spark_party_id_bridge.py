"""Spark job — spark_party_id_bridge (Spark · Party identity bridge)."""
from pyspark.sql import SparkSession

SOURCES = ['dim_party', 'stg_party_id_map', 'ref_id_type', 'stg_party_hist', 'audit_batch']
TARGETS = ['bridge_party_id']


def main() -> None:
    spark = SparkSession.builder.appName("spark_party_id_bridge").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
