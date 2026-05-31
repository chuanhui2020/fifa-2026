/**
 * the-odds-api.com client.
 *
 * One request returns h2h (home/draw/away) odds for every World Cup fixture
 * from multiple bookmakers. We cache that whole snapshot (3h TTL) so all
 * per-match lookups share a single API call and stay within the free quota.
 */

import { getOddsSnapshot, setOddsSnapshot } from "../cache";

const SPORT_KEY = "soccer_fifa_world_cup";
const BASE_URL = "https://api.the-odds-api.com/v4";
const SNAPSHOT_KEY = SPORT_KEY;
const FETCH_TIMEOUT_MS = 10_000;

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
 * Returns null when no API key is configured or the request fails — callers
 * fall back to the LLM market agent in that case.
 */
export async function fetchWorldCupOddsSnapshot(): Promise<OddsEvent[] | null> {
  const cached = await getOddsSnapshot<OddsEvent[]>(SNAPSHOT_KEY);
  if (cached) return cached;

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;

  const url =
    `${BASE_URL}/sports/${SPORT_KEY}/odds/` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=us,uk,eu&markets=h2h&oddsFormat=decimal`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as OddsEvent[];
    if (!Array.isArray(data)) return null;

    await setOddsSnapshot<OddsEvent[]>(SNAPSHOT_KEY, data);
    return data;
  } catch {
    // timeout / network / parse error -> signal "no data", let caller fall back
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
