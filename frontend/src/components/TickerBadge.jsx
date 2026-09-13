/* Deterministic two-tone "avatar" for a ticker — the app's stand-in for faces. */
const STYLES = [
  "bg-ink text-paper",
  "bg-cobalt text-white",
  "bg-sky text-ink",
  "bg-sky-soft text-cobalt",
  "bg-bone text-ink border border-ink/15",
];

export default function TickerBadge({ ticker, size = "h-8 w-8 text-[10px]" }) {
  const style = STYLES[(ticker.charCodeAt(0) + (ticker.charCodeAt(1) || 0)) % STYLES.length];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl font-mono font-semibold ${size} ${style}`}
      aria-hidden="true"
    >
      {ticker.slice(0, 2)}
    </span>
  );
}
