/* Tiny helpers shared by the /api functions. Written against plain Node req/res so the
   same handlers run on Vercel and inside the Vite dev server (see vite.config.js). */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function query(req) {
  return new URL(req.url, "http://localhost").searchParams;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/** `cdnSeconds` lets Vercel's edge cache the response, so most visitors never reach the function. */
export function send(res, status, body, cdnSeconds = 0) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    cdnSeconds > 0
      ? `public, max-age=0, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds * 5}`
      : "no-store"
  );
  res.end(JSON.stringify(body));
}

/** Wraps a handler so thrown HttpErrors become JSON `{ detail }` responses. */
export function route(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return send(res, 405, { detail: "Method not allowed" });
    }
    try {
      await fn(req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(err);
      send(res, status, { detail: err.message || "Something went wrong" });
    }
  };
}

const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=^]{0,11}$/;

export function normalizeTicker(raw) {
  const ticker = String(raw ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) throw new HttpError(400, `Invalid ticker: ${raw}`);
  return ticker;
}

/** In-memory TTL cache; survives between invocations while a function instance is warm. */
export function ttlCache(ttlMs, maxEntries = 500) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expires) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= maxEntries) store.delete(store.keys().next().value);
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
  };
}

/** Caches a promise-returning fn by key; failed calls are not cached. */
export function cached(cache, key, fn) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const promise = fn().catch((err) => {
    cache.set(key, undefined);
    throw err;
  });
  cache.set(key, promise);
  return promise;
}
