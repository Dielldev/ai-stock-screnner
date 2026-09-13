# AI Architecture — Folio (AI Portfolio Tracker)

This document explains, in depth, how AI is used in this project: the two AI features, every
step of their pipelines, what gets parsed, what gets validated, and the design decisions behind
each choice. It's written as interview prep — read top to bottom and you should be able to
whiteboard the whole thing.

---

## 1. The two AI features, in one sentence each

1. **Natural-language portfolio parsing** — turns free text like *"I hold NVDA 10 shares at $180
   avg"* into structured `{ticker, shares, avg_price}` rows, via an LLM call with a strict JSON
   contract, then double-validated before it ever touches the database.
2. **AI Outlook** — a per-ticker, on-demand sentiment read (bullish/neutral/bearish) synthesized
   by an LLM from three independently-fetched data sources: technical indicators, ranked news
   headlines, and an SEC filing excerpt. This is the more interesting one architecturally — it's
   a small retrieval-augmented generation (RAG) pipeline.

Both features share the same LLM provider (**Groq**, running `llama-3.3-70b-versatile`), the
same "JSON-mode + Pydantic" validation pattern, and the same philosophy: **the model never gets
to invent facts — it only gets to organize and interpret facts that were fetched from real
sources and handed to it in the prompt.**

---

## 2. Feature 1 — Natural-language portfolio parsing

**Files:** `backend/app/services/llm.py` (`parse_holdings_text`), `backend/app/routers/portfolio.py`
(`POST /api/portfolio/parse`), `backend/app/schemas.py` (`HoldingIn`, `ParseRequest`), frontend
`PortfolioInput.jsx`.

### Pipeline

```
User types free text
   │
   ▼
POST /api/portfolio/parse   { text: "I hold NVDA 10 shares at $180 avg..." }
   │  Pydantic: ParseRequest(text: str, min_length=3, max_length=2000)
   ▼
Groq chat.completions.create(
    model="llama-3.3-70b-versatile",
    response_format={"type": "json_object"},   ← forces valid JSON out
    temperature=0.0,                            ← deterministic extraction, no creativity
    system=PARSE_SYSTEM_PROMPT, user=text
)
   │
   ▼
Raw JSON: {"holdings":[{"ticker":"NVDA","shares":10,"avg_price":180.0}], "ignored":[...]}
   │
   ▼
Per-item Pydantic validation: HoldingIn.model_validate(item)
   - ticker must match TICKER_RE (^[A-Za-z][A-Za-z0-9.\-]{0,9}$), normalized to uppercase
   - shares must be > 0
   - avg_price must be >= 0
   - any item that fails validation is dropped into `ignored` with a reason — never silently lost
   │
   ▼
ParseResponse{ holdings, ignored }  →  returned to frontend as a PREVIEW (nothing saved yet)
   │
   ▼
User reviews the parsed table in PortfolioInput.jsx, can remove rows, then clicks "Save"
   │
   ▼
POST /api/portfolio  (separate endpoint, re-validates with SaveHoldingsRequest) → upsert in Supabase
```

### What it parses
Free-form English describing one or more holdings — ticker or company name, share count,
average cost (or a total cost the model divides by share count).

### What it validates
- **Input bound**: request text is capped at 2000 chars (abuse/cost control) and floored at 3
  chars (`ParseRequest`).
- **Structural contract**: `response_format={"type": "json_object"}` — Groq enforces the model
  emits a JSON object, not commentary or Markdown fences. This alone doesn't guarantee the
  *shape* is right, only that it's parseable JSON.
- **Semantic contract, twice**:
  1. The system prompt tells the model the exact shape and the rule "if you're not confident,
     don't guess — put it in `ignored`" (this is the important anti-hallucination instruction:
     it gives the model an explicit escape hatch instead of forcing a fabricated number).
  2. Regardless of what the model claims, every parsed holding is re-validated server-side
     against `HoldingIn` (ticker regex, `shares > 0`, `avg_price >= 0`). The LLM is **never
     trusted as the source of truth for correctness** — it's trusted only to extract; Pydantic
     is the actual gate.
- **Human-in-the-loop gate**: even after passing validation, holdings are only a *preview*. Save
  is a distinct, explicit user action and a distinct API call. The AI never writes to the
  database directly.

### Why these design choices (likely interview questions)
- *"Why temperature 0?"* — this is extraction, not generation. You want the same input to
  produce the same output every time, and you want the model to stick to what's stated rather
  than being creative about ambiguous phrasing.
- *"What stops the LLM from hallucinating a ticker or price?"* — three layers: (1) the prompt
  explicitly forbids guessing and gives it an `ignored` bucket instead, (2) Pydantic validation
  rejects anything malformed after the fact, (3) the user visually confirms the parsed table
  before anything persists.
- *"What if Groq returns malformed JSON or the call fails?"* — the router catches any exception
  from `llm.parse_holdings_text` and returns HTTP 502 with the underlying error message rather
  than a raw 500; the frontend surfaces `err.message` directly to the user.

---

## 3. Feature 2 — AI Outlook (the RAG-style pipeline)

**Files:** `backend/app/routers/outlook.py`, `backend/app/services/{market_data,news,edgar,embeddings,llm}.py`,
frontend `OutlookPanel.jsx`.

This is the most architecturally interesting part of the project: **retrieval, then ranking,
then grounded generation** — a small, deliberately simple RAG pipeline without a vector
database, built from three independent live data sources.

### High-level flow

```
GET /api/outlook/{ticker}   (ticker normalized + regex-validated: normalize_ticker())
   │
   ├─ cache check: 15-min in-process TTL cache, keyed by ticker → if hit, return immediately
   │
   ▼ (cache miss) — fetch all three sources CONCURRENTLY via asyncio.gather(..., return_exceptions=True)
   │
   ├──► market_data.fetch_indicators(ticker)      [yfinance + pandas-ta, run in a thread]
   ├──► news.fetch_headlines(ticker, limit=10)    [Yahoo Finance RSS feed]
   └──► edgar.fetch_latest_earnings(ticker)       [SEC EDGAR public API]
   │
   ▼
Any of the three can fail independently — each failure is caught, logged, and the pipeline
degrades gracefully (empty headlines / no filing section / etc.) EXCEPT indicators: if
indicators are unavailable, the whole request 404s (there's no meaningful outlook without a
price series).
   │
   ▼
embeddings.rank_headlines(query, headlines, top_k=5)
   - Only runs if there are more than 5 headlines to begin with (cheap short-circuit)
   - Calls Hugging Face's hosted sentence-similarity pipeline for all-MiniLM-L6-v2
   - Sends {source_sentence: "{Company} ({TICKER}) stock performance, earnings and outlook",
            sentences: [headline titles]}
   - Gets back a similarity score per headline, sorts descending, keeps top 5
   - Best-effort: any failure (no API key, network error, malformed response) → returns
     headlines[:top_k] in original feed order instead. The outlook still generates; it's just
     not relevance-ranked.
   │
   ▼
_build_context(ticker, indicators, headlines, earnings)
   - Assembles ONE plain-text block: current price, 30-day change, 30-day range, RSI(14),
     50-day SMA + price vs. it, last 10 daily closes, the ranked headlines, and the SEC filing
     excerpt (or "none found" for ETFs/funds).
   - This text block IS the retrieved context — it's the "R" in RAG. Nothing else is given to
     the model; no external knowledge, no chat history.
   │
   ▼
llm.generate_outlook(context)
   Groq chat.completions.create(
       model="llama-3.3-70b-versatile",
       response_format={"type": "json_object"},
       temperature=0.3,     ← slightly non-zero: synthesizing prose, not extracting facts
       system=OUTLOOK_SYSTEM_PROMPT, user=context
   )
   │
   ▼
Raw JSON: {"sentiment": "bullish", "summary": "...", "risks": ["...", ...]}
   │
   ▼
Post-generation validation (NOT Pydantic this time — manual coercion, see below)
   │
   ▼
OutlookResponse (Pydantic model) — cached for 15 min, returned to frontend
```

### The three retrieval sources, in detail

| Source | Service | What it fetches | Parsing involved |
|---|---|---|---|
| **Technicals** | `market_data.py` (yfinance) | 6 months of daily closes → current price, 30-day % change, 30-day high/low, RSI(14), 50-day SMA, price vs. SMA, last 10 closes | RSI computed via `pandas-ta` when available (Python 3.12/3.13 + numba); otherwise a hand-rolled Wilder's-smoothing RSI implemented directly on a `pandas` Series so the app still works on Python 3.14. This is a nice detail to mention: **the same numeric contract, two implementations, chosen at import time** (`try: import pandas_ta as ta / except ImportError: ta = None`). |
| **News** | `news.py` (Yahoo Finance RSS) | Up to 10 recent headlines per ticker | RSS/XML parsed with `feedparser` (run in a thread since it's sync); HTML entities in titles unescaped; feed fetch itself wrapped in try/except → empty list on any HTTP failure, never raises. |
| **Filing excerpt** | `edgar.py` (SEC EDGAR) | Latest earnings-relevant filing text | Multi-step parsing: (1) fetch SEC's ticker→CIK map once and cache it in memory, (2) fetch the company's filing list, (3) pick the newest 8-K with item "2.02" (Results of Operations) — falling back to the newest 10-Q/10-K if no such 8-K exists, (4) for 8-Ks, parse the filing's index HTML page (regex over `<tr>` rows) to find the actual EX-99 press-release exhibit, since exhibit filenames are arbitrary per company, (5) stream-download the document capped at 1.5 MB, (6) strip HTML tags/scripts/styles with regex + `html.unescape`, (7) truncate to 8000 chars. Result cached 24h. Entirely best-effort: ETFs have no EDGAR presence and simply get `earnings: null`. |

### Why concurrent fetch with `return_exceptions=True`
`asyncio.gather(..., return_exceptions=True)` means one slow/broken data source (say, Yahoo RSS
is down) doesn't take down the other two or the whole request. Each result is checked with
`isinstance(x, BaseException)` and swapped for a safe default (`[]`, `None`) with a logged
warning. This is the single most important resilience pattern in the outlook pipeline — it's
the difference between "flaky third-party API" and "user-facing 500."

### Why embeddings ranking exists at all
Ten raw RSS headlines for a ticker are often noisy (unrelated market-wide news, old recycled
stories). Instead of just handing the LLM everything, headlines are pre-filtered by *semantic
relevance* to a fixed query string before they ever reach the prompt. This keeps the prompt
smaller/cheaper and keeps the LLM's summary anchored to headlines that are actually about the
company's performance/earnings/outlook — a small but real RAG-style retrieval-then-rerank step.
It's explicitly optional/best-effort (`HF_API_KEY` unset → skip straight to feed order) so the
core feature never has a hard dependency on a second AI provider.

### Output validation — the "grounding + guardrails" layer

The `OUTLOOK_SYSTEM_PROMPT` carries the actual safety/quality constraints as instructions (this
is prompt-level guardrailing, not code-level):
- Must be sentiment analysis of the *next 3–5 trading days*, explicitly **not a price
  prediction and not financial advice**.
- Must ground every claim in the *provided data only* — told not to rely on outside/pretrained
  knowledge of recent events (important: reduces hallucination and stale-knowledge errors from
  the base model's training cutoff).
- Must pick "neutral" and explain why when the data is mixed/weak — gives the model permission
  to say "not sure" instead of forcing a confident answer.
- Explicitly forbidden from giving price targets or buy/sell recommendations.

Code-level validation after the call, in `outlook.py`:
```python
sentiment = str(verdict.get("sentiment", "")).lower()
if sentiment not in ("bullish", "neutral", "bearish"):
    sentiment = "neutral"                      # allowlist, safe default on drift
summary = str(verdict.get("summary", "")).strip() or "No summary was generated."
risks = [str(r).strip() for r in verdict.get("risks", []) if str(r).strip()][:5]  # capped, cleaned
```
This is deliberately **not** Pydantic-validated the same strict way as the portfolio parser,
because free-text prose doesn't have a "correctness" contract the way a ticker/share count
does — the risk here isn't "wrong data," it's "malformed enum or empty field," so simple
allowlisting + defensive coercion is the appropriate (lighter) amount of validation. This is
worth being able to articulate: **validation strictness is matched to what can actually go
wrong with that particular field**, not applied uniformly everywhere.

The `Indicators` Pydantic model *is* still used to shape the numeric data going back to the
frontend (`Indicators(**{k: v for k, v in indicators.items() if k in Indicators.model_fields})`),
filtering out any stray keys before they hit the response schema.

### Caching strategy (all in-process `TTLCache`, `cache.py`)

| Data | TTL | Why |
|---|---|---|
| Quotes | 60s | Prices move fast but polling is cheap; short TTL keeps the dashboard near-live. |
| Price history | 5 min | Charts don't need second-level freshness. |
| Index performance | 5 min | Same reasoning, less critical data. |
| SEC filings | 24h | Filings don't change intraday; avoids hammering EDGAR (10 req/s cap). |
| **AI Outlook (whole response)** | 15 min | The expensive step — 3 network fetches + an embeddings call + an LLM call — is cached as a unit per ticker, so repeated views/refreshes within 15 min are free and instant. |

Explicitly noted in code/README as **single-instance only** (an in-memory dict, not Redis) —
a known, deliberate scaling limitation for what's currently a single-process deployment.

---

## 4. Cross-cutting design decisions worth knowing cold

**Why Groq specifically?** Groq runs open-weight models (`llama-3.3-70b-versatile`) on custom
inference hardware (LPUs) that's dramatically faster than typical GPU-hosted inference. Both AI
features are synchronous request/response calls sitting in a user-facing HTTP request — parsing
happens while the user waits for a preview, and the outlook happens while the user waits for a
panel to render. Low latency matters more here than having the single most capable model.

**Why `response_format={"type": "json_object"}` (JSON mode) everywhere?** Both prompts ask for
"ONLY a JSON object in this exact shape." JSON mode is Groq/OpenAI-style structured output: it
constrains decoding so the model can't wrap the answer in prose or Markdown fences, which
would otherwise break `json.loads()`. It doesn't guarantee the *keys* are right — hence the
Pydantic/allowlist validation layer that always follows.

**Why is the LLM never the source of truth for numbers?** Every hard fact that reaches the model
— price, RSI, SMA, filing text, headlines — was fetched from a deterministic external source
(yfinance, SEC EDGAR, Yahoo RSS) *before* the LLM ever runs. The model's only job is to
synthesize/summarize/extract from that context, never to "know" a number on its own. This is
the core anti-hallucination architecture choice underlying both features, and it's the single
best thing to say if asked "how do you keep the AI from making things up."

**Auth boundary around AI endpoints.** Every `/api/*` route, including both AI endpoints, sits
behind `Depends(get_current_user)`, which verifies the Supabase-issued JWT (HS256 via shared
secret, or RS256/ES256 via Supabase's JWKS endpoint) before any AI/network call happens. So the
AI features cost real money per call (Groq + HF API usage) and are never reachable
unauthenticated — a basic but important cost/abuse control.

**Everything is best-effort except the one thing that can't be.** News, embeddings ranking, and
SEC filings all degrade to an empty/absent state on failure. Only market indicators are a hard
dependency (404 without them) — you cannot label a stock's "3-5 day outlook" with zero price
data, but you can absolutely do it with no news or no filing.

---

## 5. Likely interview questions and how to answer them

- **"Walk me through what happens when a user clicks 'Get AI Outlook'."** → Use the pipeline
  diagram in §3: cache check, three parallel fetches with graceful degradation, embeddings
  rerank, context assembly, single Groq call in JSON mode, allowlist validation, cache write,
  response.

- **"How do you prevent the LLM from hallucinating?"** → Three-part answer: (1) the model only
  ever sees data you fetched and put in the prompt, never asked to use outside knowledge (and
  the prompt says so explicitly); (2) deterministic, code-level validation always runs after
  generation — Pydantic for the parser, allowlisting/coercion for the outlook; (3) for the
  parser specifically, the user visually confirms the extracted table before it's saved.

- **"Why two different validation strategies (strict Pydantic vs. allowlist+coercion)?"** →
  Match validation cost to what can actually go wrong. Structured numeric data (tickers, share
  counts) has an objective correctness contract, so it gets strict typed validation. Free-text
  sentiment/summary/risks don't have one "right" answer — the risk is malformed shape, not wrong
  content — so lightweight coercion with safe defaults is the right amount of rigor.

- **"What happens if Groq is down?"** → Both endpoints wrap the LLM call in try/except and
  surface a `502` with the underlying error, rather than a raw crash. For the outlook, this
  happens *after* the (cheaper) data-gathering step — the retrieval and generation stages are
  isolated on purpose so you know exactly which side any given error belongs to.

- **"Is this actually RAG?"** → It's a lightweight, purpose-built version: retrieval from
  multiple structured/unstructured live sources (not a vector DB), an embedding-based rerank
  step to filter the retrieved set, then grounded generation constrained to that context. No
  chunking/vector-store infrastructure because the "corpus" per request is small and
  fetched fresh (10 headlines, one filing excerpt, one indicator set) — a vector DB would be
  overkill for a single-document, single-request retrieval scope.

- **"How would you scale this?"** → The in-process TTL caches are the first thing called out as
  a limitation — swap for Redis (or similar shared cache) to share cache state across multiple
  backend instances. The LLM calls themselves are already stateless and horizontally scalable.
