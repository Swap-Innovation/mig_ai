# Mirage documentation

Professional product materials for **Mirage Suite** — legacy data estates to governed cloud data products via a portfolio Dashboard, Suite Gallery, and nine named tools.

**Macro journey:** Discover → Decide → Deliver → Retire  
**Tools:** Mobilize · Atlas · Horizon · Verdict · Compass · Forge · Prove · Transit · Sunset  

Canonical executive visual deck: [management/Mirage_Suite_Deck.pdf](./management/Mirage_Suite_Deck.pdf)

**Public product site:** [swap-innovation.github.io/mig_ai](https://swap-innovation.github.io/mig_ai/) — marketing homepage + one-click mock demo (`/demo`).

---

## What lives where

| Folder | Audience | Owns |
| --- | --- | --- |
| [management/](./management/) | Sponsors / programme | Deck PDF/PPTX, briefing, visual catalog, engagement next steps, illustrative outcomes |
| [product/](./product/) | Product / method | Overview, positioning, white paper |
| [engineering/](./engineering/) | Builders | Architecture, layers, gates, integrations, deploy |
| [presentations/](./presentations/) | Presenters | Points to management deck; archives outdated HTML |
| [assets/deck/](./assets/deck/) | Shared | Optimized **briefing** slide images (not live UI) |
| [assets/screenshots/](./assets/screenshots/) | Shared | **Live product** captures + capture script |

---

## Contents

| Document | Description |
| --- | --- |
| [Executive briefing](./management/executive-briefing.md) | 15-slide talk track with full slide image embeds |
| [Visual catalog](./management/visual-catalog.md) | Every visual region on every slide |
| [Slide map](./management/slide-map.md) | Slide → image → Docs crosswalk |
| [Engagement next steps](./management/engagement-next-steps.md) | Align → Assess → Plan → Execute one-pager |
| [Product overview](./product/overview.md) | Nine tools, capabilities, HITL matrix |
| [Positioning](./product/positioning.md) | Complementary platform fit |
| [White paper](./product/white-paper.md) | Publishable practice paper |
| [Architecture](./engineering/architecture.md) | System context, layers, journey, integrations |
| [Deck slides](./assets/deck/slides/) | Optimized JPEG embeds of the briefing |
| [Screenshots](./assets/screenshots/) | Captures from the working suite workspace |

---

## Screenshots (live product)

Full inventory and routes: [assets/screenshots/README.md](./assets/screenshots/README.md).

| Capture | Section |
| --- | --- |
| ![Dashboard](./assets/screenshots/02-workspace-home.png) | **Dashboard** — portfolio KPIs across estates |
| ![Stage map](./assets/screenshots/02b-suite-gallery.png) | **Stage map** — Discover→Retire (Atlas→Sunset) |
| ![Atlas Profiling](./assets/screenshots/03-discovery-inventory.png) | **Atlas · Profiling** |
| ![Atlas Source](./assets/screenshots/03b-atlas-sources.png) | **Atlas · Source** |
| ![Verdict Board](./assets/screenshots/04-disposition-board.png) | **Verdict · Board** |
| ![Horizon](./assets/screenshots/04b-horizon-overview.png) | **Horizon · Overview** |
| ![Compass](./assets/screenshots/05-align-workbench.png) | **Compass · Workbench** |
| ![Forge Pipelines](./assets/screenshots/06-build-dags.png) | **Forge · Pipeline Migration** (DAGs → Composer) |
| ![Forge apps](./assets/screenshots/06b-forge-suite.png) | **Forge · apps** catalogue |
| ![Prove](./assets/screenshots/07-pilot-reviews.png) | **Prove · Reviews** |
| ![Transit](./assets/screenshots/08-migrate-signoff.png) | **Transit · Sign-off** |
| ![Sunset](./assets/screenshots/09-sunset-archive.png) | **Sunset · Archive** |

Do not treat Executive Briefing slide 9 (programme UI mock) or slide 10 tool thumbnails as current product screenshots — they are **target / illustrative**. See [visual-catalog.md](./management/visual-catalog.md).

### Sample deck visuals

| Slide | Preview |
| --- | --- |
| Vision (1) | ![Slide 1](./assets/deck/slides/slide-01.jpg) |
| Nine tools (5) | ![Slide 5](./assets/deck/slides/slide-05.jpg) |
| Architecture (7) | ![Slide 7](./assets/deck/slides/slide-07.jpg) |

Regenerate deck JPEGs: `./Docs/assets/deck/extract-deck-slides.sh`  
Regenerate product screenshots: `node Docs/assets/capture-screenshots.mjs`

---

## Design system

- Magenta `#E20074` · Ink `#0B1220` · IBM Plex Sans  
- Suite shell (Dashboard · Gallery · tool chrome) · role-gated approvals · durable migration artifacts  

---

## Refresh product screenshots

With UI on `:3000` and API on `:8001` (or the port in `frontend/.env.local`):

```bash
node Docs/assets/capture-screenshots.mjs
```

Prefer `127.0.0.1` over `localhost` for the API URL on macOS.
