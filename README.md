# Folio — AI Portfolio Tracker

Track your stock portfolio by describing it in plain English. Folio parses your holdings with an
LLM, tracks live prices and P&L, and generates an **AI Outlook** per stock — a 3–5 day sentiment
read built from technical indicators, news headlines, and the company's latest SEC filing.

> AI Outlooks are sentiment analysis, **not** price predictions and not financial advice.

## Features

- **Plain-English portfolio input** — "I hold NVDA 10 shares at $180 avg and VOO 5 at $490" is
  parsed by Groq (`llama-3.3-70b-versatile`) into structured holdings, previewed, then saved.
- **Live dashboard** — per-holding cards with current price, day change, market value, and
  green/red P&L, plus a portfolio summary strip.
- **Price charts** — Recharts area charts with a 7d / 1m / 3m timeframe toggle (yfinance data).
- **AI Outlook** — on demand, the backend gathers in parallel: 30-day price action + RSI(14) +
  50-day MA (yfinance + pandas-ta), the latest Yahoo Finance headlines (ranked for relevance with
  Hugging Face embeddings), and the latest earnings filing from SEC EDGAR (8-K press release or
  10-Q/10-K excerpt). Groq synthesizes a sentiment badge (bullish / neutral / bearish), a short
  outlook summary, and key risks.
- **Auth** — Supabase Google OAuth, Apple OAuth, and email/password. The FastAPI backend verifies
  the Supabase JWT on every protected route, and PostgreSQL Row Level Security guarantees users
  only ever touch their own rows.

## Architecture

```
React (Vite + Tailwind v4, Vercel)
        │  Authorization: Bearer <supabase JWT>
        ▼
FastAPI (Render) ── verifies JWT ──► Supabase Auth (Google / Apple / email)
        │                            Supabase Postgres (portfolios table, RLS)
        ├─► Groq        llama-3.3-70b-versatile (parsing + outlook)
        ├─► yfinance    prices, history; pandas-ta for RSI / SMA
        ├─► Yahoo RSS   news headlines
        ├─► Hugging Face all-MiniLM-L6-v2 (headline relevance ranking)
        └─► SEC EDGAR   latest earnings filing (no key required)
```

## Project structure

```
/frontend        React app (Vite + Tailwind v4 + Recharts)
/backend         FastAPI app
  /app/routers   portfolio, market, outlook endpoints
  /app/services  db (Supabase REST), llm (Groq), market_data, news, edgar, embeddings
/supabase        schema.sql (table + RLS policies)
render.yaml      Render blueprint for the backend
```

## Prerequisites

- **Python 3.12 or 3.13** for the backend (pandas-ta → numba does not support 3.14 yet; on 3.14
  the app still runs — it computes RSI/SMA with pandas directly — but install deps without
  `pandas-ta`)
- **Node 20+** for the frontend
- Accounts: [Supabase](https://supabase.com), [Groq](https://console.groq.com),
  [Hugging Face](https://huggingface.co) (free tiers all work)

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. **Database** — open *SQL Editor*, paste the contents of [`supabase/schema.sql`](supabase/schema.sql),
   and run it. This creates the `portfolios` table with RLS policies (users can only read/write
   their own rows).
3. **Email auth** — enabled by default (*Authentication → Providers → Email*).
4. **Google OAuth** — *Authentication → Providers → Google*: enable it, then create an OAuth
   client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (type *Web application*) with the authorized redirect URI Supabase shows you
   (`https://<project-ref>.supabase.co/auth/v1/callback`). Paste the client ID + secret back into
   Supabase.
5. **Apple OAuth** — *Authentication → Providers → Apple*: requires an Apple Developer account
   (Services ID, Team ID, Key ID, and a private key). The button is wired up in the frontend and
   works as soon as the provider is configured; skip it during development if you don't have an
   Apple Developer account.
6. **Redirect URLs** — *Authentication → URL Configuration*: set *Site URL* to your frontend URL
   and add `http://localhost:5173` (and later your Vercel URL) to *Redirect URLs*.
7. **Collect credentials** (*Project Settings → API*):
   - Project URL → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - JWT Secret (*JWT Settings*, the legacy HS256 secret) → `SUPABASE_JWT_SECRET`

   > Newer Supabase projects can use asymmetric JWT signing keys. The backend handles both: HS256
   > tokens are verified with `SUPABASE_JWT_SECRET`; RS256/ES256 tokens are verified against the
   > project's public JWKS endpoint automatically (the env var is still required by config).

## 2. Backend — run locally

```bash
cd backend
python3.12 -m venv .venv          # or python3.13
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env              # then fill in your values
uvicorn app.main:app --reload --port 8000
```

- Interactive API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/healthz
- On Python 3.14 only: `grep -v pandas-ta requirements.txt | pip install -r /dev/stdin`
  (the app falls back to pandas implementations of RSI/SMA).

## 3. Frontend — run locally

```bash
cd frontend
npm install
cp .env.example .env              # then fill in your values
npm run dev                       # http://localhost:5173
```

## Environment variables

**Backend (`backend/.env`)**

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL, e.g. `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | Public anon key (sent to PostgREST with the user's JWT, so RLS applies) |
| `SUPABASE_JWT_SECRET` | yes | Legacy JWT secret used to verify HS256 access tokens |
| `GROQ_API_KEY` | yes | From [console.groq.com/keys](https://console.groq.com/keys) |
| `HF_API_KEY` | no | Hugging Face token; without it headlines keep feed order instead of embedding-ranked order |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins, e.g. `http://localhost:5173,https://yourapp.vercel.app` |
| `CORS_ORIGIN_REGEX` | no | e.g. `https://.*\.vercel\.app` to allow Vercel preview deploys |
| `SEC_EDGAR_USER_AGENT` | yes | EDGAR requires a descriptive UA with contact info, e.g. `folio you@example.com` |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile` |

**Frontend (`frontend/.env`)**

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Same project URL |
| `VITE_SUPABASE_ANON_KEY` | Same anon key |
| `VITE_API_URL` | Backend base URL (`http://localhost:8000` locally, your Render URL in prod) |

## Deployment

Push this repository to GitHub first (`git init && git add -A && git commit -m "init"`).

### Backend → Render

Option A — blueprint: Render Dashboard → *New → Blueprint*, point it at the repo;
[`render.yaml`](render.yaml) configures the service. Fill in the env vars when prompted.

Option B — manual: *New → Web Service*, connect the repo and set:

- **Root directory:** `backend`
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment:** every backend variable from the table above, plus `PYTHON_VERSION=3.12.8`
- **Health check path:** `/healthz`

### Frontend → Vercel

1. Vercel → *Add New → Project*, import the repo.
2. **Root directory:** `frontend` (framework preset: Vite; `vercel.json` already handles SPA
   routing for React Router).
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` (your Render URL,
   e.g. `https://ai-portfolio-tracker-api.onrender.com`).
4. Deploy.

### Wire them together (after first deploy)

- Add the Vercel URL to the backend's `CORS_ORIGINS` on Render.
- Add the Vercel URL to Supabase *Authentication → URL Configuration* (Site URL + Redirect URLs).
- Update the Google OAuth consent screen / credentials if you restrict origins.

## API reference

All `/api/*` routes require `Authorization: Bearer <supabase access token>`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/healthz` | Liveness probe (public) |
| POST | `/api/portfolio/parse` | `{ "text": "..." }` → parsed `{ holdings, ignored }` (preview, nothing saved) |
| GET | `/api/portfolio` | List the user's holdings |
| POST | `/api/portfolio` | `{ "holdings": [{ticker, shares, avg_price}] }` → upsert (merges on ticker) |
| DELETE | `/api/portfolio/{id}` | Remove a holding |
| GET | `/api/market/quotes?tickers=NVDA,VOO` | Batch quotes: price, previous close, day change % |
| GET | `/api/market/history/{ticker}?range=7d\|1m\|3m` | Chart points (7d is hourly, 1m/3m daily) |
| GET | `/api/outlook/{ticker}` | AI Outlook: sentiment, summary, risks, indicators, headlines, filing |

## Implementation notes

- **Security model** — the backend verifies the Supabase JWT (audience `authenticated`) on every
  protected route, then forwards the *user's own token* to Supabase PostgREST. RLS is therefore
  enforced end-to-end; the backend holds no service-role key at all.
- **Embeddings** — `all-MiniLM-L6-v2` (HF Inference API, sentence-similarity pipeline) scores the
  ~10 fetched headlines against "{company} stock performance, earnings and outlook" and the top 5
  go into the outlook prompt. Ranking is best-effort and degrades to feed order on any failure.
- **SEC EDGAR** — prefers the latest 8-K reporting item 2.02 (Results of Operations) and extracts
  the EX-99 press release (exhibit located via the filing index page, since exhibit filenames are
  arbitrary); falls back to the latest 10-Q/10-K primary document. ETFs (no EDGAR presence) simply
  omit the filing section. Responses are cached for 24h; EDGAR requires the descriptive
  `SEC_EDGAR_USER_AGENT`.
- **Caching** — in-process TTL caches: quotes 60s, history 5min, outlooks 15min per ticker. Single
  instance only; swap for Redis if you scale out.
- **pandas-ta** — pinned to `0.4.71b0`, which requires Python 3.12/3.13 (numba). The market-data
  service falls back to pandas-native RSI (Wilder smoothing) and SMA when `pandas_ta` isn't
  importable, so the API also runs on Python 3.14.
- **Charts** — `7d` uses hourly candles' closes; `1m`/`3m` use daily closes. The 50-day MA and RSI
  are computed from 6 months of daily history.

## Disclaimer

This project is for educational purposes. Market data may be delayed or inaccurate. AI Outlooks
are automated sentiment analysis of public data and must not be treated as investment advice.
