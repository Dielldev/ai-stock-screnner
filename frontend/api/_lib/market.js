/* Market data from Yahoo Finance's public chart endpoint (no key needed), cached in memory.
   Responses are also edge-cached by each route via Cache-Control. */

import { HttpError, cached, ttlCache } from "./http.js";

// Keep this short: a full browser UA from a non-browser TLS client gets 429'd by Yahoo.
const UA = "Mozilla/5.0";
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

const quoteCache = ttlCache(60_000);
const historyCache = ttlCache(5 * 60_000);
const indexCache = ttlCache(2 * 60_000);
const indicatorCache = ttlCache(10 * 60_000);
const newsCache = ttlCache(15 * 60_000);

async function fetchChart(symbol, params) {
  const qs = new URLSearchParams({ includePrePost: "false", ...params }).toString();
  let lastError;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => null);
      const result = data?.chart?.result?.[0];
      if (result) return result;
      if (res.status === 404 || data?.chart?.error?.code === "Not Found") {
        throw new HttpError(404, `No market data found for ${symbol}`);
      }
      lastError = new HttpError(502, `Market feed returned ${res.status} for ${symbol}`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof HttpError ? lastError : new HttpError(502, "Market feed is unavailable right now");
}

/** [{ t: epoch seconds, close }] with nulls dropped. */
function closes(result) {
  const ts = result.timestamp ?? [];
  const raw = result.indicators?.quote?.[0]?.close ?? [];
  const out = [];
  for (let i = 0; i < ts.length; i += 1) {
    if (raw[i] != null && Number.isFinite(raw[i])) out.push({ t: ts[i], close: raw[i] });
  }
  return out;
}

const round = (v, dp = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);
const isoDate = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
const isoTime = (sec) => new Date(sec * 1000).toISOString();

/* ---------- quotes ---------- */

export async function quote(ticker) {
  const result = await cached(quoteCache, ticker, () =>
    fetchChart(ticker, { range: "1d", interval: "1d" })
  );
  const meta = result.meta ?? {};
  const price = meta.regularMarketPrice ?? closes(result).at(-1)?.close ?? null;
  const previous = meta.previousClose ?? meta.chartPreviousClose ?? null;
  return {
    ticker,
    price: round(price, 4),
    previous_close: round(previous, 4),
    change_percent: price != null && previous ? round(((price - previous) / previous) * 100) : null,
  };
}

export function quotes(tickers) {
  return Promise.all(
    tickers.map((t) =>
      quote(t).catch(() => ({ ticker: t, price: null, previous_close: null, change_percent: null }))
    )
  );
}

/* ---------- history ---------- */

const DAY = 86400;
const RANGES = {
  // a rolling 7 calendar days of hourly bars
  "7d": {
    params: () => {
      const now = Math.floor(Date.now() / 1000);
      return { period1: String(now - 7 * DAY), period2: String(now), interval: "60m" };
    },
    intraday: true,
  },
  "1m": { params: () => ({ range: "1mo", interval: "1d" }), intraday: false },
  "3m": { params: () => ({ range: "3mo", interval: "1d" }), intraday: false },
};

export const RANGE_KEYS = Object.keys(RANGES);

export async function history(ticker, rangeKey) {
  const spec = RANGES[rangeKey];
  const result = await cached(historyCache, `${ticker}:${rangeKey}`, () =>
    fetchChart(ticker, spec.params())
  );
  const points = closes(result).map(({ t, close }) => ({
    date: spec.intraday ? isoTime(t) : isoDate(t),
    close: round(close, 4),
  }));
  if (!points.length) throw new HttpError(404, `No price history found for ${ticker}`);
  return { ticker, range: rangeKey, points };
}

/* ---------- indexes ---------- */

const INDEXES = [
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq"],
  ["^DJI", "Dow Jones"],
];

export async function indexes() {
  const settled = await Promise.allSettled(
    INDEXES.map(async ([symbol, name]) => {
      const result = await cached(indexCache, symbol, () =>
        fetchChart(symbol, { range: "1d", interval: "5m" })
      );
      const meta = result.meta ?? {};
      const points = closes(result).map(({ t, close }) => ({ time: isoTime(t), close: round(close) }));
      const price = meta.regularMarketPrice ?? points.at(-1)?.close;
      const previous = meta.previousClose ?? meta.chartPreviousClose;
      return {
        symbol,
        name,
        price: round(price),
        change_percent: price != null && previous ? round(((price - previous) / previous) * 100) : null,
        points,
      };
    })
  );
  const rows = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!rows.length) throw new HttpError(502, "Index data is unavailable right now");
  return rows;
}

/* ---------- indicators (for the AI outlook) ---------- */

function sma(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/** Wilder-smoothed RSI. */
function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export async function indicators(ticker) {
  const result = await cached(indicatorCache, ticker, () =>
    fetchChart(ticker, { range: "6mo", interval: "1d" })
  );
  const series = closes(result);
  if (series.length < 2) throw new HttpError(404, `No market data found for ${ticker}`);

  const values = series.map((p) => p.close);
  const price = result.meta?.regularMarketPrice ?? values.at(-1);
  const last30 = values.slice(-30);
  const sma50 = sma(values, 50);
  return {
    name: result.meta?.longName || result.meta?.shortName || ticker,
    price: round(price, 4),
    change_30d_percent: round((price / last30[0] - 1) * 100),
    high_30d: round(Math.max(...last30), 4),
    low_30d: round(Math.min(...last30), 4),
    rsi_14: round(rsi(values), 1),
    sma_50: round(sma50, 4),
    price_vs_sma50_percent: sma50 ? round((price / sma50 - 1) * 100) : null,
    recent_closes: series.slice(-10).map(({ t, close }) => ({ date: isoDate(t), close: round(close) })),
  };
}

/* ---------- headlines ---------- */

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

export function headlines(ticker, limit = 6) {
  return cached(newsCache, ticker, async () => {
    try {
      const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
      return items
        .map((item) => ({
          title: tag(item, "title"),
          link: tag(item, "link"),
          published: tag(item, "pubDate") || null,
        }))
        .filter((h) => h.title)
        .slice(0, limit);
    } catch {
      return [];
    }
  });
}
