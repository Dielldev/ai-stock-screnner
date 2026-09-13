import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import IndexStrip from "../../components/IndexStrip";
import OutlookPanel from "../../components/OutlookPanel";
import Panel from "../../components/Panel";
import TickerBadge from "../../components/TickerBadge";
import { LogoMark, SparkIcon } from "../../components/icons";
import { useDemo } from "../../context/DemoContext";
import { usePortfolio } from "../../context/PortfolioContext";
import { api } from "../../lib/api";
import { dirGlyph, fmtCurrency, fmtDate, fmtPercent } from "../../lib/format";
import { getHistoryCached } from "../../lib/history";
import SummaryBar from "../../components/SummaryBar";

const RANGES = ["7d", "1m", "3m"];
const DONUT_COLORS = ["#131410", "#3f63c9", "#8fa8e0", "#cdd9f4", "#9aa39b", "#e7edfb"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg bg-ink px-2.5 py-1.5 font-mono text-xs text-paper shadow-lg">
      <p className="opacity-55">{point.date ? fmtDate(point.date) : point.ticker}</p>
      <p className="tnum mt-0.5 font-medium">{fmtCurrency(point.value)}</p>
    </div>
  );
}

function PerformancePanel({ holdings }) {
  const [range, setRange] = useState("1m");
  const [series, setSeries] = useState(null); // null loading, "error" failed

  useEffect(() => {
    if (!holdings?.length) return;
    let active = true;
    setSeries(null);
    Promise.all(holdings.map((h) => getHistoryCached(h.ticker, range)))
      .then((histories) => {
        if (!active) return;
        const sums = {};
        const counts = {};
        histories.forEach((history, i) => {
          const shares = holdings[i].shares;
          for (const p of history.points) {
            sums[p.date] = (sums[p.date] || 0) + p.close * shares;
            counts[p.date] = (counts[p.date] || 0) + 1;
          }
        });
        const merged = Object.keys(sums)
          .filter((d) => counts[d] === holdings.length)
          .sort()
          .map((date) => ({ date, value: sums[date] }));
        setSeries(merged.length > 1 ? merged : "error");
      })
      .catch(() => active && setSeries("error"));
    return () => {
      active = false;
    };
  }, [holdings, range]);

  const rising = Array.isArray(series) && series[series.length - 1].value >= series[0].value;

  return (
    <Panel
      title="Portfolio performance"
      className="lg:col-span-2"
      action={
        <div className="flex gap-1">
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
      }
    >
      {series === null && <div className="skeleton h-[240px]" />}
      {series === "error" && (
        <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-ink/20">
          <span className="font-mono text-xs text-ink/40">performance unavailable</span>
        </div>
      )}
      {Array.isArray(series) && (
        <>
          <div className="mb-3 flex items-baseline gap-3">
            <span className="tnum font-mono text-2xl font-medium">
              {fmtCurrency(series[series.length - 1].value)}
            </span>
            <span className={`tnum font-mono text-xs ${rising ? "text-cobalt" : "text-ink/50"}`}>
              {dirGlyph(series[series.length - 1].value - series[0].value)}{" "}
              {fmtPercent(((series[series.length - 1].value - series[0].value) / series[0].value) * 100)}{" "}
              over {range}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="perf-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-cobalt)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--color-cobalt)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--color-cobalt)", strokeOpacity: 0.4, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--color-cobalt)"
                strokeWidth={1.7}
                fill="url(#perf-grad)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-cobalt)" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-1 flex justify-between">
            <span className="microlabel">{fmtDate(series[0].date)}</span>
            <span className="microlabel">{fmtDate(series[series.length - 1].date)}</span>
          </div>
        </>
      )}
    </Panel>
  );
}

function AllocationPanel({ holdings, quotes }) {
  const slices = useMemo(() => {
    const rows = holdings.map((h) => ({
      ticker: h.ticker,
      value: h.shares * (quotes[h.ticker]?.price ?? h.avg_price),
    }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    return rows
      .sort((a, b) => b.value - a.value)
      .map((r, i) => ({ ...r, pct: total > 0 ? (r.value / total) * 100 : 0, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  }, [holdings, quotes]);

  const total = slices.reduce((s, r) => s + r.value, 0);

  return (
    <Panel title="Allocation">
      <div className="relative mx-auto h-[190px] w-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="ticker"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={3}
              cornerRadius={7}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.ticker} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="microlabel">total</span>
          <span className="tnum mt-1 font-mono text-sm font-medium">{fmtCurrency(total)}</span>
        </div>
      </div>
      <ul className="mt-5 space-y-2.5">
        {slices.map((s) => (
          <li key={s.ticker} className="flex items-center gap-2.5 font-mono text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="font-semibold">{s.ticker}</span>
            <span className="flex-1 border-b border-dotted border-ink/20" />
            <span className="tnum text-ink/60">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MoversPanel({ holdings, quotes }) {
  const movers = holdings
    .map((h) => ({ ticker: h.ticker, quote: quotes[h.ticker] }))
    .filter((m) => m.quote?.change_percent != null)
    .sort((a, b) => Math.abs(b.quote.change_percent) - Math.abs(a.quote.change_percent))
    .slice(0, 4);

  return (
    <Panel title="Today's movers">
      {movers.length === 0 ? (
        <p className="font-mono text-xs text-ink/40">No quotes yet.</p>
      ) : (
        <ul className="space-y-3">
          {movers.map(({ ticker, quote }) => (
            <li key={ticker} className="flex items-center gap-3">
              <TickerBadge ticker={ticker} />
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{ticker}</p>
                <p className="tnum font-mono text-xs text-ink/50">{fmtCurrency(quote.price)}</p>
              </div>
              <span
                className={`tnum ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] ${
                  quote.change_percent > 0 ? "bg-sky-soft text-cobalt" : "bg-ink/5 text-ink/55"
                }`}
              >
                {dirGlyph(quote.change_percent)} {fmtPercent(quote.change_percent)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function BriefPanel({ holdings, quotes }) {
  const [state, setState] = useState("idle"); // idle | loading | open | error
  const [outlook, setOutlook] = useState(null);
  const [error, setError] = useState("");

  const top = holdings
    .map((h) => ({ ticker: h.ticker, quote: quotes[h.ticker] }))
    .filter((m) => m.quote?.change_percent != null)
    .sort((a, b) => Math.abs(b.quote.change_percent) - Math.abs(a.quote.change_percent))[0];

  const brief = async () => {
    if (!top) return;
    setState("loading");
    setError("");
    try {
      setOutlook(await api.getOutlook(top.ticker));
      setState("open");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  };

  return (
    <Panel title="Demo brief" className="lg:col-span-2">
      <div className="flex items-start gap-4">
        <LogoMark className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-snug font-medium tracking-tight">
            A worked example of the brief folio writes for a position{" "}
            <span className="serif-accent">— built from simulated data.</span>
          </p>
          {state === "idle" && top && (
            <button onClick={brief} className="btn-primary mt-4">
              <SparkIcon className="h-3.5 w-3.5" /> Brief me on {top.ticker}
            </button>
          )}
          {state === "loading" && (
            <p className="mt-4 font-mono text-xs text-ink/50">
              Reading the simulated series for {top?.ticker}…
            </p>
          )}
          {state === "error" && (
            <p className="mt-4 border-l-2 border-ink bg-ink/5 px-3 py-2 font-mono text-xs text-ink/70">{error}</p>
          )}
          {state === "open" && outlook && <OutlookPanel outlook={outlook} />}
          {state === "open" && (
            <Link
              to="/dashboard/positions"
              className="mt-4 inline-block font-mono text-xs text-cobalt underline-offset-4 hover:underline"
            >
              Read the rest on positions ↗
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default function Overview() {
  const { name } = useDemo();
  const { holdings, quotes, error } = usePortfolio();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const loading = holdings === null;
  const empty = !loading && holdings.length === 0;

  return (
    <>
      <IndexStrip />

      <div className="mb-8">
        <p className="microlabel mb-2">the ledger — {today}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting()}, <span className="serif-accent">{name}.</span>
        </h1>
      </div>

      {error && (
        <p className="card-enter mb-4 border-l-2 border-ink bg-ink/5 px-4 py-2.5 font-mono text-xs text-ink/70">
          {error}
        </p>
      )}

      {loading && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[88px]" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="skeleton h-[320px] lg:col-span-2" />
            <div className="skeleton h-[320px]" />
          </div>
        </>
      )}

      {empty && (
        <div className="card-enter flex flex-col items-center rounded-2xl border border-dashed border-ink/25 px-6 py-20 text-center">
          <LogoMark className="h-10 w-10" />
          <p className="mt-4 font-mono text-sm text-ink/60">Nothing on the books yet.</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink/45">
            Add your first positions in plain English and this page comes alive — performance,
            allocation, movers, and briefs.
          </p>
          <Link to="/dashboard/positions" className="btn-primary mt-6">
            Add holdings
          </Link>
        </div>
      )}

      {!loading && holdings.length > 0 && (
        <>
          <SummaryBar holdings={holdings} quotes={quotes} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <PerformancePanel holdings={holdings} />
            <AllocationPanel holdings={holdings} quotes={quotes} />
            <MoversPanel holdings={holdings} quotes={quotes} />
            <BriefPanel holdings={holdings} quotes={quotes} />
          </div>
        </>
      )}
    </>
  );
}
