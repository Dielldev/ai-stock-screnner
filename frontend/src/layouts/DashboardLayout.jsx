import { createContext, useContext, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PortfolioProvider } from "../context/PortfolioContext";
import {
  GridIcon,
  LogoMark,
  RowsIcon,
  SearchIcon,
  SignOutIcon,
  StarIcon,
  UserIcon,
} from "../components/icons";

const SearchContext = createContext({ query: "", setQuery: () => {} });
export const useSearch = () => useContext(SearchContext);

const NAV = [
  { to: "/dashboard", label: "Overview", icon: GridIcon, end: true },
  { to: "/dashboard/positions", label: "Positions", icon: RowsIcon, end: false },
  { to: "/dashboard/watchlist", label: "Watchlist", icon: StarIcon, end: false },
  { to: "/dashboard/profile", label: "Profile", icon: UserIcon, end: false },
];

function RailLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        `grid h-10 w-10 place-items-center rounded-xl transition ${
          isActive ? "bg-ink text-paper" : "text-ink/45 hover:bg-ink/5 hover:text-ink"
        }`
      }
    >
      <Icon />
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <PortfolioProvider>
      <SearchContext.Provider value={{ query, setQuery }}>
        <div className="sky-aurora min-h-screen bg-paper">
          {/* floating icon rail */}
          <aside className="fixed inset-y-4 left-4 z-30 hidden w-14 flex-col items-center justify-between rounded-2xl border border-ink/10 bg-bone py-4 shadow-[0_28px_56px_-36px_rgba(63,99,201,0.55)] md:flex">
            <NavLink to="/" title="folio home" aria-label="folio home">
              <LogoMark className="h-8 w-8" />
            </NavLink>
            <nav className="flex flex-col gap-1.5" aria-label="Dashboard">
              {NAV.map((item) => (
                <RailLink key={item.to} {...item} />
              ))}
            </nav>
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-ink/45 transition hover:bg-ink/5 hover:text-ink"
            >
              <SignOutIcon />
            </button>
          </aside>

          <div className="md:pl-[5.5rem]">
            {/* topbar */}
            <header className="sticky top-0 z-20 bg-paper/85 backdrop-blur">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <NavLink to="/" className="flex shrink-0 items-center gap-2.5 md:hidden" aria-label="folio home">
                    <LogoMark className="h-7 w-7" />
                  </NavLink>
                  <nav
                    className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]"
                    aria-label="Dashboard pages"
                  >
                    {NAV.map(({ to, label, end }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                          `shrink-0 rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.14em] uppercase transition ${
                            isActive ? "bg-ink text-paper" : "text-ink/50 hover:bg-ink/5 hover:text-ink"
                          }`
                        }
                      >
                        {label}
                      </NavLink>
                    ))}
                  </nav>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <label className="relative hidden items-center sm:flex">
                    <SearchIcon className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink/35" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="search tickers"
                      className="w-44 rounded-full border border-ink/12 bg-bone py-1.5 pr-3.5 pl-9 font-mono text-xs text-ink transition placeholder:text-ink/35 focus:w-56 focus:border-cobalt/50 focus:outline-none"
                    />
                  </label>
                  <NavLink
                    to="/dashboard/profile"
                    title={user?.email}
                    aria-label="Profile"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-soft to-cobalt font-mono text-[11px] font-semibold text-white uppercase ring-2 ring-white/60"
                  >
                    {user?.email?.[0] ?? "f"}
                  </NavLink>
                </div>
              </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 pt-4 pb-10 sm:px-6">
              <Outlet />
              <footer className="mt-14 border-t border-ink/15 pt-5 pb-4">
                <p className="microlabel">
                  Market data via Yahoo Finance · Filings via SEC EDGAR · Outlooks are AI sentiment
                  analysis, not financial advice
                </p>
              </footer>
            </main>
          </div>
        </div>
      </SearchContext.Provider>
    </PortfolioProvider>
  );
}
