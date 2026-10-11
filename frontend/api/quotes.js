/* GET /api/quotes?tickers=NVDA,VOO -> [{ ticker, price, previous_close, change_percent }] */

import { quotes } from "./_lib/market.js";
import { HttpError, normalizeTicker, query, route, send } from "./_lib/http.js";

const MAX_TICKERS = 40;

export default route(["GET"], async (req, res) => {
  const raw = (query(req).get("tickers") ?? "").split(",").filter((t) => t.trim());
  const tickers = [...new Set(raw.map(normalizeTicker))].slice(0, MAX_TICKERS);
  if (!tickers.length) throw new HttpError(400, "No tickers provided");
  send(res, 200, await quotes(tickers), 60);
});
