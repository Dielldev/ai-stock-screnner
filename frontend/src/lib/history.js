import { api } from "./api";

const cache = new Map();

/** Memoized price history fetch shared across pages (key: ticker + range). */
export function getHistoryCached(ticker, range) {
  const key = `${ticker}:${range}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      api.getHistory(ticker, range).catch((err) => {
        cache.delete(key);
        throw err;
      })
    );
  }
  return cache.get(key);
}
