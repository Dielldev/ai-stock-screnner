const TONE = {
  bullish: { chip: "border-cobalt bg-cobalt text-paper", glyph: "▲" },
  neutral: { chip: "border-ink/30 text-ink/70", glyph: "→" },
  bearish: { chip: "border-ink bg-ink text-paper", glyph: "▼" },
};

export default function OutlookPanel({ outlook }) {
  const tone = TONE[outlook.sentiment] ?? TONE.neutral;
  const { indicators } = outlook;

  const chips = [];
  if (indicators?.rsi_14 != null) chips.push(`RSI ${indicators.rsi_14.toFixed(1)}`);
  if (indicators?.price_vs_sma50_percent != null)
    chips.push(`${indicators.price_vs_sma50_percent > 0 ? "+" : ""}${indicators.price_vs_sma50_percent.toFixed(1)}% vs 50DMA`);
  if (indicators?.change_30d_percent != null)
    chips.push(`${indicators.change_30d_percent > 0 ? "+" : ""}${indicators.change_30d_percent.toFixed(1)}% / 30d`);
  if (outlook.earnings) chips.push(`${outlook.earnings.form} · ${outlook.earnings.filed}`);

  return (
    <div className="mt-4 border-t border-ink/15 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase ${tone.chip}`}
        >
          <span aria-hidden="true">{tone.glyph}</span>
          {outlook.sentiment}
        </span>
        <span className="microlabel">simulated read</span>
      </div>

      <p className="text-sm leading-relaxed text-ink/90">{outlook.summary}</p>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="tnum rounded-full border border-sky bg-sky-soft/60 px-2.5 py-0.5 font-mono text-[11px] text-ink/65"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {outlook.risks.length > 0 && (
        <div className="mt-4">
          <p className="microlabel mb-2">Key risks</p>
          <ul className="space-y-1.5">
            {outlook.risks.map((risk, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink/65">
                <span className="text-ink/40">▸</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outlook.headlines.length > 0 && (
        <div className="mt-4">
          <p className="microlabel mb-2">Headlines weighed</p>
          <ul className="space-y-1">
            {outlook.headlines.slice(0, 4).map((h, i) => (
              <li key={i} className="truncate text-xs text-ink/45">
                {h.link ? (
                  <a
                    href={h.link}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 transition hover:text-ink hover:underline"
                  >
                    {h.title}
                  </a>
                ) : (
                  h.title
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="microlabel mt-4 opacity-70">
        Demo outlook — a rule applied to simulated indicators. Not real analysis, not a
        prediction, not financial advice.
      </p>
    </div>
  );
}
