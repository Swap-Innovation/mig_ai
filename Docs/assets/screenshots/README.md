# Screenshots (live product)

Captures from the working Mirage Suite UI (regenerated Sep 2026). These are **not** Executive Briefing deck artwork — see [assets/deck/](../deck/) for briefing slides.

## Regenerate

With UI on `:3000` and API on `:8001` (or `NEXT_PUBLIC_API_URL`):

```bash
node Docs/assets/capture-screenshots.mjs
```

Uses demo user `architect@demo.local` / `demo` and the Party & Customer Account Wave-1 project when available.

## Inventory

| File | Route | Section / what to show |
| --- | --- | --- |
| `01-login.png` | `/` | Login |
| `02-workspace-home.png` | `/workspace` | **Dashboard** — portfolio KPIs across estates (Active / Gated / Complete, avoided objects, reconcile, sign-offs); Portfolio health stage mix; Activity over time; Mirage chat rail |
| `02b-suite-gallery.png` | `/workspace/gallery` | **Stage map** — Discover→Retire journey (Atlas→Sunset tools); Continue Discover; locked later stages |
| `03-discovery-inventory.png` | `/workspace/tools/atlas/profiling` | **Atlas · Profiling** — Discover tabs (Source, Activity, Profiling, Lineage, Review); Run profiling |
| `03b-atlas-sources.png` | `/workspace/tools/atlas/sources` | **Atlas · Source** — estate bind |
| `03c-atlas-lineage.png` | `/workspace/tools/atlas/lineage` | **Atlas · Lineage** |
| `04-disposition-board.png` | `/workspace/tools/verdict/board` | **Verdict · Board** — disposition decisions |
| `04b-horizon-overview.png` | `/workspace/tools/horizon/overview` | **Horizon · Overview** — wave plan |
| `05-align-workbench.png` | `/workspace/tools/compass/workbench` | **Compass · Workbench** — SID / reference mapping |
| `06-build-dags.png` | `/workspace/tools/forge/pipelines` | **Forge · Pipeline Migration** — DAGs/orchestration → Cloud Composer; Convert / Generate / Forge apps |
| `06b-forge-suite.png` | `/workspace/tools/forge/suite` | **Forge · Forge apps** — convert catalogue |
| `07-pilot-reviews.png` | `/workspace/tools/prove/reviews` | **Prove · Reviews** — HITL / dual-run inbox |
| `08-migrate-signoff.png` | `/workspace/tools/transit/signoff` | **Transit · Sign-off** — production readiness |
| `09-sunset-archive.png` | `/workspace/tools/sunset/archive` | **Sunset · Archive** — retirement |

## Shell chrome (all workspace shots)

- Left: Mirage Suite · Dashboard · App Store · PROJECTS · per-estate **Stage map** + Discover…Retire  
- Right: **Mirage** estate chat (“Message Mirage…”) scoped to the active project  
- Role chrome: architect / engineer / … from session  

## Honesty

Empty or gated states (e.g. “No profiling yet”, “Complete Align before generating the Build pack”) are valid captures of the current MVP sample estate — do not replace with deck mock KPIs from slide 9.
