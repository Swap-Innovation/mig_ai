"""Apache Airflow → Airflow on Kubernetes
Source: scripts.billing_snap.01_billing_snap.sh
Path: /Users/A104007227/Desktop/Myspace/Prem_to_Cloud_migration/sample-data/projects/party-customer-wave1/legacy/dags/billing_snap/scripts/01_billing_snap.sh
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
    dag_id="mig_01_billing_snap_sh",
    default_args=default_args,
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["mirage", "build", "migrate", "airflow_k8s"],
) as dag:
    start = EmptyOperator(task_id="start")
    land = EmptyOperator(task_id="land_to_warehouse")
    transform = EmptyOperator(task_id="run_transform")
    start >> land >> transform
