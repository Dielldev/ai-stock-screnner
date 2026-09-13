import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { dirGlyph, fmtCurrency, fmtPercent, fmtShares, gainClass } from "../lib/format";
import OutlookPanel from "./OutlookPanel";
import PriceChart from "./PriceChart";
import { SparkIcon, TrashIcon } from "./icons";

const RANGES = ["7d", "1m", "3m"];

function LedgerRow({ label, value, accent = "text-ink" }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="microlabel">{label}</span>
      <span className="flex-1 border-b border-dotted border-ink/25" />
      <span className={`tnum font-mono text-[13px] ${accent}`}>{value}</span>
    </div>
  );
}

export default function HoldingCard({ holding, quote, onDelete, index }) {
  const { ticker, shares, avg_price } = holding;
  const [range, setRange] = useState(() => {
    const stored = localStorage.getItem("folio-default-range");
    return RANGES.includes(stored) ? stored : "1m";
  });
  const [points, setPoints] = useState(null); // null = loading, "error" = failed
  const chartCache = useRef({});

  const [outlook, setOutlook] = useState(null);
  const [outlookState, setOutlookState] = useState("idle"); // idle | loading | open | error
  const [outlookError, setOutlookError] = useState("");

  useEffect(() => {
    const cached = chartCache.current[range];
    if (cached) {
      setPoints(cached);
      return;
    }
    let active = true;
    setPoints(null);
    api
      .getHistory(ticker, range)
      .then((history) => {
        chartCache.current[range] = history.points;
        if (active) setPoints(history.points);
      })
      .catch(() => {
        if (active) setPoints("error");
      });
    return () => {
      active = false;
    };
  }, [ticker, range]);

  const fetchOutlook = async () => {
    if (outlookState === "open") {
      setOutlookState("idle");
      return;
    }
    if (outlook) {
      setOutlookState("open");
      return;
    }
    setOutlookState("loading");
    setOutlookError("");
    try {
      const result = await api.getOutlook(ticker);
      setOutlook(result);
      setOutlookState("open");
    } catch (err) {
      setOutlookError(err.message);
      setOutlookState("error");
    }
  };

  const price = quote?.price ?? null;
  const dayChange = quote?.change_percent ?? null;
  const value = price != null ? shares * price : null;
  const cost = shares * avg_price;
  const pnl = value != null ? value - cost : null;
  const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;

  return (
    <article
      className="panel card-enter flex flex-col p-5 shadow-[0_24px_48px_-36px_rgba(63,99,201,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-sky hover:shadow-[0_32px_64px_-36px_rgba(63,99,201,0.6)]"
      style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="font-mono text-xl font-semibold tracking-wide">{ticker}</h3>
            {dayChange != null && (
              <span
                className={`tnum rounded-full px-2 py-0.5 font-mono text-[11px] ${
                  dayChange > 0
                    ? "bg-sky-soft text-cobalt"
                    : dayChange < 0
                      ? "bg-ink/5 text-ink/55"
                      : "bg-ink/5 text-ink/55"
                }`}
              >
                {dirGlyph(dayChange)} {fmtPercent(dayChange)}
              </span>
            )}
          </div>
          <p className="tnum mt-1 font-mono text-2xl font-medium">
            {price != null ? fmtCurrency(price) : <span className="text-ink/30">—</span>}
          </p>
        </div>
        <button
          onClick={() => onDelete(holding)}
          className="cursor-pointer p-1 text-ink/30 transition hover:text-ink"
          aria-label={`Remove ${ticker}`}
          title="Remove position"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="mb-4 space-y-2">
        <LedgerRow label="Shares" value={fmtShares(shares)} accent="text-ink/60" />
        <LedgerRow label="Avg Cost" value={fmtCurrency(avg_price)} accent="text-ink/60" />
        <LedgerRow label="Value" value={value != null ? fmtCurrency(value) : "—"} />
        <LedgerRow
          label="P&L"
          value={pnl != null ? `${fmtCurrency(pnl)} (${fmtPercent(pnlPct)})` : "—"}
          accent={pnl != null ? gainClass(pnl) : "text-ink/30"}
        />
      </div>

      <div className="mb-3 flex gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`cursor-pointer rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase transition ${
              range === r ? "bg-ink text-paper" : "text-ink/40 hover:text-ink"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {points === null && <div className="skeleton h-[160px]" />}
      {points === "error" && (
        <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-ink/20">
          <span className="font-mono text-xs text-ink/40">chart unavailable</span>
        </div>
      )}
      {Array.isArray(points) && points.length > 0 && <PriceChart ticker={ticker} points={points} />}

      <div className="mt-4">
        <button
          onClick={fetchOutlook}
          disabled={outlookState === "loading"}
          className={`btn-ghost w-full ${
            outlookState === "open" ? "border-cobalt/40 bg-sky-soft/70 text-cobalt" : ""
          }`}
        >
          <SparkIcon className="h-3.5 w-3.5" />
          {outlookState === "loading"
            ? "Reading price action, news & filings…"
            : outlookState === "open"
              ? "Hide AI Outlook"
              : "AI Outlook"}
        </button>
        {outlookState === "error" && (
          <p className="mt-2 border-l-2 border-ink bg-ink/5 px-3 py-2 font-mono text-xs text-ink/70">
            {outlookError}
          </p>
        )}
      </div>

      {outlookState === "open" && outlook && <OutlookPanel outlook={outlook} />}
    </article>
  );
}
