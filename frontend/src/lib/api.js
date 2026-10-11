/* API client. Market data and AI calls go to the Vercel functions in /api (Yahoo Finance
   feed, cached; Groq for parsing and outlooks). There are no accounts: holdings live in
   this browser's localStorage. */

const HOLDINGS_KEY = "folio-demo-holdings";
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000000";

const settle = (value) => Promise.resolve(value);

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

/* ---------- network (Vercel functions under /api) ---------- */

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
  return body;
}

/* ---------- the api surface ---------- */

export const api = {
  parsePortfolio: (text) =>
    request("parse", { method: "POST", body: JSON.stringify({ text }) }),

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

  getQuotes: (tickers) =>
    tickers.length
      ? request(`quotes?tickers=${encodeURIComponent([...new Set(tickers)].join(","))}`)
      : Promise.resolve([]),

  getIndexes: () => request("indexes"),

  getHistory: (ticker, range) =>
    request(`history?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`),

  getOutlook: (ticker) => request(`outlook?ticker=${encodeURIComponent(ticker)}`),
};
