"""Spark job — spark_payment_fact (Spark · Payment facts)."""
from pyspark.sql import SparkSession

SOURCES = ['stg_payment', 'fact_invoice', 'dim_account', 'ref_pay_method', 'ref_currency']
TARGETS = ['fact_payment']


def main() -> None:
    spark = SparkSession.builder.appName("spark_payment_fact").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
