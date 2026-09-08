# Sample projects catalogue

Each folder under `sample-data/projects/` is a self-contained demo estate. The **legacy/**
tree is shaped like an **on-prem data warehouse git repo** that Migration AI discovers:

```
sample-data/projects/<slug>/
  project.json
  legacy/                         ← bind / git-clone root
    repo.json                     ← remote, warehouse engine, layout
    dags/
      <dag_id>/
        dag.json                  ← schedule, tasks, script/sql refs
        scripts/*.sh              ← Control-M / Airflow-style wrappers
        sql/*.sql                 ← table loads & marts
    catalog/tables.json
    usage/query_log.csv
  migration-repo/                 ← cloud-side standards & products
```

Discovery order: **Git repo → DAGs → scripts → SQL → tables → consumers**.

## Bundled estates

| Slug | Git-shaped remote (demo) | DAGs |
|------|--------------------------|------|
| `party-customer-wave1` | `crm-onprem-etl.git` (Teradata-style) | `crm_daily`, `billing_snap` |
| `billing-usage-wave1` | `billing-usage-etl.git` (Oracle-style) | `usage_hourly`, `usage_mart_daily` |

## Creating projects

| Mode | Effect |
|------|--------|
| Bind catalogue / sample | Points at `legacy/` above |
| Scaffold | Empty managed estate under `sample-data/projects/<slug>/` |
| Git clone | Shallow-clone remote; discovery expects `dags/*/dag.json` layout |

Deleting a managed project removes its sample-data folder; catalogue estates stay on disk.
