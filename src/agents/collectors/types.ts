import type { MatchContext } from "../types";
export type { CollectorOutput } from "../types";

/** Per-run options threaded from the orchestrator/endpoint down to each collector. */
export interface CollectorRunOptions {
  /** Bypass all caches (collector cache + Tavily query cache) and re-collect fresh. Admin force-refresh. */
  forceRefresh?: boolean;
}

export interface CollectorAgent {
  id: string;
  name: string;
  run(
    matchId: string,
    homeTeam: string,
    awayTeam: string,
    context?: MatchContext,
    opts?: CollectorRunOptions
  ): Promise<import("../types").CollectorOutput>;
}
