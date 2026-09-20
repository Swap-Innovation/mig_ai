# Mirage Suite — positioning notes

Internal reference aligning Mirage Suite with established brownfield packaging and hub-and-spoke platform patterns. Not a sales script.

Canonical executive narrative: [Executive briefing](../management/executive-briefing.md).

---

## Design language carried forward

| Source pattern | Application in Mirage Suite |
| --- | --- |
| Discover → Decide → Deliver → Retire | Macro journey on every briefing surface |
| Discover → Define → Generate → Validate | Phased gates with reviewable artifacts at each stage |
| Agent drafts · human approves | HITL Accept/Flag; architect / owner / change-authority roles |
| No silent ownership · no auto-publication | Contracts and cutovers require explicit approval |
| Evidence before packaging | Inventory, lineage, usage before disposition and build |
| Complementary enablement tools | Packaging, product builders, and migration control plane address different jobs |

## Complementary capabilities

Mirage is the **missing transition layer** — bridging what exists with what’s next — not a replacement for adjacent programmes.

| Capability | Primary job | Outcome |
| --- | --- | --- |
| Enablement | Ways of working, coaching, playbooks, community | People ready |
| Packaging skills | Make existing implementations discoverable and contract-ready | Assets productised |
| Product builder | Guided creation for new / platform-native products | New products |
| **Mirage Suite** | Estate discovery, wave plan, disposition, standards alignment, conversion, pilot, cutover, retirement | Legacy → products |
| Hub services | Ingest, IAM, governance, perimeter / sovereignty | Central platform |
| Domain spokes | Where products live and expose contracted ports | Owned products |
| Marketplace | Publish, discover, subscribe | Sustain at scale |

### Target end-state (conceptual)

```text
Consumers
    ↑
Data marketplace
    ↑
Domain data products / spokes
    ↑
Central platform / hub
    ↑
Source systems (legacy + operational)
```

![Slide 13 — operating model & hub/spoke pyramid](../assets/deck/slides/slide-13.jpg)

*Executive Briefing visual — capability flow (Enablement → Packaging → Product builder → Mirage → Hub+spokes+marketplace) and pyramid. Inventory: [visual-catalog.md § Slide 13](../management/visual-catalog.md#slide-13--operating-model-fit).*

## Incomplete answers Mirage does not duplicate

| Approach | Limitation (why Mirage still needed) |
| --- | --- |
| Script factories | Convert without disposition — moved, not improved |
| Catalogue-only programmes | Discover without decisions — keep too much |
| Greenfield product studios | Build without legacy exit — silent on today’s estate |

## Brand and quality bar

- Magenta accent `#E20074`, ink surfaces, sparse layouts, one idea per view  
- Measurable exits (reconcile tolerance, signed registers, freeze evidence, infra release)  
- Global white-paper language: industry-agnostic method with telecom SID as a concrete reference model  
- Illustrative programme metrics in briefing materials are labelled as such — not product SLAs  

## Non-goals

- Not a workload execution engine replacing managed Spark / Airflow / warehouse runtimes  
- Not a replacement for source control or marketplace catalogues  
- Not big-bang estate cutover  
- Not unsupervised publication of product contracts  
- Not a substitute for enablement or greenfield product studios
