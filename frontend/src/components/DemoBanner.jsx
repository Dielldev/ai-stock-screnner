/** Permanent, unmissable notice that nothing on the page is real market data. */
export default function DemoBanner({ className = "" }) {
  return (
    <div
      role="note"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-ink/15 bg-ink/[0.04] px-3.5 py-2 ${className}`}
    >
      <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-paper uppercase">
        Demo
      </span>
      <p className="font-mono text-[11px] leading-relaxed text-ink/60">
        Public preview — every price, chart and outlook is randomly generated, not real market
        data. No account, no server; your positions stay in this browser.
      </p>
    </div>
  );
}
