/**
 * Capture Mirage workspace screenshots for Docs.
 * Requires local UI :3000 and API :8000.
 */
import { chromium } from "/tmp/pw-shot/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "screenshots");
mkdirSync(OUT, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:8000";

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

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.waitForTimeout(900);
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

const shots = [
  { name: "01-login", path: "/" },
  { name: "02-workspace-home", path: "/workspace" },
  { name: "03-discovery-inventory", path: "/workspace/tools/atlas/profiling" },
  { name: "04-disposition-board", path: "/workspace/tools/verdict/board" },
  { name: "05-align-workbench", path: "/workspace/tools/compass/workbench" },
  { name: "06-build-dags", path: "/workspace/tools/forge/dags" },
  { name: "07-pilot-reviews", path: "/workspace/tools/prove/reviews" },
  { name: "08-migrate-signoff", path: "/workspace/tools/transit/signoff" },
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
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ token }) => {
    localStorage.setItem(
      "mcp_session",
      JSON.stringify({
        token,
        role: "architect",
        name: "Alex Architect",
        email: "architect@demo.local",
      })
    );
    localStorage.setItem("mirage_active_project_id", "5");
  },
  { token }
);

for (const s of shots) {
  await page.goto(BASE + s.path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape").catch(() => {});
  await shot(page, s.name);
}

await browser.close();
console.log("done");
