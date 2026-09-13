import { useState } from "react";
import { api } from "../lib/api";
import { fmtCurrency, fmtShares } from "../lib/format";
import { SparkIcon, XIcon } from "./icons";

const PLACEHOLDER =
  'Try: "I hold NVDA 10 shares at $180 avg and VOO 5 shares at $490. Also bought 12 Apple at 200."';

export default function PortfolioInput({ onSaved, onCancel }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null); // { holdings, ignored }
  const [error, setError] = useState("");

  const parse = async () => {
    setParsing(true);
    setError("");
    try {
      const result = await api.parsePortfolio(text);
      if (!result.holdings.length) {
        setError(
          result.ignored[0] ||
            "Couldn't find any holdings in that. Include the ticker, share count, and average price."
        );
      } else {
        setPreview(result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.saveHoldings(preview.holdings);
      setText("");
      setPreview(null);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeRow = (index) => {
    const holdings = preview.holdings.filter((_, i) => i !== index);
    if (!holdings.length) setPreview(null);
    else setPreview({ ...preview, holdings });
  };

  return (
    <section className="panel card-enter mb-8 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="microlabel">Describe your holdings</p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="cursor-pointer text-ink/35 transition hover:text-ink"
            aria-label="Close"
          >
            <XIcon />
          </button>
        )}
      </div>

      {!preview ? (
        <>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            className="input-base resize-none font-mono text-[13px] leading-relaxed"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="hidden text-xs text-ink/45 sm:block">
              Plain English in, structured positions out — you confirm before anything is saved.
            </p>
            <button onClick={parse} disabled={parsing || text.trim().length < 3} className="btn-primary shrink-0">
              <SparkIcon className="h-3.5 w-3.5" />
              {parsing ? "Reading…" : "Read holdings"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-ink/15">
            <div className="grid grid-cols-[1fr_1fr_1fr_2rem] gap-2 border-b border-ink/15 bg-ink/5 px-4 py-2">
              {["Ticker", "Shares", "Avg Price", ""].map((h, i) => (
                <span key={i} className="microlabel">{h}</span>
              ))}
            </div>
            {preview.holdings.map((h, i) => (
              <div
                key={`${h.ticker}-${i}`}
                className="grid grid-cols-[1fr_1fr_1fr_2rem] items-center gap-2 border-b border-ink/10 px-4 py-2.5 font-mono text-sm last:border-0"
              >
                <span className="font-semibold">{h.ticker}</span>
                <span className="tnum text-ink/60">{fmtShares(h.shares)}</span>
                <span className="tnum text-ink/60">{fmtCurrency(h.avg_price)}</span>
                <button
                  onClick={() => removeRow(i)}
                  className="cursor-pointer justify-self-end text-ink/35 transition hover:text-ink"
                  aria-label={`Remove ${h.ticker}`}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {preview.ignored.length > 0 && (
            <div className="mt-3 space-y-1">
              {preview.ignored.map((reason, i) => (
                <p key={i} className="border-l-2 border-ink/40 bg-ink/5 px-3 py-1.5 text-xs text-ink/60">
                  Skipped: {reason}
                </p>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2.5">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : `Save ${preview.holdings.length} position${preview.holdings.length > 1 ? "s" : ""}`}
            </button>
            <button onClick={() => setPreview(null)} disabled={saving} className="btn-ghost">
              Edit text
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-3 border-l-2 border-ink bg-ink/5 px-3 py-2 text-xs text-ink/70">{error}</p>
      )}
    </section>
  );
}
