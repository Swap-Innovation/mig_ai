# From Legacy Estates to Governed Data Products  
### A control-plane approach for brownfield analytics modernisation

**White paper**  
**Mirage Suite**  
**Version 1.1 · September 2026**  
**Classification:** Public / externally publishable  

---

### About this paper

This paper sets out a practical operating model for modernising long-lived analytics estates — warehouses, ETL graphs, schedulers, and reporting marts — into **owned, contracted data products** on a cloud platform. It is written for executive sponsors, chief data officers, architecture boards, and programme leaders. The method is industry-agnostic; telecom examples (TM Forum SID, hub-and-spoke data platforms) illustrate a high-complexity case.

The approach is implemented in **Mirage Suite**, an enterprise control plane that combines automated discovery, wave planning, evidence-based disposition, reference-model alignment, human-in-the-loop approvals, and per-product cutover with measurable retirement.

Executive companion: [management/executive-briefing.md](../management/executive-briefing.md) · [Mirage_Suite_Deck.pdf](../management/Mirage_Suite_Deck.pdf)

---

## 1. Executive summary

Most large organisations still run critical reporting and analytical workloads on legacy data estates. Those estates grew by accretion: cryptic naming, team-shaped schemas, procedural ETL, undeclared lineage, and weak business metadata. Cloud programmes often respond with **lift-and-shift** — copying tables and jobs into a new platform. The result is familiar: higher combined run cost, unresolved ownership, and little improvement in reuse or trust.

A better path treats modernisation as **productisation under governance**, along the macro journey **Discover → Decide → Deliver → Retire**:

1. **Mobilize** access, RACI, freeze, and platform bind.  
2. **Discover** what exists from code and runtime evidence (Atlas).  
3. **Plan** delivery waves from dependency and usage (Horizon).  
4. **Decide** per object whether to migrate, rebuild, consolidate, archive, or retire (Verdict).  
5. **Align** survivors to a reference model and accountable business metadata (Compass).  
6. **Build** platform-native artifacts (Forge).  
7. **Validate** with dual-run and reconciliation (Prove).  
8. **Migrate** per product — never big-bang — with consumer switch and legacy freeze (Transit).  
9. **Retire** frozen legacy so cost and risk actually leave (Sunset).

Automation and large language models can accelerate drafting. They must not silently own boundaries, SLAs, or publication. **Human-in-the-loop gates** keep accountability with architects, data owners, product owners, and change authorities.

**Recommendation:** Establish a **migration control plane** as programme policy — disposition before build, standards before code generation, dual-run before production, and retirement as a first-class exit — rather than open-ended table migration factories.

**Governing idea:** Do not migrate the estate. Migrate the products the estate was trying — and often failing — to be.

---

## 2. Situation: the brownfield reality

Legacy analytics estates share a stable set of failure modes:

| Pattern | Typical evidence | Business consequence |
| --- | --- | --- |
| Encoded naming | Object names carry team, load type, region | Meaning lives in individuals |
| Org-chart schemas | Subject areas mirror reporting lines | Domains cannot reuse |
| Procedural wrappers | Shell/Control-M/Airflow outside clean VCS | Fragile change |
| Truncate-and-reload | Non-idempotent loads | High operational risk |
| Implicit lineage | Dependencies only in scheduler order | Impact analysis fails |
| Missing metadata | No owner, glossary, sensitivity, contract | No Marketplace-ready trust |
| Unmeasured usage | No query/report evidence | Everything “must migrate” |
| Orphaned pipelines | Jobs without known consumers | Scope grows by assumption |

Cloud platforms (object storage, columnar warehouses, managed Spark, managed Airflow, catalogues, marketplaces) solve **where** work runs. They do not, by themselves, solve **what** deserves to exist as a product.

**Consequence without evidence:** higher cost, longer timelines, higher risk, late ownership, and no clear finish line — even after the cloud move.

---

## 3. Complication: three incomplete responses

Organisations typically buy or build one of three incomplete answers:

1. **Script factories** — accelerate code conversion without disposition. Dead weight moves; licences remain. *Moved, not improved.*  
2. **Catalogue-only programmes** — improve discoverability of what still should not exist. *You know more, but still keep too much.*  
3. **Greenfield product studios** — excellent for new products; silent on the estate that funds today’s P&L and regulatory reporting. *Great for the future, not for today.*

Leading platform strategies correctly separate:

- **organisational shift** — work as data products (ownership, contracts, marketplace), and  
- **technology shift** — shared hub capabilities with domain-owned spokes.

What remains missing is the **control plane for brownfield transition** — the transition layer that bridges what exists with what’s next: a gated journey that turns evidence into decisions, decisions into standards-aligned products, and products into cutovers that finally retire legacy.

---

## 4. Governing idea

> **Do not migrate the estate. Migrate the products the estate was trying — and often failing — to be.**

That idea has four operational consequences:

1. **Retirement is success**, not failure.  
2. **Reference models beat tribal schemas** (for telecom: TM Forum Information Framework / SID).  
3. **Contracts beat tables** (schema, keys, freshness, quality, deprecation).  
4. **Agents draft; humans decide** — especially on ownership, boundaries, and go-live.

---

## 5. The control-plane method

### 5.1 End-to-end stages (Mirage Suite tools)

| # | Tool | Intent | Exit evidence |
| --- | --- | --- | --- |
| 01 | **Mobilize** | Access, RACI, freeze, platform bind | Ready for discovery |
| 02 | **Atlas** | Inventory, lineage, jobs/DAGs, profiling, usage | Signed-off technical pack |
| 03 | **Horizon** | Wave plan from dependency, complexity, consumers, usage, volume, retention | Approved waves / in-scope plan |
| 04 | **Verdict** | Migrate / rebuild / consolidate / archive / retire | Approved register + benefits case |
| 05 | **Compass** | Reference mapping + owner / definition / classification | Approved standards pack |
| 06 | **Forge** | Convert survivors to target DDL, code, orchestration | Architect-approved conversion pack |
| 07 | **Prove** | Contract, pipeline, dual-run, reconcile | Product within tolerance |
| 08 | **Transit** | Promote, switch consumers, freeze legacy | Change authority sign-off |
| 09 | **Sunset** | Archive, release infra, hypercare, close | Legacy cost/risk removed |

### 5.2 Disposition economics

Migration cost scales with object count. The cheapest object is the one **not** migrated.

| Disposition | When | Outcome |
| --- | --- | --- |
| Retire | No use, no retention, no dependents | Decommission path |
| Archive-only | Retention without active use | Cold storage, not warehouse |
| Consolidate | Near-duplicate | Single survivor |
| Migrate | Sound logic, active use | Translate |
| Rebuild | Active use, unsound/non-restartable logic | Re-implement from system of record |

A credible benefits case reports **avoidance percentage** alongside survivors — before cloud build spend is authorised.

### 5.3 Standards alignment

Survivors are mapped at domain, entity, and attribute levels to a reference model. Each row carries conformance (`conformant`, `conformant-with-extension`, `non-conformant justified`). Unmapped inventiveness is recorded as a **gap**, not silently normalised into a new enterprise standard.

Business metadata then supplies accountability: owner, steward, system of record, criticality, sensitivity, retention, freshness, known consumers.

### 5.4 Source-aligned data products

A source-aligned product represents one authoritative business entity close to its system of record — cleaned and conformed, **not** report-specific. Derivation rules:

- Start from the canonical entity, not the legacy table.  
- Never merge two sources of record into one product.  
- Publish a versioned contract; enforce classification at the boundary.  
- Keep consumer-specific logic in consumer-aligned products above.

### 5.5 Cutover discipline

- Dual-run with quantitative reconcile (row counts, keys, control totals, aggregates).  
- Cut over **per product**.  
- Switch consumers to the contract; freeze legacy; then archive.  
- Record production sign-off with residual risk and rollback ownership.

---

## 6. Human-in-the-loop and responsible automation

Automation should accelerate **evidence and drafts**. It must not invent ownership or auto-publish contracts.

| Stage | Automation | Humans (typical) | Output | Gate |
| --- | --- | --- | --- | --- |
| Discover (Atlas) | Scan code, metadata, runtime | Architect, Data owner | Inventory, lineage, usage | Ready |
| Plan (Horizon) | Analyse dependencies and usage | Programme lead, Domain owner | Waves / in-scope plan | Approved |
| Decide (Verdict) | Disposition options with evidence | Data owner, Change authority | Register + business case | Approved |
| Align (Compass) | Map to reference models | Enterprise architect, Steward | Mapping + ownership | Approved |
| Build (Forge) | Generate DDL, DAGs, packs, docs | Engineering lead, Reviewers | Conversion pack | Approved |
| Validate (Prove) | Dual-run, reconcile, quality | Product owner, Data owner | Go / no-go | Within tolerance |
| Migrate (Transit) | Orchestrate cutover tasks | Change authority, Operations | Switch, freeze, sign-off | Signed |
| Retire (Sunset) | Package archive evidence | Data owner, Finance / Risk | Closure report | Closed |

Operating rules for LLM-assisted work:

1. Minimum necessary context; no secrets or unrestricted personal data in prompts.  
2. Structured outputs with confidence and citations.  
3. Low-confidence items become review items, not instructions.  
4. Generated code is an engineer pull request — tests, lineage, security, reconcile.  
5. Platform execution reads only reviewed, version-controlled configuration.  
6. Prompt version, standards version, artifacts, reviewer, and decision are auditable.

Quality bar: *agent drafts, engineer approves; no silent ownership, no fake SLAs, no auto-publication.*

---

## 7. Operating model fit

A durable platform operating model usually combines:

| Capability | Role | Outcome |
| --- | --- | --- |
| **Enablement** | Ways of working, coaching, clinics | People ready |
| **Packaging skills** | Make existing implementations discoverable and contract-ready | Assets productised |
| **Product builder** | Guided creation for new / platform-native products | New products |
| **Mirage Suite** | Brownfield disposition, standards alignment, build, pilot, cutover, retire | Legacy → products |
| **Hub services** | Ingest, IAM, governance, perimeter / sovereignty | Central platform |
| **Domain spokes** | Where products live and expose contracted ports | Owned products |
| **Marketplace** | Publish, discover, subscribe | Sustain at scale |

Entry points differ; the destination does not: **owned, contracted, discoverable, reusable, operable** data products.

---

## 8. Architecture pattern (illustrative)

Platform-neutral layering with representative services:

| Layer | Intent | Examples |
| --- | --- | --- |
| Landing | Immutable capture | Cloud object storage |
| Warehouse | Analytical store | Columnar cloud warehouse |
| Compute | Heavy transforms | Managed Spark |
| Orchestration | DAG runtime | Managed Airflow |
| Governance | Catalogue, policy, lineage | Dataplex-class / IAM |
| Products | Contracts + ports | Marketplace publication |

In hub-and-spoke designs, the hub **governs**; domains **own** products. Internal build stages remain private; consumers depend only on contracted public ports.

Mirage Suite is the **control plane**: decisions and artifacts stay in Mirage; execution remains on the target platform. See [engineering/architecture.md](../engineering/architecture.md).

---

## 9. Value case and metrics

Executives should insist on a scorecard, not a slide of ambition:

| Metric | Why it matters |
| --- | --- |
| % objects not migrated (scope avoided) | Scope and cost control |
| Conformance score | Standards discipline |
| Dual-run reconcile pass rate | Cutover risk |
| Time from signed inventory to first product | Delivery speed |
| Consumers switched | Adoption reality |
| Legacy infra / licence released | True completion |
| Audit completeness of migration-repo | Regulatory defensibility |

### Illustrative programme outcomes

The following figures appear in the Executive Briefing as **illustrative / typical** signals — not contractual product guarantees. Replace with organisation baselines before external publication.

| Theme | Illustrative signal |
| --- | --- |
| Lower scope and cost | 35–60% fewer objects migrated (typical) |
| Higher trust and quality | 90%+ assets with business metadata and ownership |
| Controlled change | 2–4× fewer production incidents during cutover |
| Visible completion | 100% retired estate with evidence (systems, licences, risk, cost baseline) |

Illustrative telecom Wave-1 products often include Party & Customer Account, Service Inventory, Usage Events, and Billing / Rated Events — each mapped to SID aggregates and cut over independently.

### Value path (programme narrative)

The Executive Briefing frames lasting impact as a path, not a single cutover event:

**Remove legacy → Simplify → Deliver → Scale → Innovate → A stronger data future**

![Slide 11 — business impact path](../assets/deck/slides/slide-11.jpg)

*Illustrative impact visuals and path. Inventory: [visual-catalog.md § Slide 11](../management/visual-catalog.md#slide-11--business-impact-illustrative).*

---

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Shadow migration teams bypass gates | Mandate control-plane policy for funding |
| Over-trust in model outputs | HITL + confidence thresholds |
| Big-bang pressure from programmes | Per-product cutover as non-negotiable |
| Metadata theatre | Owner + classification as hard gates |
| Cloud cost without legacy exit | Retire phase funded and measured |
| Tool sprawl (three journeys, three truths) | Explicit complementarity and shared destination |

---

## 11. Implementation roadmap

| Stage | Window | Focus | Activities | Outcome |
| --- | --- | --- | --- | --- |
| **Foundation** | 0–3 months | Establish the programme and build evidence | Governance and team; Atlas on one estate; initial disposition and value case; agree first product scope | Evidence pack + avoidance case |
| **First product** | 3–6 months | Align, build and prove | Compass / Forge; build and test; Prove dual-run; prepare Transit | One product in dual-run within tolerance |
| **Production** | 6–12 months | Go live, switch consumers and retire | Promote; switch consumers; freeze; sign off; start Sunset | Controlled Wave-1 completion |
| **Scale** | 12+ months | Repeat across domains and estates | Subsequent waves; integrate packaging / product builder; scale hub + spokes + marketplace; embed BAU | Repeatable playbook |

### Success factors

- Executive sponsorship (mandate and funding)  
- Right cross-functional team and skills  
- Disciplined governance — evidence at every gate  
- Measure and communicate value, adoption, and retirement  

### Engagement next steps (from conversation to momentum)

| Step | Focus | Window |
| --- | --- | --- |
| Align | Estate, priorities, success criteria | 1–2 weeks |
| Assess | Focused Atlas discovery + initial disposition | 2–4 weeks |
| Plan | Products, waves, business case (Horizon + Verdict) | 2–4 weeks |
| Execute | Pilot first product (Compass → Forge → Prove) and prepare to scale | 8–12 weeks |

Full talk track: [executive-briefing.md — Slide 15](../management/executive-briefing.md#slide-15--next-steps). Standalone one-pager: [engagement-next-steps.md](../management/engagement-next-steps.md).

---

## 12. Conclusion

Cloud platforms and data-product operating models are necessary but not sufficient. Brownfield estates will dominate risk and cost until organisations install a **gated control plane** that makes disposition, standards, dual-run, and retirement as real as pipelines.

**Mirage Suite** embodies that control plane: mobilize with mandate, discover with evidence, plan with waves, decide with economics, align with standards, build with review, prove with reconcile, migrate under change control, and retire with proof.

Organisations that treat migration as productisation shrink estates, raise trust, and fund platform adoption with avoided waste — not with hope.

---

## Appendix A — Glossary

| Term | Meaning |
| --- | --- |
| Brownfield | Existing implementation estate (code, jobs, data) |
| Disposition | Per-object migrate / rebuild / consolidate / archive / retire decision |
| HITL | Human-in-the-loop approval |
| Horizon | Wave-planning tool in Mirage Suite |
| ODPS / ODCS | Open data product / data contract specifications (illustrative) |
| SID | TM Forum Information Framework |
| Source-aligned product | Authoritative entity product near system of record |
| Control plane | Gated workflow + artifacts + roles coordinating delivery |
| Macro journey | Discover → Decide → Deliver → Retire |

## Appendix B — Illustrative control-plane views

The following figures are captured from a working Mirage workspace (Sep 2026 — not aspirational briefing mocks). Full index: [screenshots/README.md](../assets/screenshots/README.md).

![Workspace](../assets/screenshots/02-workspace-home.png)

*Figure B1 — Portfolio Dashboard KPIs and Mirage chat rail.*

![Stage map](../assets/screenshots/02b-suite-gallery.png)

*Figure B2 — Estate Stage map (Discover→Retire / Atlas→Sunset).*

![Profiling](../assets/screenshots/03-discovery-inventory.png)

*Figure B3 — Atlas Profiling (Discover).*

![Forge](../assets/screenshots/06-build-dags.png)

*Figure B4 — Forge Pipeline Migration (Airflow → Cloud Composer).*

![Migrate](../assets/screenshots/08-migrate-signoff.png)

*Figure B5 — Transit Sign-off prior to Sunset.*

## Appendix C — Authoring note

This paper is intended for global publication. Vendor and platform names are illustrative. Replace local programme names, tolerance thresholds, illustrative impact figures, and Wave-1 product lists with organisation-specific figures before external release.

## Appendix D — Related practice

- Brownfield packaging: evidence scan → candidate products → human confirm → contract drafts → validate before publish  
- Platform evolution: shared hub capabilities; domain-owned product structures; marketplace as the front door for discovery and subscription  
- Positioning: [positioning.md](./positioning.md)

---

*© 2026 Mirage Suite. Licensed for internal use and external publication with attribution.*
