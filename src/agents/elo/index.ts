/**
 * Deterministic Elo lookup: resolve both teams to eloratings.net codes and read
 * their ratings from the cached table. Returns null when either team can't be
 * resolved (e.g. knockout placeholders) or the table is unavailable, so callers
 * fall back to the LLM Elo agent.
 */

import { fetchEloRatings } from "./client";
import { teamToISO } from "../team-names";

export interface MatchElo {
  home: number;
  away: number;
  source: string;
}

export async function getEloRatings(homeTeam: string, awayTeam: string): Promise<MatchElo | null> {
  const homeCode = teamToISO(homeTeam);
  const awayCode = teamToISO(awayTeam);
  if (!homeCode || !awayCode) return null;

  const table = await fetchEloRatings();
  if (!table) return null;

  const home = table[homeCode];
  const away = table[awayCode];
  if (!isFinite(home) || !isFinite(away)) return null;

  return { home, away, source: "eloratings.net" };
}
