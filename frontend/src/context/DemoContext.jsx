import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { clearDemoData } from "../lib/api";

/* Stands in for the old AuthContext. There is no account and no server: the demo
   build keeps a display name in localStorage so the dashboard has something to
   greet you by, and everything else is per-browser too. */

const PROFILE_KEY = "folio-demo-profile";
const DEFAULT_NAME = "guest";

const DemoContext = createContext(null);

function readProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    if (raw && typeof raw.name === "string") return raw;
  } catch {
    /* fall through to a fresh profile */
  }
  return { name: DEFAULT_NAME, createdAt: new Date().toISOString() };
}

function writeProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode — the name just won't survive a reload */
  }
}

export function DemoProvider({ children }) {
  const [profile, setProfile] = useState(readProfile);

  const setName = useCallback((raw) => {
    const name = String(raw).trim().slice(0, 24) || DEFAULT_NAME;
    setProfile((current) => {
      const next = { ...current, name };
      writeProfile(next);
      return next;
    });
  }, []);

  const resetDemo = useCallback(() => {
    clearDemoData();
    setProfile({ name: DEFAULT_NAME, createdAt: new Date().toISOString() });
  }, []);

  const value = useMemo(
    () => ({ name: profile.name, createdAt: profile.createdAt, setName, resetDemo }),
    [profile, setName, resetDemo]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export const useDemo = () => useContext(DemoContext);
