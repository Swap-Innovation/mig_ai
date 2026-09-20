# Mirage Suite — presentation

**Duration:** 15–20 minutes  
**Visual system:** Magenta `#E20074` · Ink `#0B1220` · clean white  
> **Archived.** Canonical deck: [`../../management/Mirage_Suite_Deck.pdf`](../../management/Mirage_Suite_Deck.pdf) · talk track: [`../../management/executive-briefing.md`](../../management/executive-briefing.md)

**Present mode (legacy):** Open [`Mirage-Presentation.html`](./Mirage-Presentation.html) (arrow keys / click; `P` prints PDF)

---

## Slide 1 — Title

**Mirage Suite**  
Legacy estates → governed data products  
*Portfolio Dashboard · named migration tools*

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

**Missing piece:** a gated suite for brownfield transition.

---

## Slide 5 — What Mirage Suite is

Enterprise **suite** of focused tools:

Discover → Plan → Decide → Align → Build → Pilot → Migrate → Retire  
(Atlas · Verdict · Compass · Forge · Prove · Transit · Sunset)

Dashboard KPIs first. Gallery in journey order. One tool workspace at a time.  
Agents draft. Humans approve. Artifacts persist.

---

## Slide 6 — Architecture (context)

```text
Stakeholders → Mirage Suite (UI · API · Agents)
                    │
        ┌───────────┼───────────┐
   Legacy estate  Migration   Target platform
   evidence       repository  warehouse · Spark · orchestration
```

See [architecture.md](../../engineering/architecture.md) for layers, gates, and integrations.

---

## Slide 7 — Journey & gates

| Tool | Exit evidence |
| --- | --- |
| Atlas | Signed inventory + lineage + HITL |
| Verdict | Approved register + avoidance case |
| Compass | SID / metadata pack |
| Forge | Approved conversion pack |
| Prove | Dual-run within tolerance |
| Transit | Production sign-off |
| Sunset | Legacy cost/risk closed |

---

## Slide 8 — Workspace (live)

![Home](../../assets/screenshots/02-workspace-home.png)

Portfolio Dashboard KPIs, then Suite Gallery, then a named tool.

---

## Slide 9 — Atlas & Verdict

![Profiling](../../assets/screenshots/03-discovery-inventory.png)

Evidence before economics — inventory, lineage, disposition.

---

## Slide 10 — Compass & Forge

![Build DAGs](../../assets/screenshots/06-build-dags.png)

Standards-aligned survivors → warehouse, compute, and orchestration packs.

---

## Slide 11 — Prove & Transit

![Sign-off](../../assets/screenshots/08-migrate-signoff.png)

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
| **Mirage Suite** | Estate migration control plane |
| Hub + spokes + marketplace | Run, govern, publish |

---

## Slide 14 — Close

**Productise under governance.**  
**Mirage Suite makes disposition, standards, dual-run, and retirement as real as pipelines.**

Further reading: product overview · architecture · white paper.
