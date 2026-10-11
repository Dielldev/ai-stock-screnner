import { useCallback, useEffect, useState } from "react";
import Panel from "../../components/Panel";
import TickerBadge from "../../components/TickerBadge";
import { PlusIcon, RefreshIcon, XIcon } from "../../components/icons";
import { useSearch } from "../../layouts/DashboardLayout";
import { api } from "../../lib/api";
import { dirGlyph, fmtCurrency, fmtPercent } from "../../lib/format";

const STORE_KEY = "folio-watchlist";

const readStore = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export default function Watchlist() {
  const { query } = useSearch();
  const [tickers, setTickers] = useState(readStore);
  const [quotes, setQuotes] = useState({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const persist = (next) => {
    setTickers(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  };

  const refresh = useCallback(async (list) => {
    if (!list.length) return;
    setBusy(true);
    setError("");
    try {
      const fetched = await api.getQuotes(list);
      setQuotes((q) => ({ ...q, ...Object.fromEntries(fetched.map((x) => [x.ticker, x])) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh(readStore());
  }, [refresh]);

  const add = async (event) => {
    event.preventDefault();
    const ticker = draft.trim().toUpperCase();
    if (!ticker || tickers.includes(ticker)) {
      setDraft("");
      return;
    }
    persist([...tickers, ticker]);
    setDraft("");
    refresh([ticker]);
  };

  const remove = (ticker) => persist(tickers.filter((t) => t !== ticker));

  const visible = tickers.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="microlabel mb-2">the ledger — watchlist</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Worth <span className="serif-accent">watching</span>
          </h1>
        </div>
        <button onClick={() => refresh(tickers)} disabled={busy || !tickers.length} className="btn-ghost">
          <RefreshIcon className="h-3.5 w-3.5" /> {busy ? "Refreshing…" : "Refresh quotes"}
        </button>
      </div>

      <Panel
        title="Tickers you're stalking"
        className="max-w-3xl"
        action={
          <form onSubmit={add} className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="add ticker"
              maxLength={6}
              className="w-28 rounded-full border border-ink/12 bg-paper px-3.5 py-1.5 font-mono text-xs uppercase transition placeholder:normal-case placeholder:text-ink/35 focus:border-cobalt/50 focus:outline-none"
            />
            <button type="submit" className="btn-primary px-3 py-1.5" aria-label="Add to watchlist">
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </form>
        }
      >
        {error && (
          <p className="mb-3 border-l-2 border-ink bg-ink/5 px-3 py-2 font-mono text-xs text-ink/70">{error}</p>
        )}

        {tickers.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-ink/20 px-6 py-12 text-center">
            <p className="font-mono text-sm text-ink/60">Nothing on watch.</p>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-ink/45">
              Add tickers you're curious about — folio keeps live quotes on them without touching
              your ledger.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-1 py-6 text-center font-mono text-xs text-ink/45">nothing matches “{query}”</p>
        ) : (
          <ul className="divide-y divide-ink/8">
            {visible.map((ticker) => {
              const quote = quotes[ticker];
              return (
                <li key={ticker} className="flex items-center gap-3.5 py-3">
                  <TickerBadge ticker={ticker} />
                  <span className="font-mono text-sm font-semibold">{ticker}</span>
                  <span className="flex-1 border-b border-dotted border-ink/20" />
                  <span className="tnum font-mono text-sm">
                    {quote?.price != null ? fmtCurrency(quote.price) : <span className="text-ink/30">—</span>}
                  </span>
                  {quote?.change_percent != null && (
                    <span
                      className={`tnum rounded-full px-2 py-0.5 font-mono text-[11px] ${
                        quote.change_percent > 0 ? "bg-sky-soft text-cobalt" : "bg-ink/5 text-ink/55"
                      }`}
                    >
                      {dirGlyph(quote.change_percent)} {fmtPercent(quote.change_percent)}
                    </span>
                  )}
                  <button
                    onClick={() => remove(ticker)}
                    className="cursor-pointer p-1 text-ink/30 transition hover:text-ink"
                    aria-label={`Remove ${ticker} from watchlist`}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="microlabel mt-4">stored on this device · quotes via yahoo finance</p>
      </Panel>
    </>
  );
}
