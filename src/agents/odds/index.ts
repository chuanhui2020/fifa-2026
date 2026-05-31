/**
 * Deterministic market-odds lookup: find a fixture in the cached the-odds-api
 * snapshot, devig each bookmaker's 1X2 market, and average into a consensus
 * fair probability. Returns null when no usable odds event is found (callers
 * then fall back to the LLM market agent).
 */

import { fetchWorldCupOddsSnapshot, type OddsEvent, type OddsBookmaker } from "./client";
import { canonicalTeam, teamsMatch } from "../team-names";
import { devig, averageProbabilities, type FairProbabilities } from "./devig";

export interface MatchOdds {
  probabilities: FairProbabilities;
  /** Number of bookmakers that produced a usable devigged 1X2 price. */
  bookmakerCount: number;
  /** Bookmaker titles used, for sourcing/transparency. */
  sources: string[];
  /** Consensus decimal odds (average raw price per outcome) for display. */
  consensusOdds: { home: number; draw: number; away: number };
}

/** Locate the snapshot event matching our home/away teams. */
function findEvent(
  events: OddsEvent[],
  homeTeam: string,
  awayTeam: string
): OddsEvent | null {
  return (
    events.find(
      (e) =>
        (teamsMatch(e.home_team, homeTeam) && teamsMatch(e.away_team, awayTeam)) ||
        (teamsMatch(e.home_team, awayTeam) && teamsMatch(e.away_team, homeTeam))
    ) ?? null
  );
}

/**
 * Extract home/draw/away decimal odds from a bookmaker's h2h market.
 * Outcomes are labeled by team name plus "Draw"; we map them back to our
 * home/away orientation via canonical team matching.
 */
function readH2H(
  bookmaker: OddsBookmaker,
  homeTeam: string,
  awayTeam: string
): { home: number; draw: number; away: number } | null {
  const market = bookmaker.markets.find((m) => m.key === "h2h");
  if (!market) return null;

  let home = 0;
  let draw = 0;
  let away = 0;

  for (const o of market.outcomes) {
    if (canonicalTeam(o.name) === "draw" || /^draw$/i.test(o.name.trim())) {
      draw = o.price;
    } else if (teamsMatch(o.name, homeTeam)) {
      home = o.price;
    } else if (teamsMatch(o.name, awayTeam)) {
      away = o.price;
    }
  }

  if (home <= 1 || draw <= 1 || away <= 1) return null;
  return { home, draw, away };
}

export async function getMatchOdds(
  homeTeam: string,
  awayTeam: string
): Promise<MatchOdds | null> {
  const snapshot = await fetchWorldCupOddsSnapshot();
  if (!snapshot) return null;

  const event = findEvent(snapshot, homeTeam, awayTeam);
  if (!event || event.bookmakers.length === 0) return null;

  // readH2H maps each outcome to our home/away by team-name matching, so the
  // result is already in our orientation regardless of the event's own ordering.
  const perBook: FairProbabilities[] = [];
  const sources: string[] = [];
  let homeOddsSum = 0;
  let drawOddsSum = 0;
  let awayOddsSum = 0;

  for (const bm of event.bookmakers) {
    const odds = readH2H(bm, homeTeam, awayTeam);
    if (!odds) continue;

    const fair = devig(odds, "proportional");
    if (!fair) continue;

    perBook.push(fair);
    homeOddsSum += odds.home;
    drawOddsSum += odds.draw;
    awayOddsSum += odds.away;
    sources.push(bm.title);
  }

  if (perBook.length === 0) return null;

  const probabilities = averageProbabilities(perBook);
  if (!probabilities) return null;

  const n = perBook.length;

  return {
    probabilities,
    bookmakerCount: n,
    sources: [...new Set(sources)],
    consensusOdds: {
      home: homeOddsSum / n,
      draw: drawOddsSum / n,
      away: awayOddsSum / n,
    },
  };
}
