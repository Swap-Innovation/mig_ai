# Frontend — Mirage Suite

Two separate setups. Do not mix them.

| Profile | How to run | Backend | Config |
| --- | --- | --- | --- |
| **Local** | `npm run dev` | Live FastAPI | `.env.local` (from `.env.local.example`) |
| **Published** | `npm run publish:pages` | None (mock fixtures) | `.env.pages` (committed) |

## Local development

```bash
cp .env.local.example .env.local   # once
# edit API URL if needed (default http://127.0.0.1:8001)
npm install
npm run dev
```

Local never sets `DEMO_MODE` or `BASE_PATH`. The UI talks to the API in `.env.local`.

## Published site (GitHub Pages)

Static export with in-browser mock API. Built only from `.env.pages`.

```bash
npm run sync:demo        # optional: refresh fixtures from local API
npm run preview:pages    # build + serve at http://127.0.0.1:4173/mig_ai/
npm run publish:pages    # build + force-push branch gh-pages
```

Or trigger CI: **Actions → Publish GitHub Pages → Run workflow**, or `git push origin HEAD:publish/pages`.

### One-time GitHub setting

**Settings → Pages → Build and deployment → Source: Deploy from a branch**  
**Branch: `gh-pages` / `(root)`**

Site: https://swap-innovation.github.io/mig_ai/  
Demo: https://swap-innovation.github.io/mig_ai/demo/

## Sync mechanism (local → publish)

1. Develop and stabilize on `main` with `npm run dev` + backend.
2. When demo data should match local: `npm run sync:demo` (API must be running).
3. Preview: `npm run preview:pages`.
4. Publish when ready: `npm run publish:pages` (does not change how local `dev` runs).

`main` pushes do **not** auto-publish the site.
