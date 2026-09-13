import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AppleIcon, GoogleIcon, LogoMark } from "../components/icons";

const SAMPLE_ROWS = [
  { ticker: "NVDA", note: "10 sh @ $180", value: "+14.66%", up: true },
  { ticker: "VOO", note: "5 sh @ $490", value: "+38.32%", up: true },
  { ticker: "AAPL", note: "12 sh @ $200", value: "+8.04%", up: true },
];

export default function Login() {
  const { session, loading, signInWithProvider, signInWithPassword, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!loading && session) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signin") {
        const { error: err } = await signInWithPassword(email, password);
        if (err) throw err;
      } else {
        const { data, error: err } = await signUp(email, password);
        if (err) throw err;
        if (!data.session) setNotice("Account created — check your inbox to confirm your email.");
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider) => {
    setError("");
    const { error: err } = await signInWithProvider(provider);
    if (err) setError(err.message);
  };

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Brand panel */}
      <div className="grid-texture sky-aurora relative hidden w-[44%] flex-col justify-between border-r border-ink/10 p-10 lg:flex">
        <Link to="/" className="flex items-center gap-3" aria-label="Back to folio home">
          <LogoMark className="h-8 w-8" />
          <span className="text-xl font-semibold tracking-tight">folio</span>
        </Link>

        <div>
          <p className="microlabel mb-5">ai portfolio tracker</p>
          <h1 className="max-w-md text-4xl leading-[1.04] font-semibold tracking-tight xl:text-5xl">
            Your portfolio, read like a <span className="serif-accent">ledger</span>.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink/60">
            Describe your holdings in plain English. folio parses them with AI, tracks live prices
            and P&L, and reads the news and SEC filings so you don't have to.
          </p>

          <div className="mt-10 max-w-sm space-y-3">
            {SAMPLE_ROWS.map((row) => (
              <div key={row.ticker} className="flex items-baseline gap-3 font-mono text-xs">
                <span className="font-semibold text-ink">{row.ticker}</span>
                <span className="text-ink/40">{row.note}</span>
                <span className="flex-1 border-b border-dotted border-ink/25" />
                <span className={`tnum ${row.up ? "text-cobalt" : "text-ink/50"}`}>
                  <span className="mr-1 text-[0.7em]">{row.up ? "▲" : "▼"}</span>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="microlabel">sentiment analysis, not financial advice</p>
      </div>

      {/* Auth panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="card-enter w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-3 lg:hidden" aria-label="Back to folio home">
            <LogoMark className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-tight">folio</span>
          </Link>

          <h2 className="text-2xl font-semibold tracking-tight">
            {mode === "signin" ? "Sign in to your desk" : "Open your desk"}
          </h2>
          <p className="mt-1.5 text-sm text-ink/55">
            {mode === "signin"
              ? "Welcome back. Markets moved while you were away."
              : "Free account. Two fields. Done."}
          </p>

          <div className="mt-7 space-y-2.5">
            <button onClick={() => oauth("google")} className="btn-ghost w-full">
              <GoogleIcon /> Continue with Google
            </button>
            <button onClick={() => oauth("apple")} className="btn-ghost w-full">
              <AppleIcon /> Continue with Apple
            </button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink/15" />
            <span className="microlabel">or with email</span>
            <span className="h-px flex-1 bg-ink/15" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base"
            />
            {error && (
              <p className="border-l-2 border-ink bg-ink/5 px-3 py-2 text-xs text-ink/70">{error}</p>
            )}
            {notice && (
              <p className="border-l-2 border-cobalt bg-sky-soft/70 px-3 py-2 text-xs text-cobalt">{notice}</p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
              setNotice("");
            }}
            className="mt-5 cursor-pointer font-mono text-xs text-ink/55 underline-offset-4 hover:text-ink hover:underline"
          >
            {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
