# Mirage Suite — Legacy → Cloud Migration MVP

Enterprise suite for legacy data estate discovery, disposition, TM Forum SID mapping, metadata, LLM-assisted delivery, and a Party & Customer Account pilot on a GCP-shaped stack. Post-login: **Dashboard → Stage map → named tools** (Atlas, Horizon, Verdict, Compass, Forge, Prove, Transit, Sunset).

## Repository layout

```text
frontend/                 Next.js 14 UI (Mirage brand)
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

### Local vs GitHub Pages (kept separate)

| | **Local** | **Published (Pages)** |
|---|---|---|
| Command | `cd frontend && npm run dev` | `npm run publish:pages` |
| Config | `frontend/.env.local` | `frontend/.env.pages` |
| Backend | Live FastAPI | None (mock fixtures) |
| Auto on `main` push? | — | **No** — publish only when you choose |

**One-time Pages setup:** Settings → Pages → **Deploy from a branch** → `gh-pages` / `(root)`.

**Stabilize → sync → publish:**

```bash
# 1) Work locally as usual (API + npm run dev)

# 2) When demo data should match local API:
cd frontend && npm run sync:demo

# 3) Preview static site (http://127.0.0.1:4173/mig_ai/)
npm run preview:pages

# 4) Publish when ready (updates gh-pages only; main/dev unchanged)
npm run publish:pages
```

CI alternative (same artifact): Actions → **Publish GitHub Pages** → Run workflow, or `git push origin HEAD:publish/pages`.

Live: **https://swap-innovation.github.io/mig_ai/** · Demo: **/demo/**

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
| 0 Mobilisation | Evidence checklist, §10 decisions, freeze register, team RACI, Platform Hub bind/probe, Ready gate |
| 1 Discovery | Estate sources, profiling, lineage, usage (query + report logs) |
| 2 Disposition | Migrate / rebuild / consolidate / retire + consumer notify/freeze |
| 3 SID mapping | Domain → entity → attribute, editable workbench, citations |
| 4 Metadata | Owner + steward, classification, completeness gate |
| 5 Pilot product | Party + Usage/Billing products, dual-run, pipeline, reconcile |
| 6 Cutover | Per-product dual-run checklist + consumer sign-off |
| 7 Decommission | Archive, hypercare, close change (Data Owner for final decommission) |

### Workspace UI

After login, open **http://localhost:3000/workspace** (legacy `/project` redirects here).

- **Dashboard** — portfolio KPIs across estates (not tied to the active project alone)
- **App Store** — accelerator / app catalogue entry
- **Projects** — switch estates; under each estate: **Stage map** + Discover→Retire tool links
- **Named tools** — `/workspace/tools/:toolId/:view` (Atlas, Horizon, Verdict, Compass, Forge, Prove, Transit, Sunset)
- Legacy `/workspace/phase/*` redirects into suite tool routes
- Right-rail **Mirage** chat scoped to the active estate; About / Activity / Sign out in the project chrome

### Screenshot notes (demo / Docs)

Regenerate Docs captures with UI on `:3000` and API on `:8001` (see `frontend/.env.local`):

```bash
node Docs/assets/capture-screenshots.mjs
```

| # | Route | What to show |
|---|---|---|
| 1 | `/workspace` | Dashboard — portfolio KPIs, Portfolio health, Activity over time |
| 2 | `/workspace/gallery` | Stage map — Discover→Retire (Atlas→Sunset) |
| 3 | `/workspace/tools/atlas/sources` | Estate bind / ZIP / Git |
| 4 | `/workspace/tools/atlas/profiling` | Profiling (after Activity scan) |
| 5 | `/workspace/tools/atlas/lineage` | Lineage |
| 6 | `/workspace/tools/horizon/overview` | Wave plan overview |
| 7 | `/workspace/tools/verdict/board` | Disposition board |
| 8 | `/workspace/tools/compass/workbench` | SID mapping workbench |
| 9 | `/workspace/tools/forge/pipelines` | Pipeline Migration (DAGs → Composer) |
| 10 | `/workspace/tools/prove/reviews` | Prove reviews inbox |
| 11 | `/workspace/tools/transit/signoff` | Production sign-off |
| 12 | `/workspace/tools/sunset/archive` | Sunset archive |

Inventory + captions: [Docs/assets/screenshots/README.md](Docs/assets/screenshots/README.md). Use `viewer@demo.local` where PII masking should be shown.

### Phase 1 discovery (async)

1. **Sources** — bind sample project, upload a ZIP, or clone Git (`POST …/estate/git`, re-sync via `…/estate/git/sync`).
2. **Run discovery** — `POST …/discovery/run` returns immediately with `run_id` (worker continues in background). Concurrent runs return **409**.
3. **Console** — poll `GET …/discovery/runs/{run_id}` for live steps (scan → parse SQL/scripts/scheduler → catalog → persist).
4. Agents in Phases 1/3/5 likewise queue in the background; the shared agent panel polls while status is `queued` / `running`.

Workspaces for uploads/clones: `sample-data/workspaces/<project_id>/` (gitignored).

## Brand

**Mirage** — professional global product brand (magenta accent `#E20074`, ink `#0B1220`, IBM Plex Sans). Sample data and APIs are brand-agnostic; UI chrome uses Mirage design tokens.
