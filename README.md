# Lumina Control Plane — Legacy → Cloud Migration MVP

Enterprise control plane for legacy data estate discovery, disposition, TM Forum SID mapping, metadata, LLM-assisted delivery, and a Party & Customer Account pilot on a GCP-shaped stack.

## Repository layout

```text
frontend/                 Next.js 14 UI (Lumina brand)
backend/                  FastAPI API + workers + adapters/
sample-data/
  projects/
    party-customer-wave1/   CRM / SID Party pilot estate
    billing-usage-wave1/    Billing & usage second demo estate
    <slug>/                 Managed estates scaffolded from the UI
  workspaces/<project_id>/  Upload / git clones per DB project
packages/schemas/         Shared JSON schemas
docker-compose.yml
scripts/demo_e2e.sh
```

All demo estates live under `sample-data/projects/<project-id>/`. On API startup each catalogue folder is synced to a DB project. Create / delete projects from the workspace top-bar switcher (`POST/DELETE /projects`); managed scaffolds write under `sample-data/projects/` and are removed on delete.

## Quick start (local)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=sqlite:///./migrate.db
export SAMPLE_PROJECTS_ROOT=../sample-data/projects
export SAMPLE_PROJECT_ID=party-customer-wave1
export SAMPLE_LEGACY_PATH=../sample-data/projects/party-customer-wave1/legacy
export MIGRATION_REPO_PATH=../sample-data/projects/party-customer-wave1/migration-repo
export LLM_MODE=mock
export PYTHONPATH=.
uvicorn app.main:app --reload --port 8000
```

OpenAPI: http://127.0.0.1:8000/docs

### Frontend

```bash
cd frontend
npm install
export NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev
```

UI: http://localhost:3000

> On macOS, prefer `127.0.0.1` over `localhost` for the API URL — `localhost` can resolve to IPv6 (`::1`) and hit a different process on port 8000.
### Docker Compose

```bash
docker compose up --build
```

## Demo users (password `demo`)

| Email | Role |
|---|---|
| engineer@demo.local | engineer |
| architect@demo.local | architect |
| owner@demo.local | product_owner |
| dataowner@demo.local | data_owner (metadata gate + decommission sign-off) |
| steward@demo.local | data_steward (metadata edit) |
| board@demo.local | change_board |
| viewer@demo.local | viewer (PII masked) |

Optional LLM enrichment: `export LLM_MODE=openai OPENAI_API_KEY=…` (falls back to mock). Hub probe is required for Ready when `LLM_MODE=openai` or `REQUIRE_HUB_PROBE=1`.

## Phases 0–7

| Phase | Focus |
|---|---|
| 0 Mobilisation | Evidence checklist, §10 decisions, freeze register, team RACI, UDP Hub bind/probe, Ready gate |
| 1 Discovery | Estate sources, profiling, lineage, usage (query + report logs) |
| 2 Disposition | Migrate / rebuild / consolidate / retire + consumer notify/freeze |
| 3 SID mapping | Domain → entity → attribute, editable workbench, citations |
| 4 Metadata | Owner + steward, classification, completeness gate |
| 5 Pilot product | Party + Usage/Billing products, dual-run, pipeline, reconcile |
| 6 Cutover | Per-product dual-run checklist + consumer sign-off |
| 7 Decommission | Archive, hypercare, close change (Data Owner for final decommission) |

### Workspace UI

After login, open **http://localhost:3000/workspace** (legacy `/project` redirects here).

- **Home** — next action, gate chips, recent runs
- **Left nav** — Phases 0–7 (collapsible)
- **Phase pages** — deep links `/workspace/phase/<id>/<view>` (e.g. `…/1_discovery/inventory`)
- Slim top bar + **About** drawer (product + phase guidance) + **Activity** drawer for agent runs
- Table-first views (Inventory, Disposition board, Mapping workbench, Pilot reviews/product) use a full-bleed canvas and a closeable **inspector** for row detail — not stacked card walls

### Screenshot notes (demo / deck)

Capture these after a fresh login (`engineer@demo.local` / `demo`) with the API on `:8000`:

| # | Route | What to show |
|---|---|---|
| 1 | `/workspace` | Home: next action, gate chips, recent runs |
| 2 | `/workspace/phase/1_discovery/sources` | Estate bind / ZIP / Git source setup |
| 3 | `/workspace/phase/1_discovery/console` | Async discovery steps (after Run discovery) |
| 4 | `/workspace/phase/1_discovery/inventory` | Full-bleed inventory table + row inspector |
| 5 | `/workspace/phase/2_disposition/board` | Disposition table + category chips + inspector |
| 6 | `/workspace/phase/3_mapping/workbench` | Mapping workbench + SID detail inspector |
| 7 | `/workspace/phase/5_pilot_product/reviews` | HITL review inbox table + payload inspector |
| 8 | Top bar → **About** | Phase-aware About drawer (open any phase first) |

Tips: collapse the left nav for density; open **Activity** while an agent is `running`; use `viewer@demo.local` on the product table to show PII masking.

### Phase 1 discovery (async)

1. **Sources** — bind sample project, upload a ZIP, or clone Git (`POST …/estate/git`, re-sync via `…/estate/git/sync`).
2. **Run discovery** — `POST …/discovery/run` returns immediately with `run_id` (worker continues in background). Concurrent runs return **409**.
3. **Console** — poll `GET …/discovery/runs/{run_id}` for live steps (scan → parse SQL/scripts/scheduler → catalog → persist).
4. Agents in Phases 1/3/5 likewise queue in the background; the shared agent panel polls while status is `queued` / `running`.

Workspaces for uploads/clones: `sample-data/workspaces/<project_id>/` (gitignored).

## Brand

**Lumina** — professional global product brand (magenta accent `#E20074`, ink `#0B1220`, IBM Plex Sans). Sample data and APIs are brand-agnostic; UI chrome uses Lumina design tokens.
