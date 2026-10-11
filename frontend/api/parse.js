/* POST /api/parse { text } -> { holdings: [{ ticker, shares, avg_price }], ignored: [string] } */

import { groqJson } from "./_lib/groq.js";
import { HttpError, readJson, route, send } from "./_lib/http.js";

const SYSTEM_PROMPT = `You are a precise financial data extraction engine.
Extract stock/ETF/crypto holdings from the user's plain-English portfolio description.

Respond with ONLY a JSON object in this exact shape:
{"holdings": [{"ticker": "NVDA", "shares": 10, "avg_price": 180.0}], "ignored": []}

Rules:
- ticker: the uppercase Yahoo Finance symbol. Map company/fund names to their primary US ticker
  ("Apple" -> "AAPL", "Google" -> "GOOGL", "Vanguard S&P 500 ETF" -> "VOO", "Berkshire B" -> "BRK-B").
  Crypto uses the -USD suffix ("bitcoin" -> "BTC-USD").
- shares: number of shares/units held (fractional allowed). Words count: "a dozen" = 12, "ten" = 10.
- avg_price: average cost per share in USD as a plain number. "k" means thousand.
  If the user states a total cost instead, divide it by the share count.
- One entry per ticker. If the same ticker appears twice, combine into a weighted average.
- If shares or price is missing, or the security can't be confidently identified, leave it out of
  "holdings" and add a short human-readable reason to "ignored" (e.g. "TSLA: no average price given").
- Never invent values that are not stated or directly computable.`;

const MAX_TEXT = 2000;

export default route(["POST"], async (req, res) => {
  const { text } = await readJson(req).catch(() => ({}));
  const input = String(text ?? "").trim();
  if (input.length < 3) throw new HttpError(400, "Describe at least one holding.");
  if (input.length > MAX_TEXT) throw new HttpError(400, `Keep it under ${MAX_TEXT} characters.`);

  const out = await groqJson(SYSTEM_PROMPT, input);

  const holdings = [];
  const ignored = (Array.isArray(out.ignored) ? out.ignored : []).map(String).filter(Boolean);
  const seen = new Set();

  for (const row of Array.isArray(out.holdings) ? out.holdings : []) {
    const ticker = String(row?.ticker ?? "").trim().toUpperCase();
    const shares = Number(row?.shares);
    const avgPrice = Number(row?.avg_price);
    if (!/^[A-Z0-9^][A-Z0-9.\-=^]{0,11}$/.test(ticker)) continue;
    if (!(shares > 0) || !(avgPrice >= 0)) {
      ignored.push(`${ticker}: missing share count or price`);
      continue;
    }
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    holdings.push({ ticker, shares, avg_price: Math.round(avgPrice * 10000) / 10000 });
  }

  send(res, 200, { holdings, ignored });
});
