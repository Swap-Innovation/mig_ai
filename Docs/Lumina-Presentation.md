# Lumina Control Plane — presentation

**Duration:** 15–20 minutes  
**Visual system:** Magenta `#E20074` · Ink `#0B1220` · clean white  
**Present mode:** Open [`Lumina-Presentation.html`](./Lumina-Presentation.html) (arrow keys / click; `P` prints PDF)

---

## Slide 1 — Title

**Lumina**  
Legacy estates → governed data products  
*Enterprise migration control plane*

---

## Slide 2 — Governing idea

# Do not migrate the estate.  
# Migrate the products it was meant to be.

Retirement is a first-class success metric.

---

## Slide 3 — The brownfield problem

- Cryptic naming · tribal meaning  
- Team-shaped schemas · weak reuse  
- Procedural ETL · truncate/reload risk  
- Undeclared lineage · unmeasured usage  
- No owner / contract → not catalogue-ready  

**Consequence:** cloud spend grows and legacy cost remains.

---

## Slide 4 — Incomplete responses

| Approach | Limitation |
| --- | --- |
| Script factories | Convert without disposition |
| Catalogue-only programmes | Discover what still should not exist |
| Greenfield product studios | Strong for new products; silent on the live estate |

**Missing piece:** a gated control plane for brownfield transition.

---

## Slide 5 — What Lumina is

Enterprise **control plane** for:

Discover → Decide → Align → Build → Pilot → Migrate → Retire

Agents draft. Humans approve. Artifacts persist.

---

## Slide 6 — Architecture (context)

```text
Stakeholders → Lumina (UI · API · Agents)
                    │
        ┌───────────┼───────────┐
   Legacy estate  Migration   Target platform
   evidence       repository  warehouse · Spark · orchestration
```

See [02-architecture.md](./02-architecture.md) for layers, gates, and integrations.

---

## Slide 7 — Journey & gates

| Phase | Exit evidence |
| --- | --- |
| Discover | Signed inventory + lineage + HITL |
| Decide | Approved register + avoidance case |
| Align | SID / metadata pack |
| Build | Approved conversion artifacts |
| Pilot | Dual-run within tolerance |
| Migrate | Consumers switched + freeze + sign-off |
| Retire | Legacy cost/risk removed |

---

## Slide 8 — Workspace (live)

![Home](./assets/screenshots/02-workspace-home.png)

Gated delivery plan with next action and activity.

---

## Slide 9 — Discover & Decide

![Inventory](./assets/screenshots/03-discovery-inventory.png)

Evidence before economics — inventory, lineage, disposition.

---

## Slide 10 — Align & Build

![Build DAGs](./assets/screenshots/06-build-dags.png)

Standards-aligned survivors → warehouse, compute, and orchestration packs.

---

## Slide 11 — Pilot & Migrate

![Sign-off](./assets/screenshots/08-migrate-signoff.png)

Per-product dual-run, consumer switch, freeze, production sign-off.

---

## Slide 12 — Human-in-the-loop

| Automation | Humans |
| --- | --- |
| Scan, draft, validate | Own boundaries and go-live |
| Confidence + citations | Accept / flag / override |
| Pack generation | Architect & change-authority approval |

No silent ownership. No unsupervised publication.

---

## Slide 13 — Operating-model fit

| Capability | Job |
| --- | --- |
| Enablement | Ways of working |
| Packaging skills | Existing-repo contracts |
| Product builder | New / platform-native products |
| **Lumina** | Estate migration control plane |
| Hub + spokes + marketplace | Run, govern, publish |

---

## Slide 14 — Close

**Productise under governance.**  
**Lumina makes disposition, standards, dual-run, and retirement as real as pipelines.**

Further reading: product overview · architecture · white paper.
