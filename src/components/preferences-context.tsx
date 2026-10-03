"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { parsePreferences, STORAGE_KEY } from "@/lib/preferences";
import type { Preferences } from "@/lib/types";
interface PreferencesState {
  preferences: Preferences | null;
  ready: boolean;
  storageWarning: string | null;
  save: (preferences: Preferences) => void;
}
const Context = createContext<PreferencesState | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        setPreferences(parsePreferences(localStorage.getItem(STORAGE_KEY)));
      } catch {
        setStorageWarning(
          "Your browser can’t save preferences. They’ll stay available for this visit.",
        );
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  function save(p: Preferences) {
    setPreferences(p);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        "Your browser can’t save preferences. They’ll stay available for this visit.",
      );
    }
  }
  return (
    <Context.Provider value={{ preferences, ready, save, storageWarning }}>
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error("PreferencesProvider is required.");
  return context;
}
