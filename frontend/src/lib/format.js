const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const shares = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export const fmtCurrency = (value) => (value == null ? "—" : usd.format(value));

export const fmtPercent = (value, signed = true) =>
  value == null ? "—" : `${signed && value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export const fmtShares = (value) => (value == null ? "—" : shares.format(value));

/* Ledger direction: gains in cobalt, losses recede to faded ink; glyphs carry the arrow. */
export const gainClass = (value) =>
  value > 0 ? "text-cobalt font-medium" : value < 0 ? "text-ink/50" : "text-ink/70";

export const dirGlyph = (value) => (value > 0 ? "▲" : value < 0 ? "▼" : "·");

export const fmtDate = (iso) =>
  iso.includes("T")
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
