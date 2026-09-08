# Lumina Control Plane — product overview

**Lumina** is an enterprise control plane for transitioning legacy analytics estates — warehouses, ETL graphs, schedulers, and reporting marts — into **owned, contracted data products** on a cloud platform.

It is deliberately **not** lift-and-shift. Every object is discovered with evidence, dispositioned, aligned to standards where it survives, converted to target-platform artifacts, piloted under dual-run, cut over per product, and retired when legacy cost and risk can leave.

---

## Outcomes

| Outcome | Description |
| --- | --- |
| Smaller migration surface | Retire, archive, and consolidate before build spend |
| Standards-aligned model | Reference mapping (e.g. TM Forum SID) with explicit extensions and gaps |
| Accountable products | Owner, definition, classification, and published contracts |
| Controlled cutover | Dual-run reconcile, consumer switch, legacy freeze, production sign-off |
| Auditability | Durable migration-repository artifacts across the journey |

---

## Delivery journey

```text
Mobilise → Discover → Decide → Align → Build → Pilot → Migrate → Retire
```

| Phase | Focus | Exit evidence |
| --- | --- | --- |
| **Discover** | Inventory, lineage, jobs/DAGs, profiling, usage | Signed-off technical pack |
| **Decide** | Migrate / rebuild / consolidate / archive / retire | Approved register + benefits case |
| **Align** | Reference mapping + business metadata | Approved standards pack |
| **Build** | Warehouse DDL, compute jobs, orchestration | Approved conversion pack |
| **Pilot** | Contract, pipeline, dual-run, reconcile | Product within tolerance |
| **Migrate** | Promote, switch consumers, freeze | Production sign-off |
| **Retire** | Archive, release infrastructure, hypercare | Legacy cost/risk removed |

![Workspace home](./assets/screenshots/02-workspace-home.png)

*Figure 1 — Workspace home with gated delivery plan.*

---

## Capabilities in the working control plane

### Discover

Automated scan of estate sources (SQL, scripts, schedulers, catalogues). Produces inventory, lineage, and job graphs. Low-confidence findings require human Accept or Flag.

![Discovery inventory](./assets/screenshots/03-discovery-inventory.png)

*Figure 2 — Inventory with agent terminal and lineage completion.*

### Decide

Evidence-based disposition. The benefits view quantifies avoidance versus survivors before platform conversion is authorised.

![Disposition board](./assets/screenshots/04-disposition-board.png)

*Figure 3 — Disposition board.*

### Align

Domain → entity → attribute mapping to an industry reference model, with ownership and classification as hard gates.

![SID workbench](./assets/screenshots/05-align-workbench.png)

*Figure 4 — SID mapping workbench.*

### Build

Survivors convert to target artifacts — e.g. BigQuery DDL, Dataproc/Spark jobs, Composer Airflow DAGs — with lane-level technology targets.

![Build DAGs](./assets/screenshots/06-build-dags.png)

*Figure 5 — DAG conversion pack (Airflow → Cloud Composer).*

### Pilot & Migrate

Product contracts, dual-run pipelines, reconcile within tolerance, per-product promote, consumer switch, freeze, and production sign-off.

![Migrate sign-off](./assets/screenshots/08-migrate-signoff.png)

*Figure 6 — Production readiness gates.*

---

## Human-in-the-loop

| Automation prepares | Humans approve |
| --- | --- |
| Estate scan and inventory | Scope and business context |
| Disposition recommendations | Register overrides and change approval |
| Mapping and conversion drafts | Architect / owner decisions |
| Readiness reports | Production sign-off |

Roles include engineer, architect, data owner, data steward, product owner, and change board — with segregation appropriate to each gate.

---

## Platform fit

Lumina coordinates migration work; it does not replace:

- Managed warehouse, Spark, or Airflow runtimes  
- Source control or CI  
- Marketplace catalogues  
- Hub IAM, perimeter, and sovereignty controls  

Generated configuration is reviewed and versioned; runtime services execute only approved artifacts.

---

## Further reading

- [Architecture](./02-architecture.md)  
- [White paper](./Lumina-White-Paper.md)  
- [Presentation](./Lumina-Presentation.html)
