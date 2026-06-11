/**
 * the-odds-api.com client.
 *
 * One request returns h2h (home/draw/away) odds for every World Cup fixture
 * from multiple bookmakers. We cache that whole snapshot (3h TTL) so all
 * per-match lookups share a single API call and stay within the free quota.
 *
 * Near kickoff the closing line moves fast (confirmed lineups ~1h before, late
 * team news), so callers may pass `maxAgeMs` to force a re-pull when the cached
 * snapshot is older than that — the single most predictive, most time-sensitive
 * signal must not be served 3h stale in the final hour.
 */

import { getOddsSnapshot, setOddsSnapshot } from "../cache";

const SPORT_KEY = "soccer_fifa_world_cup";
const BASE_URL = "https://api.the-odds-api.com/v4";
const SNAPSHOT_KEY = SPORT_KEY;
const FETCH_TIMEOUT_MS = 10_000;

/** Cached snapshot envelope: the raw events plus when they were fetched. */
interface OddsSnapshotEnvelope {
  fetchedAt: number;
  events: OddsEvent[];
}

/** Shape of the subset of the-odds-api response we consume. */
export interface OddsOutcome {
  name: string; // team name, or "Draw"
  price: number; // decimal odds
}

export interface OddsMarket {
  key: string; // "h2h"
  outcomes: OddsOutcome[];
}

export interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

export interface OddsEvent {
  id: string;
  sport_key: string;
  commence_time: string; // ISO 8601
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

/**
 * Return the cached tournament odds snapshot, fetching from the API on a miss.
 * Returns null when no API key is configured and nothing is cached, or the
 * request fails with no usable cache — callers fall back to the LLM market
 * agent in that case.
 *
 * @param opts.maxAgeMs  Re-pull if the cached snapshot is older than this (used
 *   near kickoff for a fresh closing line). Omit to accept any non-expired
 *   cache (the normal far-from-kickoff path, kept within the free quota).
 */
export async function fetchWorldCupOddsSnapshot(
  opts?: { maxAgeMs?: number }
): Promise<OddsEvent[] | null> {
  const cached = await getOddsSnapshot<OddsSnapshotEnvelope>(SNAPSHOT_KEY);
  const fresh =
    cached && (opts?.maxAgeMs === undefined || Date.now() - cached.fetchedAt <= opts.maxAgeMs);
  if (cached && fresh) return cached.events;

  const apiKey = process.env.ODDS_API_KEY;
  // No key: serve whatever we have (possibly stale) rather than dropping to LLM.
  if (!apiKey) return cached?.events ?? null;

  const url =
    `${BASE_URL}/sports/${SPORT_KEY}/odds/` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=us,uk,eu&markets=h2h&oddsFormat=decimal`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    // On any failure, prefer a stale cached snapshot over no data — a transient
    // odds-API hiccup shouldn't demote the whole prediction to the LLM anchor.
    if (!response.ok) return cached?.events ?? null;

    const data = (await response.json()) as OddsEvent[];
    if (!Array.isArray(data)) return cached?.events ?? null;

    await setOddsSnapshot<OddsSnapshotEnvelope>(SNAPSHOT_KEY, { fetchedAt: Date.now(), events: data });
    return data;
  } catch {
    // timeout / network / parse error -> fall back to stale cache if present.
    return cached?.events ?? null;
  } finally {
    clearTimeout(timeout);
  }
}
