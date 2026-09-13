import { useState } from "react";
import HoldingCard from "../../components/HoldingCard";
import PortfolioInput from "../../components/PortfolioInput";
import SummaryBar from "../../components/SummaryBar";
import { PlusIcon } from "../../components/icons";
import { usePortfolio } from "../../context/PortfolioContext";
import { useSearch } from "../../layouts/DashboardLayout";
import { api } from "../../lib/api";

export default function Positions() {
  const { holdings, quotes, error, setError, reload } = usePortfolio();
  const { query } = useSearch();
  const [showInput, setShowInput] = useState(false);

  const handleDelete = async (holding) => {
    if (!window.confirm(`Remove ${holding.ticker} from your portfolio?`)) return;
    try {
      await api.deleteHolding(holding.id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const loading = holdings === null;
  const empty = !loading && holdings.length === 0;
  const inputVisible = showInput || empty;
  const visible = loading
    ? []
    : holdings.filter((h) => h.ticker.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="microlabel mb-2">the ledger — positions</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your <span className="serif-accent">positions</span>
            {!loading && holdings.length > 0 && (
              <span className="tnum ml-3 align-middle font-mono text-sm text-ink/40">
                {holdings.length}
              </span>
            )}
          </h1>
        </div>
        {!inputVisible && (
          <button onClick={() => setShowInput(true)} className="btn-ghost">
            <PlusIcon className="h-3.5 w-3.5" /> Add holdings
          </button>
        )}
      </div>

      {error && (
        <p className="card-enter mb-4 border-l-2 border-ink bg-ink/5 px-4 py-2.5 font-mono text-xs text-ink/70">
          {error}
        </p>
      )}

      {inputVisible && (
        <PortfolioInput
          onSaved={() => {
            setShowInput(false);
            reload();
          }}
          onCancel={empty ? null : () => setShowInput(false)}
        />
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[420px]" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}

      {empty && (
        <div className="card-enter flex flex-col items-center rounded-2xl border border-dashed border-ink/25 px-6 py-16 text-center">
          <p className="font-mono text-sm text-ink/60">No positions on the books yet.</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink/45">
            Describe your portfolio above in plain English — tickers, share counts, and average
            prices — and the AI will structure it for you.
          </p>
        </div>
      )}

      {!loading && holdings.length > 0 && (
        <>
          <SummaryBar holdings={holdings} quotes={quotes} />
          {visible.length === 0 ? (
            <div className="card-enter rounded-2xl border border-dashed border-ink/25 px-6 py-12 text-center">
              <p className="font-mono text-xs text-ink/45">nothing matches “{query}”</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((holding, index) => (
                <HoldingCard
                  key={holding.id}
                  holding={holding}
                  quote={quotes[holding.ticker]}
                  onDelete={handleDelete}
                  index={index}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
