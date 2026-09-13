import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const PortfolioContext = createContext(null);

/** Shares holdings + live quotes across all dashboard pages (one fetch, many views). */
export function PortfolioProvider({ children }) {
  const [holdings, setHoldings] = useState(null); // null = loading
  const [quotes, setQuotes] = useState({});
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setError("");
    try {
      const rows = await api.getPortfolio();
      setHoldings(rows);
      if (rows.length > 0) {
        const fetched = await api.getQuotes(rows.map((r) => r.ticker));
        setQuotes(Object.fromEntries(fetched.map((q) => [q.ticker, q])));
      }
    } catch (err) {
      setError(err.message);
      setHoldings((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <PortfolioContext.Provider value={{ holdings, quotes, error, setError, reload }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export const usePortfolio = () => useContext(PortfolioContext);
