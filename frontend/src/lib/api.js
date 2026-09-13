import { supabase } from "./supabase";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  parsePortfolio: (text) => request("/api/portfolio/parse", { method: "POST", body: JSON.stringify({ text }) }),
  getPortfolio: () => request("/api/portfolio"),
  saveHoldings: (holdings) => request("/api/portfolio", { method: "POST", body: JSON.stringify({ holdings }) }),
  deleteHolding: (id) => request(`/api/portfolio/${id}`, { method: "DELETE" }),
  getQuotes: (tickers) => request(`/api/market/quotes?tickers=${encodeURIComponent(tickers.join(","))}`),
  getIndexes: () => request("/api/market/indexes"),
  getHistory: (ticker, range) => request(`/api/market/history/${ticker}?range=${range}`),
  getOutlook: (ticker) => request(`/api/outlook/${ticker}`),
};
