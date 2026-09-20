# Mirage Suite — architecture

This document describes the logical and technical architecture of **Mirage Suite**: how legacy estates become governed cloud data products under human approval.

**Macro journey:** Discover → Decide → Deliver → Retire  
**Suite tools:** Mobilize → Atlas → Horizon → Verdict → Compass → Forge → Prove → Transit → Sunset  

Executive narrative: [management/executive-briefing.md](../management/executive-briefing.md) · Product story: [product/overview.md](../product/overview.md)

---

## 1. System context

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         Enterprise stakeholders                          │
│  Sponsor · Engineer · Architect · Data Owner · Steward · PO · Change auth│
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Mirage Suite        │
                    │  UI · API · Agents · DB │
                    └─┬──────────┬──────────┬─┘
          ┌───────────┘          │          └───────────┐
          ▼                      ▼                      ▼
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ Legacy estate   │   │ Migration repo   │   │ Target platform     │
│ SQL · scripts   │   │ discover/decide/ │   │ Landing · Warehouse │
│ DAGs · catalog  │   │ align/build/…    │   │ Spark · Orchestration│
│ usage evidence  │   │ versioned JSON   │   │ Catalogue · Hub     │
└─────────────────┘   └──────────────────┘   └─────────────────────┘
```

Mirage is the **control plane**: it discovers evidence, records decisions, generates reviewable artifacts, and gates progression. Domain **data planes** (warehouse, Spark, Airflow) execute workloads outside Mirage.

---

## 2. Control-plane layers

Aligned to the Executive Briefing architecture:

| Layer | Responsibility | Implementation (MVP) |
| --- | --- | --- |
| **Experience** | Dashboard, Gallery, project spaces, tool workspaces, approvals | Next.js 14 · Mirage brand |
| **API & orchestration** | Auth, projects, portfolio KPIs, tool/phase APIs, workflow gates, agents | FastAPI · workers |
| **Intelligence** | Discovery, assessment, mapping, generation agents | Agents (mock / LLM) with structured outputs |
| **Data & artifact** | Migration repository, metadata, review items, audit, versioned artifacts | Relational DB + JSON · `migration-repo/` |
| **Human-in-the-loop** | Roles, reviews, approvals, governance | Role-gated mutating APIs · HITL UI |
| **Adapters** | Estate bind (sample / ZIP / Git), Hub probe | Backend adapters |

```text
┌─────────────────────────────────────────────────────────────┐
│ Experience (Next.js)                                        │
│  Dashboard · Gallery · Suite tools · HITL · Role chrome     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS / JWT
┌────────────────────────────▼────────────────────────────────┐
│ API & workers (FastAPI)                                     │
│  Projects · Discovery · Waves · Disposition · Align · Build │
│  Pilot · Migrate · Retire · Agents · Audit                  │
└───────┬───────────────────┬───────────────────┬─────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Application   │  │ Agent runtime  │  │ Artifact export    │
│ database      │  │ (task runners) │  │ migration-repo/**  │
└───────────────┘  └────────────────┘  └────────────────────┘
```

### Architectural principles

| Principle | Meaning |
| --- | --- |
| Security by design | SSO-ready auth, RBAC, audit |
| Open by integration | APIs, adapters, standards |
| Separation of concerns | Control plane vs data plane |
| Built for scale | Multiple estates, domains, products |

---

## 3. Journey architecture (gates)

Each stage writes evidence, then a **role-gated exit** unlocks the next stage.

```mermaid
flowchart LR
  M[Mobilize] --> A[Atlas]
  A --> H[Horizon]
  H --> V[Verdict]
  V --> C[Compass]
  C --> F[Forge]
  F --> P[Prove]
  P --> T[Transit]
  T --> S[Sunset]

  A -. HITL findings .-> A
  H -. Wave approve .-> H
  V -. Change approval .-> V
  C -. Mapping + metadata .-> C
  F -. Pack approve .-> F
  P -. Reconcile .-> P
  T -. Prod sign-off .-> T
```

| Stage | Evidence | Authority (typical) | Gate |
| --- | --- | --- | --- |
| Mobilize | Environments, RACI, freeze, hub bind | Programme lead / architect | Ready |
| Atlas | Inventory + lineage + HITL complete | Architect / data owner | Ready |
| Horizon | In-scope plan, dependency map, waves | Programme lead / domain owner | Approved |
| Verdict | Register + benefits case | Data owner / change authority | Approved |
| Compass | SID pack + ownership / classification | Enterprise architect / steward | Approved |
| Forge | Conversion artifacts | Engineering lead / reviewers | Approved |
| Prove | Dual-run within tolerance | Product owner / data owner | Within tolerance |
| Transit | Promote + consumers + freeze | Change authority / operations | Signed |
| Sunset | Archive + hypercare + infra release | Data owner / finance / risk | Closed |

Full HITL matrix: [product/overview.md — Human-in-the-loop](../product/overview.md#human-in-the-loop).

> **MVP note:** Suite presentation may expose Mobilize / Horizon with less UI depth than Atlas / Verdict / Forge. Phase IDs in the API remain for compatibility; treat the nine-tool sequence as the architectural journey even where surfaces are still maturing.

### Journey actions, questions, and deliverables

From Executive Briefing slide 8 — the method grid under the nine stage pins:

| Stage | Action category | Key question (examples) | Deliverable focus |
| --- | --- | --- | --- |
| Mobilize | Discover / prepare | Are people, scope, and access ready? | Environments, RACI, freeze |
| Atlas | Inventory | What exists with evidence? | Inventory, lineage, usage |
| Horizon | Analyze / plan | What is in-scope for this wave? | Waves, dependency map |
| Verdict | Decide | What survives — and what leaves? | Disposition register, benefits |
| Compass | Plan / align | What is the target product shape? | Reference mapping, ownership |
| Forge | Build | How do we implement? | Mappings, code, configurations |
| Prove | Prove | Does dual-run stay within tolerance? | Reconcile / quality evidence |
| Transit | Migrate | Can we safely switch? | Production cutover and monitoring |
| Sunset | Retire | Has legacy cost and risk left? | Archive, infra release, closure |

![Slide 8 — end-to-end journey](../assets/deck/slides/slide-08.jpg)

*Executive Briefing visual. Inventory: [visual-catalog.md § Slide 8](../management/visual-catalog.md#slide-8--end-to-end-mirage-journey).*

---

## 4. Data flow — Discover to Build

```text
Legacy root
   │
   ├─► Parsers (SQL / scripts / DAG dirs / catalog / usage)
   │         │
   │         ▼
   │   InventoryObject · LineageEdge · JobNode
   │         │
   │         ▼
   │   Assessment findings ──HITL──► ReviewItem (accepted / flagged)
   │         │
   │         ▼
   │   Wave plan (Horizon) ──► approved in-scope set
   │         │
   ▼         ▼
Disposition scoring ──► Disposition register (migrate|rebuild|consolidate|archive|retire)
         │
         ▼
   SID / metadata alignment ──► MappingRow + entity metadata
         │
         ▼
   Build pack generator ──► BuildArtifact (table | code | dag)
         │
         ▼
   migration-repo/build/{tables,code,dags}/
```

**Disposition-first rule:** only `migrate` / `rebuild` survivors enter the conversion pack. Orchestration inventory (DAGs) is included in Decide so Build can emit scheduler artifacts.

---

## 5. Target platform shape (illustrative)

Mirage is platform-shaped, not vendor-locked. The MVP conversion lanes map as follows:

| Asset class | Source examples | Target examples |
| --- | --- | --- |
| Tables / views | Oracle, Teradata, Postgres | BigQuery (or equivalent warehouse) |
| Code / jobs | Spark, PySpark, shell, PL/SQL | Dataproc / managed Spark |
| Orchestration | Airflow DAGs | Cloud Composer / MWAA / Airflow on K8s |

```text
                    ┌──────── Hub / governance ────────┐
                    │ IAM · catalogue · perimeter      │
                    └───────────────┬──────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Landing (GCS)              Warehouse                   Orchestration
   immutable capture          product tables              managed Airflow
         │                          │                          │
         └──────────────► Compute (Spark) ◄────────────────────┘
```

In hub-and-spoke operating models, the hub governs; domain spokes own products and expose contracted ports to consumers / marketplace.

---

## 6. Application architecture (MVP components)

```text
frontend/
  app/                     Next.js routes (login, workspace)
  components/workspace/    Suite shell, providers
  components/phases/       Discover · Decide · Align · Build · Pilot · Migrate · Retire
  lib/                     API client, phases/tools, HITL helpers

backend/
  app/main.py              HTTP API
  app/services/
    discovery*.py          Estate scan & inventory
    wave_plan.py           Horizon-style wave planning
    disposition.py         Scoring & register
    build_pack.py          Conversion artifacts
    migrate_cutover.py     Promote · consumers · freeze · sign-off
    project_workspace.py   migration-repo export
  app/agents.py            Task runners (assessment, mapping, …)
  adapters/                Estate / hub adapters
```

### Key API surfaces

| Area | Examples |
| --- | --- |
| Auth | `/auth/login`, role-scoped JWT |
| Estate | bind sample / ZIP / Git |
| Discovery | `/discovery/run`, inventory, lineage, HITL |
| Waves | wave plan / prioritisation surfaces |
| Decide | disposition analyze, overrides, approve |
| Align | SID mapping, metadata completeness |
| Build | `/build/generate`, artifacts, summary |
| Pilot | products, pipeline, reconcile |
| Migrate | promote-prod, consumers, freeze, signoff |
| Retire | retirement advance, hypercare, audit |

---

## 7. Security and accountability

| Concern | Approach |
| --- | --- |
| Authentication | JWT sessions; demo and enterprise IdP / SSO-ready pattern |
| Authorisation | Role gates on mutating endpoints |
| PII | Classification tags; viewer masking in product views |
| Secrets | Not accepted in agent prompts; estate tokens handled at bind |
| Audit | API audit events + exported stage manifests |
| Change control | Production sign-off required before Sunset completes |

---

## 8. Deployment topology

| Mode | Topology |
| --- | --- |
| Local MVP | Next.js `:3000` · FastAPI `:8001` (or `:8000`) · SQLite · sample estates on disk |
| Compose | Containerised API + UI (+ optional Postgres) |
| Enterprise | UI/API behind gateway; managed DB; object storage for migration-repo; private LLM endpoint optional |

```text
[Browser] ──► [Mirage UI] ──► [Mirage API]
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                 Database   Object/Git repo   LLM (optional)
```

Match `NEXT_PUBLIC_API_URL` to the API port actually running (local frontend often uses `http://127.0.0.1:8001`).

---

## 9. Integration points

| Integration | Direction | Purpose | Maturity |
| --- | --- | --- | --- |
| Legacy Git / ZIP | In | Estate source for discovery | MVP |
| Platform Hub probe | Out | Validate landing / spoke readiness (Mobilize) | MVP |
| Identity / SSO | In | Enterprise authentication | Pattern ready |
| CI/CD (Git) | Out | Reviewed packs as PRs / versioned config | Adjacent / future |
| Governance / Catalogue | Out | Metadata and lineage hand-off | Adjacent / future |
| ITSM / Change | Out | Change records for promote / freeze | Future |
| Collaboration (Teams / Slack) | Out | Approvals and notifications | Future |
| Observability | In/Out | Status & telemetry from runtimes | Future |
| Cost / FinOps | Out | Exit and run-cost signals | Future |
| Target cloud APIs | Out | Optional publish of approved packs | Future |
| Marketplace / ODPS | Out | Product contracts prepared for publication | Adjacent |
| Brownfield packaging skills | Adjacent | Spec drafting without full estate cutover | Adjacent |

---

## 10. Quality attributes

| Attribute | How Mirage addresses it |
| --- | --- |
| Traceability | Stage exports + audit + agent run history |
| Controllability | Explicit gates; no silent promote |
| Scalability of method | Per-project waves; repeatable playbooks |
| Recoverability | Dual-run before cutover; freeze window |
| Extensibility | Lane targets and reference-model packs are swappable |

---

## Related figures from the workspace

![Forge pipelines](../assets/screenshots/06-build-dags.png)

*Forge **Pipeline Migration** — DAGs / orchestration retargeted to Cloud Composer (Convert / Generate / Forge apps).*

![Transit sign-off](../assets/screenshots/08-migrate-signoff.png)

*Transit **Sign-off** — production readiness as an architectural control, not a checklist afterthought.*

![Stage map](../assets/screenshots/02b-suite-gallery.png)

*Estate **Stage map** — Discover→Retire journey with suite tool names (Atlas→Sunset).*

Screenshot inventory: [assets/screenshots/README.md](../assets/screenshots/README.md).
