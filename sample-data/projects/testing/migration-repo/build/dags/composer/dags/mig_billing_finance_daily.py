"""Apache Airflow → Cloud Composer
Source: dag.billing_finance_daily
Path: /Users/A104007227/Desktop/Myspace/Prem_to_Cloud_migration/sample-data/projects/dwh-m/legacy/dags/billing_finance_daily/dag.json
Disposition: migrate
"""
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.empty import EmptyOperator

default_args = {
    "owner": "migration",
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}

with DAG(
    dag_id="mig_billing_finance_daily",
    default_args=default_args,
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["lumina", "build", "migrate", "composer"],
) as dag:
    start = EmptyOperator(task_id="start")
    land = EmptyOperator(task_id="land_to_warehouse")
    transform = EmptyOperator(task_id="run_transform")
    start >> land >> transform
