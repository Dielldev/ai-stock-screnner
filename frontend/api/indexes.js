/* GET /api/indexes -> intraday performance of the S&P 500, Nasdaq and Dow. */

import { indexes } from "./_lib/market.js";
import { route, send } from "./_lib/http.js";

export default route(["GET"], async (_req, res) => {
  send(res, 200, await indexes(), 120);
});
