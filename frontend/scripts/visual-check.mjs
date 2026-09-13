/* Headless visual verification: screenshots + console error audit.
   Usage: node scripts/visual-check.mjs */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const OUT = new URL("../shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PROJECT_REF = "ajfyjdqphnrusmvzowvw";
const YEAR = 365 * 24 * 3600;
const fakeSession = {
  access_token: "fake-access-token",
  token_type: "bearer",
  expires_in: YEAR,
  expires_at: Math.floor(Date.now() / 1000) + YEAR,
  refresh_token: "fake-refresh-token",
  user: {
    id: "00000000-0000-4000-8000-000000000000",
    aud: "authenticated",
    role: "authenticated",
    email: "demo@folio.app",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
};

const history = (base, drift) => ({
  points: Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
    const close = base * (1 + drift * (i / 29) + Math.sin(i * 0.9) * 0.012);
    return { date, close: Math.round(close * 100) / 100 };
  }),
});

const MOCKS = {
  portfolio: [
    { id: "1", ticker: "NVDA", shares: 10, avg_price: 180 },
    { id: "2", ticker: "VOO", shares: 5, avg_price: 490 },
    { id: "3", ticker: "AAPL", shares: 12, avg_price: 200 },
  ],
  quotes: [
    { ticker: "NVDA", price: 206.41, change_percent: 2.87 },
    { ticker: "VOO", price: 677.83, change_percent: 0.41 },
    { ticker: "AAPL", price: 197.12, change_percent: -0.62 },
    { ticker: "TSLA", price: 241.07, change_percent: -0.93 },
    { ticker: "MSFT", price: 512.44, change_percent: 0.66 },
  ],
  outlook: {
    sentiment: "bullish",
    summary:
      "Momentum stays constructive after a strong data-center quarter; dips toward the 50-day average keep getting bought. Watch for digestion after the recent run, but flows and guidance revisions still lean positive over the next few sessions.",
    indicators: { rsi_14: 61.2, price_vs_sma50_percent: 4.8, change_30d_percent: 9.1 },
    earnings: { form: "10-Q", filed: "2026-05-28" },
    risks: [
      "Valuation leaves little room for guidance misses",
      "Export-control headlines can gap the stock pre-market",
    ],
    headlines: [
      { title: "NVIDIA extends AI accelerator lead as hyperscaler capex rises", link: "https://example.com/1" },
      { title: "Supply chain checks point to steady Blackwell shipments", link: "https://example.com/2" },
      { title: "Analysts lift price targets after data-center beat", link: "https://example.com/3" },
    ],
  },
};

const issues = [];

async function preparePage(page, { auth = false } = {}) {
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const text = msg.text();
      if (text.includes("React DevTools")) return;
      issues.push(`[console.${msg.type()}] ${page.url()} :: ${text}`);
    }
  });
  page.on("pageerror", (err) => issues.push(`[pageerror] ${page.url()} :: ${err.message}`));
  page.on("requestfailed", (req) => {
    if (req.url().startsWith(BASE) || req.url().includes("localhost:8000"))
      issues.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`);
  });

  await page.route("**/localhost:8000/api/**", (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ json: body });
    if (url.includes("/api/portfolio")) return json(MOCKS.portfolio);
    if (url.includes("/api/market/quotes")) return json(MOCKS.quotes);
    if (url.includes("/api/market/history/NVDA")) return json(history(190, 0.09));
    if (url.includes("/api/market/history/VOO")) return json(history(660, 0.025));
    if (url.includes("/api/market/history/AAPL")) return json(history(205, -0.04));
    if (url.includes("/api/market/history/")) return json(history(300, 0.02));
    if (url.includes("/api/outlook/")) return json(MOCKS.outlook);
    return json({});
  });

  if (auth) {
    await page.addInitScript(
      ([key, session]) => {
        window.localStorage.setItem(key, JSON.stringify(session));
        window.localStorage.setItem("folio-watchlist", JSON.stringify(["TSLA", "MSFT", "NVDA"]));
      },
      [`sb-${PROJECT_REF}-auth-token`, fakeSession]
    );
  }
}

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`  ✓ ${name}`);
}

async function scrollTo(page, selector, settle = 1700) {
  // Drive Lenis directly (deterministic), fall back to native scroll.
  const found = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -60, immediate: true });
    else el.scrollIntoView();
    return true;
  }, selector);
  if (!found) {
    issues.push(`[missing] ${selector}`);
    return;
  }
  await page.waitForTimeout(settle);
}

async function waitReady(page) {
  await page.waitForSelector("html[data-lp-ready]", { timeout: 20000 });
  await page.waitForTimeout(900); // bot entrance tail
}

const browser = await chromium.launch();

/* ---------- landing: desktop ---------- */
{
  console.log("landing / desktop");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await preparePage(page);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shoot(page, "01-landing-hero-desktop");
  await scrollTo(page, ".lp-statement");
  await shoot(page, "02-landing-statement-desktop");
  await scrollTo(page, "#speak");
  await shoot(page, "03-landing-vignette-desktop");
  await scrollTo(page, "#method");
  await page.waitForTimeout(800);
  await shoot(page, "04-landing-method-desktop");
  await page.hover(".lp-row:nth-child(2)");
  await page.waitForTimeout(650);
  await shoot(page, "05-landing-method-hover-desktop");
  await scrollTo(page, ".lp-stats");
  await shoot(page, "06-landing-stats-desktop");
  await scrollTo(page, ".lp-cta");
  await shoot(page, "07-landing-cta-desktop");
  await scrollTo(page, ".lp-footer-legal", 2000);
  await shoot(page, "08-landing-footer-desktop");
  await ctx.close();
}

/* ---------- landing: mobile ---------- */
{
  console.log("landing / mobile");
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await preparePage(page);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await waitReady(page);
  await shoot(page, "09-landing-hero-mobile");
  await scrollTo(page, "#speak");
  await shoot(page, "10-landing-vignette-mobile");
  await scrollTo(page, "#method");
  await shoot(page, "11-landing-method-mobile");
  await scrollTo(page, ".lp-footer-legal", 2000);
  await shoot(page, "12-landing-footer-mobile");
  await ctx.close();
}

/* ---------- login ---------- */
{
  console.log("login");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await preparePage(page);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shoot(page, "13-login-desktop");
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mpage = await mctx.newPage();
  await preparePage(mpage);
  await mpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(900);
  await shoot(mpage, "14-login-mobile");
  await mctx.close();
}

/* ---------- app pages (mocked auth + api) ---------- */
{
  console.log("app / desktop");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await preparePage(page, { auth: true });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  await shoot(page, "15-dash-overview-desktop");
  await page.getByRole("button", { name: /Brief me on/ }).click();
  await page.waitForTimeout(900);
  await shoot(page, "16-dash-overview-brief-desktop");

  await page.goto(`${BASE}/dashboard/positions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const outlookBtn = page.getByRole("button", { name: "AI Outlook" }).first();
  await outlookBtn.click();
  await page.waitForTimeout(900);
  await shoot(page, "17-dash-positions-desktop");

  await page.goto(`${BASE}/dashboard/watchlist`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  await shoot(page, "18-dash-watchlist-desktop");

  await page.goto(`${BASE}/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1100);
  await shoot(page, "19-dash-profile-desktop");
  await ctx.close();

  console.log("app / mobile");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mpage = await mctx.newPage();
  await preparePage(mpage, { auth: true });
  await mpage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(1600);
  await shoot(mpage, "20-dash-overview-mobile");
  await mpage.goto(`${BASE}/dashboard/positions`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(1400);
  await shoot(mpage, "21-dash-positions-mobile");
  await mctx.close();
}

await browser.close();

console.log("\n--- console / network audit ---");
if (issues.length === 0) {
  console.log("clean: no console errors, page errors, or failed requests");
} else {
  issues.forEach((i) => console.log(i));
  process.exitCode = 1;
}
