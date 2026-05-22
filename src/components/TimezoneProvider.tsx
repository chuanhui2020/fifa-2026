"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { TimezoneOption, getResolvedTimezone } from "@/lib/timezone";

interface TimezoneContextValue {
  timezone: TimezoneOption;
  resolvedTimezone: string;
  setTimezone: (tz: TimezoneOption) => void;
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: "Asia/Shanghai",
  resolvedTimezone: "Asia/Shanghai",
  setTimezone: () => {},
});

export function useTimezone() {
  return useContext(TimezoneContext);
}

const STORAGE_KEY = "fifa2026-timezone";

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<TimezoneOption>("Asia/Shanghai");
  const [resolvedTimezone, setResolvedTimezone] = useState("Asia/Shanghai");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as TimezoneOption | null;
    if (saved && ["Asia/Shanghai", "America/New_York", "auto"].includes(saved)) {
      setTimezoneState(saved);
      setResolvedTimezone(getResolvedTimezone(saved));
    } else {
      setResolvedTimezone(getResolvedTimezone("Asia/Shanghai"));
    }
  }, []);

  const setTimezone = (tz: TimezoneOption) => {
    setTimezoneState(tz);
    setResolvedTimezone(getResolvedTimezone(tz));
    localStorage.setItem(STORAGE_KEY, tz);
  };

  return (
    <TimezoneContext.Provider value={{ timezone, resolvedTimezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}
