import { dirGlyph, fmtCurrency, fmtPercent, gainClass } from "../lib/format";

function StatCard({ label, value, glyph = null, variant = "plain", accent = "" }) {
  const shell = {
    ink: "bg-ink text-paper",
    wash: "sky-wash",
    plain: "bg-bone",
  }[variant];
  const labelTone = variant === "ink" ? "text-paper/50" : "";

  return (
    <div
      className={`rounded-2xl border border-ink/8 px-5 py-4 shadow-[0_20px_40px_-30px_rgba(63,99,201,0.5)] transition-transform duration-300 hover:-translate-y-0.5 ${shell}`}
    >
      <p className={`microlabel mb-2 ${labelTone}`} style={variant === "ink" ? { color: "rgba(236,237,232,0.5)" } : undefined}>
        {label}
      </p>
      <p className={`tnum font-mono text-lg sm:text-xl ${accent}`}>
        {glyph && <span className="mr-1.5 text-[0.7em]">{glyph}</span>}
        {value}
      </p>
    </div>
  );
}

export default function SummaryBar({ holdings, quotes }) {
  let value = 0;
  let cost = 0;
  let priced = 0;
  for (const h of holdings) {
    const price = quotes[h.ticker]?.price;
    cost += h.shares * h.avg_price;
    if (price != null) {
      value += h.shares * price;
      priced += 1;
    }
  }
  const complete = priced === holdings.length;
  const pnl = complete ? value - cost : null;
  const pnlPct = complete && cost > 0 ? (pnl / cost) * 100 : null;

  return (
    <section className="card-enter mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total Value" value={complete ? fmtCurrency(value) : "…"} variant="ink" />
      <StatCard label="Cost Basis" value={fmtCurrency(cost)} />
      <StatCard
        label="Unrealized P&L"
        value={pnl == null ? "…" : `${fmtCurrency(pnl)} (${fmtPercent(pnlPct)})`}
        glyph={pnl == null ? null : dirGlyph(pnl)}
        variant="wash"
        accent={pnl == null ? "" : gainClass(pnl)}
      />
      <StatCard label="Positions" value={String(holdings.length)} />
    </section>
  );
}
