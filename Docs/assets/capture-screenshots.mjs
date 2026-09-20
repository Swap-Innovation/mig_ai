/**
 * Capture Mirage workspace screenshots for Docs.
 * Requires local UI :3000 and API matching NEXT_PUBLIC_API_URL (default :8001).
 *
 * Usage:
 *   node Docs/assets/capture-screenshots.mjs
 */
import { chromium } from "/tmp/pw-shot/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "screenshots");
mkdirSync(OUT, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.MIRAGE_UI_URL || "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

async function loginToken() {
  const body = new URLSearchParams({
    username: "architect@demo.local",
    password: "demo",
  });
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  const data = await r.json();
  return data.access_token;
}

async function pickProjectId(token) {
  const r = await fetch(`${API}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`projects failed ${r.status}`);
  const data = await r.json();
  const items = Array.isArray(data)
    ? data
    : data.projects || data.items || data.data || [];
  const prefer =
    items.find((p) => (p.slug || p.id || "") === "party-customer-wave1") ||
    items.find((p) => String(p.name || "").toLowerCase().includes("party")) ||
    items[0];
  if (!prefer) throw new Error("no projects returned");
  const id = prefer.id ?? prefer.project_id;
  console.log("using project", id, prefer.slug || prefer.name || "");
  return String(id);
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.waitForTimeout(400);
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

async function gotoShot(page, { name, path, expectTitle }) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForURL((u) => u.pathname.includes(path.split("?")[0].replace(/\/$/, "") || path), {
    timeout: 30000,
  }).catch(() => {});
  if (expectTitle) {
    await page
      .getByRole("heading", { name: expectTitle })
      .first()
      .waitFor({ state: "visible", timeout: 30000 })
      .catch(async () => {
        // Fallback: any heading containing the token
        await page.locator("h1, h2").filter({ hasText: expectTitle }).first().waitFor({
          state: "visible",
          timeout: 10000,
        });
      });
  } else {
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape").catch(() => {});
  const heading = (
    await page.locator("h1, h2").first().textContent().catch(() => "")
  )
    ?.trim()
    .slice(0, 80);
  console.log(`capture ${name} @ ${page.url().replace(BASE, "")} | ${heading}`);
  await shot(page, name);
}

/** Stable Docs filenames + expanded suite coverage for the current app shell. */
const shots = [
  { name: "01-login", path: "/", expectTitle: null, authed: false },
  { name: "02-workspace-home", path: "/workspace", expectTitle: "Dashboard", authed: true },
  { name: "02b-suite-gallery", path: "/workspace/gallery", expectTitle: "Stage map", authed: true },
  {
    name: "03-discovery-inventory",
    path: "/workspace/tools/atlas/profiling",
    expectTitle: "Profiling",
    authed: true,
  },
  {
    name: "03b-atlas-sources",
    path: "/workspace/tools/atlas/sources",
    expectTitle: "Source",
    authed: true,
  },
  {
    name: "03c-atlas-lineage",
    path: "/workspace/tools/atlas/lineage",
    expectTitle: "Lineage",
    authed: true,
  },
  {
    name: "04-disposition-board",
    path: "/workspace/tools/verdict/board",
    expectTitle: "Board",
    authed: true,
  },
  {
    name: "04b-horizon-overview",
    path: "/workspace/tools/horizon/overview",
    expectTitle: "Overview",
    authed: true,
  },
  {
    name: "05-align-workbench",
    path: "/workspace/tools/compass/workbench",
    expectTitle: "Workbench",
    authed: true,
  },
  {
    name: "06-build-dags",
    path: "/workspace/tools/forge/pipelines",
    expectTitle: "Pipeline Migration",
    authed: true,
  },
  {
    name: "06b-forge-suite",
    path: "/workspace/tools/forge/suite",
    expectTitle: "Forge",
    authed: true,
  },
  {
    name: "07-pilot-reviews",
    path: "/workspace/tools/prove/reviews",
    expectTitle: "Reviews",
    authed: true,
  },
  {
    name: "08-migrate-signoff",
    path: "/workspace/tools/transit/signoff",
    expectTitle: "Sign-off",
    authed: true,
  },
  {
    name: "09-sunset-archive",
    path: "/workspace/tools/sunset/archive",
    expectTitle: "Archive",
    authed: true,
  },
];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const token = await loginToken();
const projectId = await pickProjectId(token);

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1000);
await shot(page, "01-login");

await page.evaluate(
  ({ token, projectId }) => {
    localStorage.setItem(
      "mcp_session",
      JSON.stringify({
        token,
        role: "architect",
        name: "Alex Architect",
        email: "architect@demo.local",
      })
    );
    localStorage.setItem("mirage_active_project_id", projectId);
  },
  { token, projectId }
);

for (const s of shots) {
  if (!s.authed) continue;
  await gotoShot(page, s);
}

await browser.close();
console.log("done");
