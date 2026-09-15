"""Apache Airflow → Cloud Composer
Source: scripts.crm_daily.03_mart_cust_360.sh
Path: /Users/A104007227/Desktop/Myspace/Prem_to_Cloud_migration/sample-data/projects/party-customer-wave1/legacy/dags/crm_daily/scripts/03_mart_cust_360.sh
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
    dag_id="mig_03_mart_cust_360_sh",
    default_args=default_args,
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["mirage", "build", "migrate", "composer"],
) as dag:
    start = EmptyOperator(task_id="start")
    land = EmptyOperator(task_id="land_to_warehouse")
    transform = EmptyOperator(task_id="run_transform")
    start >> land >> transform
