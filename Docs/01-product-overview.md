# Mirage Suite — product overview

**Mirage Suite** is an enterprise control plane for transitioning legacy analytics estates — warehouses, ETL graphs, schedulers, and reporting marts — into **owned, contracted data products** on a cloud platform.

It is deliberately **not** lift-and-shift. Every object is discovered with evidence, dispositioned, aligned to standards where it survives, converted to target-platform artifacts, piloted under dual-run, cut over per product, and retired when legacy cost and risk can leave.

After login, users land on a **portfolio Dashboard**, open the sequential **Suite Gallery**, then work inside one **named tool** at a time — not a single mega-navigator of every phase.

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

## Mirage Suite tools

```text
Dashboard → Gallery → Discover → Plan → Decide → Align → Build → Pilot → Migrate → Retire
```

| Sequence | Product | Job |
| --- | --- | --- |
| 1 | **Mirage Atlas** | Profiling, lineage, assessment, HITL |
| 2 | **Mirage Horizon** | Split estate into delivery waves (dependency, complexity, consumers, usage, volume, retention) |
| 3 | **Mirage Verdict** | Disposition register and benefits case (per active wave) |
| 4 | **Mirage Compass** | SID mapping and business metadata |
| 5 | **Mirage Forge** | Convert suite + accelerators (catalogue, compose, transform, contracts) |
| 6 | **Mirage Prove** | HITL reviews, dual-run, reconcile |
| 7 | **Mirage Transit** | Promote, consumers, freeze, sign-off |
| 8 | **Mirage Sunset** | Archive, hypercare, close change (then next wave if any) |

Phase IDs in the API remain for compatibility; suite names are the presentation and routing layer (`/workspace/tools/:toolId`).

![Workspace home](./assets/screenshots/02-workspace-home.png)

*Figure 1 — Portfolio Dashboard (suite landing) with gallery entry.*

---

## Capabilities in the working control plane

### Mirage Atlas (Discover)

Automated scan of estate sources (SQL, scripts, schedulers, catalogues). Produces inventory, lineage, and job graphs. Low-confidence findings require human Accept or Flag.

![Discovery profiling](./assets/screenshots/03-discovery-inventory.png)

*Figure 2 — Atlas inventory with agent terminal and lineage completion.*

### Mirage Verdict (Decide)

Evidence-based disposition. The benefits view quantifies avoidance versus survivors before platform conversion is authorised.

![Disposition board](./assets/screenshots/04-disposition-board.png)

*Figure 3 — Verdict disposition board.*

### Mirage Compass (Align)

Domain → entity → attribute mapping to an industry reference model, with ownership and classification as hard gates.

![SID workbench](./assets/screenshots/05-align-workbench.png)

*Figure 4 — Compass SID mapping workbench.*

### Mirage Forge (Build)

Survivors convert to target artifacts — e.g. BigQuery DDL, Dataproc/Spark jobs, Composer Airflow DAGs — with lane-level technology targets.

![Build DAGs](./assets/screenshots/06-build-dags.png)

*Figure 5 — Forge DAG conversion pack (Airflow → Cloud Composer).*

### Mirage Prove & Transit (Pilot & Migrate)

Product contracts, dual-run pipelines, reconcile within tolerance, per-product promote, consumer switch, freeze, and production sign-off.

![Migrate sign-off](./assets/screenshots/08-migrate-signoff.png)

*Figure 6 — Transit production readiness gates.*

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

Mirage Suite coordinates migration work; it does not replace:

- Managed warehouse, Spark, or Airflow runtimes  
- Source control or CI  
- Marketplace catalogues  
- Hub IAM, perimeter, and sovereignty controls  

Generated configuration is reviewed and versioned; runtime services execute only approved artifacts.

---

## Further reading

- [Architecture](./02-architecture.md)  
- [White paper](./Mirage-White-Paper.md)  
- [Presentation](./Mirage-Presentation.html)
