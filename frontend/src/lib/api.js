/* Demo API: the same surface the FastAPI backend exposed, served entirely from the
   browser. Holdings live in localStorage; prices come from the local simulator in
   demoMarket.js. Swapping this file back for the network client restores the real app. */

import * as market from "./demoMarket.js";

const HOLDINGS_KEY = "folio-demo-holdings";
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000000";

/** Small delay so loading skeletons and disabled states still get exercised. */
const settle = (value, ms = 140) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const newId = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

function readHoldings() {
  try {
    const raw = JSON.parse(localStorage.getItem(HOLDINGS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeHoldings(rows) {
  try {
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify(rows));
  } catch {
    /* private mode or quota — the session still works, it just won't persist */
  }
  return rows;
}

export function clearDemoData() {
  [HOLDINGS_KEY, "folio-watchlist", "folio-demo-profile", "folio-default-range"].forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
}

/* ---------- free-text portfolio parsing (was a Groq call) ---------- */

const TICKER_RE = /^[A-Z][A-Z.\-]{0,6}$/;

/** Common names so "12 Apple at 200" resolves without a model. */
const NAMES = {
  apple: "AAPL", microsoft: "MSFT", amazon: "AMZN", google: "GOOGL", alphabet: "GOOGL",
  meta: "META", facebook: "META", nvidia: "NVDA", tesla: "TSLA", netflix: "NFLX",
  disney: "DIS", walmart: "WMT", costco: "COST", visa: "V", mastercard: "MA",
  intel: "INTC", "amd": "AMD", broadcom: "AVGO", palantir: "PLTR", coinbase: "COIN",
  starbucks: "SBUX", nike: "NKE", boeing: "BA", ford: "F", uber: "UBER",
  airbnb: "ABNB", shopify: "SHOP", salesforce: "CRM", oracle: "ORCL", adobe: "ADBE",
};

/* Words that look like tickers but aren't. */
const STOPWORDS = new Set([
  "I", "A", "AN", "AND", "AT", "THE", "OF", "IN", "ON", "MY", "ALSO", "BUY", "BOUGHT",
  "HOLD", "HOLDING", "SHARE", "SHARES", "AVG", "AVERAGE", "PRICE", "EACH", "FOR", "WITH",
  "PLUS", "TO", "IS", "ARE", "HAVE", "HAS", "OWN", "OWNS", "ABOUT", "AROUND", "USD",
]);

const num = (raw) => Number.parseFloat(raw.replace(/,/g, ""));

function findTicker(segment) {
  const lower = segment.toLowerCase();
  for (const [name, symbol] of Object.entries(NAMES)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) return symbol;
  }
  const candidates = segment.match(/\b[A-Za-z][A-Za-z.\-]{0,6}\b/g) ?? [];
  for (const raw of candidates) {
    const token = raw.toUpperCase();
    if (STOPWORDS.has(token)) continue;
    if (raw !== token) continue; // only trust tokens written in caps
    if (TICKER_RE.test(token)) return token;
  }
  return null;
}

/** "NVDA 10 shares at $180 avg" -> { ticker, shares, avg_price }. */
function parseSegment(segment) {
  const ticker = findTicker(segment);
  if (!ticker) return null;

  const priceMatch =
    segment.match(/(?:at|@|avg\.?|average)\s*(?:price\s*)?(?:of\s*)?\$?\s*([\d,]+(?:\.\d+)?)/i) ??
    segment.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!priceMatch) return null;

  const rest = segment.replace(priceMatch[0], " ");
  const shareMatch =
    rest.match(/([\d,]+(?:\.\d+)?)\s*(?:shares?|sh\b|units?)/i) ??
    rest.match(/([\d,]+(?:\.\d+)?)/);
  if (!shareMatch) return null;

  const shares = num(shareMatch[1]);
  const avgPrice = num(priceMatch[1]);
  if (!Number.isFinite(shares) || shares <= 0) return null;
  if (!Number.isFinite(avgPrice) || avgPrice < 0) return null;

  return { ticker, shares, avg_price: avgPrice };
}

function parseText(text) {
  const segments = String(text)
    .split(/[,;\n]|\band\b|\balso\b|\bplus\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const holdings = [];
  const ignored = [];
  const seen = new Set();

  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (!parsed) {
      if (/\d/.test(segment) || /[A-Z]{2,}/.test(segment)) ignored.push(segment);
      continue;
    }
    if (seen.has(parsed.ticker)) continue;
    seen.add(parsed.ticker);
    holdings.push(parsed);
  }

  return { holdings, ignored };
}

/* ---------- the api surface ---------- */

export const api = {
  parsePortfolio: (text) => {
    const result = parseText(text);
    if (!result.holdings.length && !result.ignored.length) {
      result.ignored.push(
        "Couldn't read that. Try: NVDA 10 shares at $180, VOO 5 shares at $490."
      );
    }
    return settle(result, 260);
  },

  getPortfolio: () => settle(readHoldings()),

  saveHoldings: (holdings) => {
    const existing = readHoldings();
    const incoming = holdings.map((h) => ({
      id: newId(),
      user_id: DEMO_USER_ID,
      ticker: h.ticker.toUpperCase(),
      shares: h.shares,
      avg_price: h.avg_price,
      created_at: new Date().toISOString(),
    }));
    const replaced = new Set(incoming.map((h) => h.ticker));
    const merged = [...existing.filter((h) => !replaced.has(h.ticker)), ...incoming];
    return settle(writeHoldings(merged));
  },

  deleteHolding: (id) => settle(writeHoldings(readHoldings().filter((h) => h.id !== id))).then(() => null),

  getQuotes: (tickers) => settle(tickers.map((t) => market.quote(t))),

  getIndexes: () => settle(market.indexes(), 220),

  getHistory: (ticker, range) => settle(market.history(ticker, range)),

  getOutlook: (ticker) => settle(market.outlook(ticker), 420),
};
