# Mirage — positioning notes

Internal reference aligning Mirage with established brownfield packaging and hub-and-spoke platform patterns. Not a sales script.

---

## Design language carried forward

| Source pattern | Application in Mirage |
| --- | --- |
| Discover → Define → Generate → Validate | Phased gates with reviewable artifacts at each stage |
| Agent drafts · human approves | HITL Accept/Flag, architect / owner / change-authority roles |
| No silent ownership · no auto-publication | Contracts and cutovers require explicit approval |
| Evidence before packaging | Inventory, lineage, usage before disposition and build |
| Complementary enablement tools | Discovery packaging, product builders, and migration control plane address different jobs |

## Complementary capabilities

| Capability | Primary job |
| --- | --- |
| Enablement | Ways of working and coaching |
| Brownfield packaging skills | Make existing implementations discoverable and contract-ready |
| Product builder | Guided creation for new / platform-native products |
| **Mirage** | Estate discovery, disposition, standards alignment, conversion, pilot, cutover, retirement |
| Hub services | Ingest, IAM, governance, perimeter / sovereignty |
| Domain spokes | Where products live and expose contracted ports |
| Marketplace | Publish, discover, subscribe |

## Brand and quality bar

- Magenta accent, ink surfaces, sparse layouts, one idea per view  
- Measurable exits (reconcile tolerance, signed registers, freeze evidence)  
- Global white-paper language: industry-agnostic method with telecom SID as a concrete reference model  

## Non-goals

- Not a workload execution engine replacing managed Spark / Airflow / warehouse runtimes  
- Not a replacement for source control or marketplace catalogues  
- Not big-bang estate cutover  
- Not unsupervised publication of product contracts
