"""Spark job — spark_cust_acct_bridge (Spark · Customer–account bridge)."""
from pyspark.sql import SparkSession

SOURCES = ['dim_party', 'dim_account', 'stg_cust_acct', 'ref_role_type', 'bridge_party_id']
TARGETS = ['bridge_cust_acct', 'mart_acct_360']


def main() -> None:
    spark = SparkSession.builder.appName("spark_cust_acct_bridge").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
