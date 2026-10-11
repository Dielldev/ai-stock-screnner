/* GET /api/history?ticker=NVDA&range=1m -> { ticker, range, points: [{ date, close }] } */

import { RANGE_KEYS, history } from "./_lib/market.js";
import { HttpError, normalizeTicker, query, route, send } from "./_lib/http.js";

export default route(["GET"], async (req, res) => {
  const params = query(req);
  const ticker = normalizeTicker(params.get("ticker"));
  const range = params.get("range") ?? "1m";
  if (!RANGE_KEYS.includes(range)) throw new HttpError(400, `range must be one of ${RANGE_KEYS.join(", ")}`);
  send(res, 200, await history(ticker, range), 300);
});
