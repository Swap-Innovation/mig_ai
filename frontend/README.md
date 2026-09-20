# Frontend — Mirage Suite

Next.js 14 UI. Local development talks to the FastAPI backend; the GitHub Pages build runs entirely in **demo mode** (client-side mock API + fixtures).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local UI (needs API) |
| `npm run build` | Standard Next build |
| `npm run build:pages` | Static export for GitHub Pages (`DEMO_MODE` + `basePath=/mig_ai`) |

## Demo mode

When `NEXT_PUBLIC_DEMO_MODE=1`:

- [`lib/api.ts`](./lib/api.ts) routes all calls through [`lib/demo/mockApi.ts`](./lib/demo/mockApi.ts)
- Fixtures live in [`lib/demo/fixtures/`](./lib/demo/fixtures/)
- `/demo` seeds an architect session and opens `/workspace`
- Mutations return simulated success (fixtures are not mutated)

## Routes

| Path | Role |
| --- | --- |
| `/` | Marketing homepage |
| `/demo` | One-click demo launch |
| `/login` | Persona sign-in |
| `/workspace/*` | Control-plane app |
