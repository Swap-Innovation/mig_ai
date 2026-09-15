"""Spark job — spark_invoice_fact (Spark · Invoice facts)."""
from pyspark.sql import SparkSession

SOURCES = ['stg_invoice_hdr', 'stg_invoice_line', 'dim_account', 'ref_charge_type', 'ref_currency']
TARGETS = ['fact_invoice', 'fact_invoice_line']


def main() -> None:
    spark = SparkSession.builder.appName("spark_invoice_fact").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
