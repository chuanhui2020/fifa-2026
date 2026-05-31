/**
 * Devig (margin removal) for 1X2 (home/draw/away) football markets.
 *
 * Bookmaker decimal odds embed an "overround" (vig / juice): the raw implied
 * probabilities sum to >1. Devigging recovers fair probabilities that sum to 1.
 *
 * Implemented: proportional (multiplicative) normalization — the industry-standard
 * default. The `devig` dispatcher leaves room for additional methods (e.g. Shin).
 */

export type DevigMethod = "proportional" | "shin";

export interface OutcomeOdds {
  /** Decimal odds for a home win (e.g. 2.10). */
  home: number;
  /** Decimal odds for a draw. */
  draw: number;
  /** Decimal odds for an away win. */
  away: number;
}

export interface FairProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
}

/** Convert a single decimal odd to its raw implied probability. Invalid → 0. */
export function decimalToImplied(odds: number): number {
  if (!isFinite(odds) || odds <= 1) return 0;
  return 1 / odds;
}

/**
 * Proportional devig: divide each raw implied probability by their sum.
 * Returns null when inputs are unusable (non-positive sum).
 */
export function proportionalDevig(raw: FairProbabilities): FairProbabilities | null {
  const sum = raw.homeWin + raw.draw + raw.awayWin;
  if (!isFinite(sum) || sum <= 0) return null;
  return {
    homeWin: raw.homeWin / sum,
    draw: raw.draw / sum,
    awayWin: raw.awayWin / sum,
  };
}

/**
 * Devig a single bookmaker's 1X2 decimal odds into fair probabilities.
 * Returns null if any leg is missing/invalid or the result can't be normalized.
 */
export function devig(odds: OutcomeOdds, method: DevigMethod = "proportional"): FairProbabilities | null {
  const raw: FairProbabilities = {
    homeWin: decimalToImplied(odds.home),
    draw: decimalToImplied(odds.draw),
    awayWin: decimalToImplied(odds.away),
  };

  if (raw.homeWin <= 0 || raw.draw <= 0 || raw.awayWin <= 0) return null;

  switch (method) {
    case "proportional":
      return proportionalDevig(raw);
    case "shin":
      // Not yet implemented — fall back to proportional so callers stay safe.
      return proportionalDevig(raw);
    default:
      return proportionalDevig(raw);
  }
}

/**
 * Average several bookmakers' fair probabilities into a single consensus,
 * re-normalizing to guard against floating-point drift. Returns null if empty.
 */
export function averageProbabilities(probs: FairProbabilities[]): FairProbabilities | null {
  if (probs.length === 0) return null;

  const acc = probs.reduce(
    (a, p) => ({
      homeWin: a.homeWin + p.homeWin,
      draw: a.draw + p.draw,
      awayWin: a.awayWin + p.awayWin,
    }),
    { homeWin: 0, draw: 0, awayWin: 0 }
  );

  const n = probs.length;
  return proportionalDevig({
    homeWin: acc.homeWin / n,
    draw: acc.draw / n,
    awayWin: acc.awayWin / n,
  });
}
