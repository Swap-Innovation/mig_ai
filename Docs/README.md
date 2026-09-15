# Mirage documentation

Professional product materials for **Mirage Suite** — legacy data estates to governed cloud data products via a portfolio Dashboard, sequential tool Gallery, and named tools.

## Contents

| Document | Description |
| --- | --- |
| [Product overview](./01-product-overview.md) | Mirage Suite tools, capabilities, and operating model |
| [Architecture](./02-architecture.md) | System context, control-plane layers, journey, integrations |
| [White paper](./Mirage-White-Paper.md) | Globally publishable practice paper on brownfield productisation |
| [Presentation (script)](./Mirage-Presentation.md) | Slide narrative and speaker notes |
| [Presentation (HTML)](./Mirage-Presentation.html) | Present-mode deck — arrow keys / click; `P` to print PDF |
| [Screenshots](./assets/screenshots/) | Captures from the working suite workspace |
| [Positioning notes](./00-positioning-notes.md) | Design-system alignment and complementary platform fit |

## Screenshots

| Capture | View |
| --- | --- |
| ![Workspace home](./assets/screenshots/02-workspace-home.png) | Dashboard — portfolio KPIs (refresh after Suite UI) |
| ![Profiling](./assets/screenshots/03-discovery-inventory.png) | Atlas — profiling & lineage agents |
| ![Disposition](./assets/screenshots/04-disposition-board.png) | Verdict — disposition board |
| ![SID mapping](./assets/screenshots/05-align-workbench.png) | Compass — SID mapping workbench |
| ![Build DAGs](./assets/screenshots/06-build-dags.png) | Forge — DAG conversion pack |
| ![Pilot](./assets/screenshots/07-pilot-reviews.png) | Prove — review inbox |
| ![Migrate](./assets/screenshots/08-migrate-signoff.png) | Transit — production readiness gates |

## Design system

- Magenta `#E20074` · Ink `#0B1220` · IBM Plex Sans  
- Suite shell (Dashboard · Gallery · tool chrome) · role-gated approvals · durable migration artifacts  

## Refresh screenshots

With UI on `:3000` and API on `:8000`:

```bash
node Docs/assets/capture-screenshots.mjs
```
