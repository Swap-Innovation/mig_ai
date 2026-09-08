"""Spark job — spark_compliance_snap (Spark · Compliance snapshot)."""
from pyspark.sql import SparkSession

SOURCES = ['fact_risk_score', 'bridge_risk_factor', 'dim_party', 'dim_account', 'ref_reg_rule']
TARGETS = ['snap_compliance_weekly']


def main() -> None:
    spark = SparkSession.builder.appName("spark_compliance_snap").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
