/* GET /api/outlook?ticker=NVDA -> Groq's short-term read from live technicals + headlines. */

import { groqJson } from "./_lib/groq.js";
import { headlines, indicators } from "./_lib/market.js";
import { cached, normalizeTicker, query, route, send, ttlCache } from "./_lib/http.js";

const SYSTEM_PROMPT = `You are an equity research assistant producing a short-term "AI Outlook" — a sentiment
analysis, NOT a price prediction and NOT financial advice.
You will receive technical indicators and recent news headlines.

Respond with ONLY a JSON object in this exact shape:
{"sentiment": "bullish", "summary": "...", "risks": ["...", "...", "..."]}

Rules:
- sentiment: one of "bullish", "neutral", "bearish" — the overall tone for the next 3-5 trading days
  that the data supports.
- summary: 2-4 plain-English sentences. Cite the strongest specific evidence (RSI level, price vs the
  50-day average, 30-day move, a headline).
- risks: 3 to 5 short, concrete risk factors for this security right now.
- Ground every claim in the provided data only. If the data is mixed or thin, choose "neutral" and say why.
- Never give price targets, buy/sell recommendations, or financial advice.`;

const SENTIMENTS = ["bullish", "neutral", "bearish"];
const outlookCache = ttlCache(15 * 60_000, 200);

const signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

function buildContext(ticker, ind, news) {
  const lines = [`TICKER: ${ticker} (${ind.name})`, "", "TECHNICALS (daily):", `- Current price: $${ind.price.toFixed(2)}`];
  if (ind.change_30d_percent != null) lines.push(`- 30-day change: ${signed(ind.change_30d_percent)}`);
  lines.push(`- 30-day range: $${ind.low_30d.toFixed(2)} to $${ind.high_30d.toFixed(2)}`);
  if (ind.rsi_14 != null) lines.push(`- RSI (14-day): ${ind.rsi_14.toFixed(1)}`);
  if (ind.sma_50 != null)
    lines.push(`- 50-day moving average: $${ind.sma_50.toFixed(2)} (price is ${signed(ind.price_vs_sma50_percent)} vs it)`);
  lines.push(`- Last 10 daily closes: ${ind.recent_closes.map((c) => `${c.date}: ${c.close}`).join(", ")}`);
  lines.push("", "RECENT NEWS HEADLINES:");
  lines.push(...(news.length ? news.map((h) => `- ${h.title}`) : ["- No recent headlines found."]));
  return lines.join("\n");
}

async function buildOutlook(ticker) {
  const [ind, news] = await Promise.all([indicators(ticker), headlines(ticker)]);
  const verdict = await groqJson(SYSTEM_PROMPT, buildContext(ticker, ind, news), { temperature: 0.3 });

  const sentiment = String(verdict.sentiment ?? "").toLowerCase();
  const { name: _name, recent_closes: _recent, ...publicIndicators } = ind;
  return {
    ticker,
    sentiment: SENTIMENTS.includes(sentiment) ? sentiment : "neutral",
    summary: String(verdict.summary ?? "").trim() || "No summary was generated.",
    risks: (Array.isArray(verdict.risks) ? verdict.risks : []).map((r) => String(r).trim()).filter(Boolean).slice(0, 5),
    indicators: publicIndicators,
    headlines: news,
    earnings: null,
    generated_at: new Date().toISOString(),
  };
}

export default route(["GET"], async (req, res) => {
  const ticker = normalizeTicker(query(req).get("ticker"));
  send(res, 200, await cached(outlookCache, ticker, () => buildOutlook(ticker)), 900);
});
