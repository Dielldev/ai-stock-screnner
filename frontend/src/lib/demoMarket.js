/* Deterministic market simulator for the public demo build.
   No backend, no API keys, no CORS: every number below is generated locally from
   a seeded PRNG. Same ticker always yields the same series, so charts stay stable
   across reloads and the UI behaves like it does against the real API.
   Nothing here is real market data. */

const ANCHOR = Date.UTC(2024, 0, 2); // walk starts here so history is absolute, not relative to "today"
const DAY_MS = 86400000;

/** FNV-1a: string -> stable 32-bit seed. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal from a seeded stream (Box–Muller). */
function gauss(rnd) {
  const u1 = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rnd());
}

/** One fixed shock per (seed, day) pair, so a given date never re-rolls. */
function shock(seed, dayIndex) {
  return gauss(mulberry32(seed ^ Math.imul(dayIndex + 1, 0x9e3779b1)));
}

const isWeekend = (ms) => {
  const d = new Date(ms).getUTCDay();
  return d === 0 || d === 6;
};

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Every weekday from ANCHOR through today, as epoch ms. */
function tradingDays() {
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = [];
  for (let ms = ANCHOR; ms <= end; ms += DAY_MS) {
    if (!isWeekend(ms)) days.push(ms);
  }
  return days;
}

let dayCache = null;
let dayCacheKey = "";
function days() {
  const key = isoDate(Date.now());
  if (dayCacheKey !== key) {
    dayCache = tradingDays();
    dayCacheKey = key;
  }
  return dayCache;
}

/** Per-ticker character: starting level, volatility, drift. */
function profile(ticker) {
  const seed = hash(`folio:${ticker.toUpperCase()}`);
  const rnd = mulberry32(seed);
  return {
    seed,
    base: 18 + rnd() * 520,
    vol: 0.008 + rnd() * 0.026,
    drift: (rnd() - 0.42) * 0.0018,
  };
}

const seriesCache = new Map();

/** Full geometric random walk for a ticker: [{ date, close }] ending today. */
export function series(ticker) {
  const key = `${ticker.toUpperCase()}:${isoDate(Date.now())}`;
  const hit = seriesCache.get(key);
  if (hit) return hit;

  const { seed, base, vol, drift } = profile(ticker);
  const list = days();
  const out = new Array(list.length);
  let level = base;

  for (let i = 0; i < list.length; i += 1) {
    level *= Math.exp(drift + vol * shock(seed, i));
    level = Math.max(level, 1.5); // keep it off the floor
    out[i] = { date: isoDate(list[i]), close: Math.round(level * 100) / 100 };
  }

  seriesCache.set(key, out);
  return out;
}

const RANGE_DAYS = { "7d": 7, "1m": 22, "3m": 65 };

export function history(ticker, range) {
  const points = series(ticker);
  const span = RANGE_DAYS[range] ?? RANGE_DAYS["1m"];
  return { ticker: ticker.toUpperCase(), range, points: points.slice(-span) };
}

export function quote(ticker) {
  const points = series(ticker);
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? last;
  const changePercent = prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
  return {
    ticker: ticker.toUpperCase(),
    price: last.close,
    previous_close: prev.close,
    change_percent: Math.round(changePercent * 100) / 100,
  };
}

/* ---------- indicators (real math, simulated inputs) ---------- */

function sma(closes, period) {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  return window.reduce((a, b) => a + b, 0) / period;
}

/** Wilder-smoothed RSI. */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

export function indicators(ticker) {
  const points = series(ticker);
  const closes = points.map((p) => p.close);
  const price = closes[closes.length - 1];
  const last30 = closes.slice(-30);
  const ref30 = last30[0];
  const sma50 = sma(closes, 50);

  return {
    price,
    change_30d_percent: ref30 ? round1(((price - ref30) / ref30) * 100) : null,
    high_30d: round2(Math.max(...last30)),
    low_30d: round2(Math.min(...last30)),
    rsi_14: round1(rsi(closes)),
    sma_50: round2(sma50),
    price_vs_sma50_percent: sma50 ? round1(((price - sma50) / sma50) * 100) : null,
  };
}

/* ---------- outlook ---------- */

/** Sentiment is a plain rule over the simulated indicators — no model, no news. */
function readSentiment({ rsi_14: r, price_vs_sma50_percent: vsSma, change_30d_percent: chg }) {
  let score = 0;
  if (r != null) score += r > 60 ? 1 : r < 40 ? -1 : 0;
  if (vsSma != null) score += vsSma > 2 ? 1 : vsSma < -2 ? -1 : 0;
  if (chg != null) score += chg > 4 ? 1 : chg < -4 ? -1 : 0;
  return score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
}

function describe(ticker, sentiment, ind) {
  const trend =
    ind.price_vs_sma50_percent == null
      ? "sitting near its 50-day average"
      : ind.price_vs_sma50_percent > 0
        ? `trading ${ind.price_vs_sma50_percent.toFixed(1)}% above its 50-day average`
        : `trading ${Math.abs(ind.price_vs_sma50_percent).toFixed(1)}% below its 50-day average`;

  const momentum =
    ind.rsi_14 == null
      ? "Momentum is unreadable on this sample."
      : ind.rsi_14 > 70
        ? `RSI at ${ind.rsi_14.toFixed(1)} puts it in overbought territory.`
        : ind.rsi_14 < 30
          ? `RSI at ${ind.rsi_14.toFixed(1)} puts it in oversold territory.`
          : `RSI at ${ind.rsi_14.toFixed(1)} is mid-range — neither stretched nor washed out.`;

  const shape =
    sentiment === "bullish"
      ? "The simulated series has been making higher lows."
      : sentiment === "bearish"
        ? "The simulated series has been stair-stepping lower."
        : "The simulated series has been range-bound.";

  return `Demo reading for ${ticker}: the sample series is ${trend}, with a 30-day move of ${
    ind.change_30d_percent == null ? "—" : `${ind.change_30d_percent > 0 ? "+" : ""}${ind.change_30d_percent.toFixed(1)}%`
  }. ${momentum} ${shape} These figures come from a random-walk generator, not from a market feed — they illustrate the interface only.`;
}

const RISKS = [
  "Every price, indicator, and sentiment call on this page is randomly generated — it describes no real company.",
  "The generator has no notion of earnings, guidance, or macro events, so it cannot be right or wrong about them.",
  "Indicator math is real but the inputs are synthetic; treat crossovers here as UI behaviour, not signal.",
];

export function outlook(ticker) {
  const symbol = ticker.toUpperCase();
  const ind = indicators(symbol);
  const sentiment = readSentiment(ind);
  return {
    ticker: symbol,
    sentiment,
    summary: describe(symbol, sentiment, ind),
    risks: RISKS,
    indicators: ind,
    headlines: [], // no fabricated news in the demo
    earnings: null,
    generated_at: new Date().toISOString(),
  };
}

/* ---------- indexes ---------- */

const INDEXES = [
  { symbol: "^GSPC", name: "S&P 500", base: 5600 },
  { symbol: "^DJI", name: "Dow Jones", base: 41200 },
  { symbol: "^IXIC", name: "Nasdaq", base: 17800 },
];

/** 40 intraday points across one simulated session, fixed for the calendar day. */
export function indexes() {
  const today = isoDate(Date.now());
  const dayIndex = Math.floor((Date.now() - ANCHOR) / DAY_MS);

  return INDEXES.map(({ symbol, name, base }) => {
    const seed = hash(`folio:index:${symbol}`);
    const rnd = mulberry32(seed ^ Math.imul(dayIndex + 1, 0x85ebca6b));
    const open = base * (1 + (rnd() - 0.5) * 0.06);

    const points = [];
    let level = open;
    for (let i = 0; i < 40; i += 1) {
      level *= Math.exp((rnd() - 0.5) * 0.0022);
      const minutes = 570 + i * 10; // 09:30 -> 16:00 ET
      const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
      const mm = String(minutes % 60).padStart(2, "0");
      points.push({ time: `${today}T${hh}:${mm}:00`, close: Math.round(level * 100) / 100 });
    }

    const close = points[points.length - 1].close;
    return {
      symbol,
      name,
      price: close,
      change_percent: Math.round(((close - open) / open) * 10000) / 100,
      points,
    };
  });
}
