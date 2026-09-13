import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Panel from "../../components/Panel";
import { SignOutIcon } from "../../components/icons";
import { useDemo } from "../../context/DemoContext";
import { usePortfolio } from "../../context/PortfolioContext";
import { api } from "../../lib/api";

const RANGE_KEY = "folio-default-range";
const RANGES = ["7d", "1m", "3m"];

function Field({ label, value }) {
  return (
    <div className="flex items-baseline gap-3 font-mono text-xs">
      <span className="microlabel w-28 shrink-0">{label}</span>
      <span className="truncate text-ink/80">{value}</span>
    </div>
  );
}

export default function Profile() {
  const { name, createdAt, setName, resetDemo } = useDemo();
  const { holdings, reload } = usePortfolio();
  const navigate = useNavigate();
  const [draftName, setDraftName] = useState(name);
  const [range, setRange] = useState(() => localStorage.getItem(RANGE_KEY) || "1m");
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const started = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";

  const pickRange = (r) => {
    setRange(r);
    localStorage.setItem(RANGE_KEY, r);
  };

  const saveName = (event) => {
    event.preventDefault();
    setName(draftName);
  };

  const clearLedger = async () => {
    if (!holdings?.length) return;
    if (!window.confirm(`Delete all ${holdings.length} positions? This cannot be undone.`)) return;
    setClearing(true);
    setError("");
    try {
      for (const h of holdings) await api.deleteHolding(h.id);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm("Reset the demo? This clears the positions, watchlist and name saved in this browser.")) return;
    resetDemo();
    navigate("/");
  };

  return (
    <>
      <div className="mb-8">
        <p className="microlabel mb-2">the ledger — profile</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your <span className="serif-accent">desk</span>
        </h1>
      </div>

      {error && (
        <p className="card-enter mb-4 border-l-2 border-ink bg-ink/5 px-4 py-2.5 font-mono text-xs text-ink/70">
          {error}
        </p>
      )}

      <div className="grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
        <Panel title="Demo profile" className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-soft to-cobalt font-mono text-xl font-semibold text-white uppercase">
              {name[0] ?? "g"}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <Field label="display name" value={name} />
              <Field label="demo started" value={started} />
              <Field label="storage" value="this browser only — no account, no server" />
              <Field label="positions" value={holdings == null ? "…" : String(holdings.length)} />
            </div>
          </div>

          <form onSubmit={saveName} className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
            <label htmlFor="display-name" className="microlabel">
              change name
            </label>
            <input
              id="display-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={24}
              placeholder="guest"
              className="w-44 rounded-full border border-ink/12 bg-bone px-3.5 py-1.5 font-mono text-xs text-ink transition placeholder:text-ink/35 focus:border-cobalt/50 focus:outline-none"
            />
            <button type="submit" disabled={!draftName.trim() || draftName === name} className="btn-ghost">
              Save
            </button>
          </form>
        </Panel>

        <Panel title="Preferences">
          <p className="mb-3 text-xs leading-relaxed text-ink/55">
            Default chart range on position cards.
          </p>
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => pickRange(r)}
                className={`cursor-pointer rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition ${
                  range === r ? "bg-ink text-paper" : "border border-ink/15 text-ink/50 hover:text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="microlabel mt-4">saved on this device</p>
        </Panel>

        <Panel title="About this build">
          <p className="mb-4 text-xs leading-relaxed text-ink/55">
            A public preview with the backend removed. Quotes, charts and outlooks come from a
            seeded random-walk generator in your browser — they are not real market data and
            describe no real company.
          </p>
          <button onClick={handleReset} className="btn-ghost">
            <SignOutIcon className="h-3.5 w-3.5" /> Reset demo
          </button>
        </Panel>

        <Panel title="Danger zone" className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink/15 bg-paper px-4 py-3.5">
            <div>
              <p className="font-mono text-xs font-semibold tracking-wide uppercase">Clear the ledger</p>
              <p className="mt-1 text-xs text-ink/50">
                Removes every position from this browser. Nothing is stored anywhere else.
              </p>
            </div>
            <button
              onClick={clearLedger}
              disabled={clearing || !holdings?.length}
              className="btn-primary bg-ink/90"
            >
              {clearing ? "Clearing…" : "Delete all positions"}
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}
