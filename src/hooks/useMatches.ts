"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { matches as staticMatches, Match } from "@/data/matches";

interface MatchesState {
  matches: Match[];
  lastUpdated: string | null;
  isLive: boolean;
}

export function useMatches(): MatchesState {
  const [state, setState] = useState<MatchesState>({
    matches: staticMatches,
    lastUpdated: null,
    isLive: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const resp = await fetch("/api/matches");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.matches?.length > 0) {
        setState({
          matches: data.matches,
          lastUpdated: data.lastUpdated,
          isLive: data.matches.some((m: Match) => m.status === "live"),
        });
      }
    } catch {
      // Keep static data on failure
    }
  }, []);

  useEffect(() => {
    // fetchMatches 仅在 await fetch 之后才 setState（异步，非同步级联渲染），
    // 且需要在挂载时拉取一次最新数据覆盖静态兜底数据。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = state.isLive ? 30_000 : 300_000;
    intervalRef.current = setInterval(fetchMatches, interval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMatches, state.isLive]);

  return state;
}
