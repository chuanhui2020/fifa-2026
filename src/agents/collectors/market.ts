import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { CollectorOutput, Factor, MatchContext } from "../types";
import { getMatchOdds, type MatchOdds } from "../odds";
import { validateCollectorOutput } from "../validate";
import { getCachedCollector, setCacheCollector } from "../cache";

const DEFAULT_CONFIDENCE = 0.8;

function buildDeterministicOutput(matchId: string, odds: MatchOdds): CollectorOutput {
  const { probabilities, bookmakerCount, sources, consensusOdds } = odds;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const factors: Factor[] = [
    {
      name: "Market implied probability (home win)",
      value: probabilities.homeWin,
      direction: "home",
      weight: 0.9,
      reasoning: `Devigged consensus across ${bookmakerCount} bookmakers — home win ${pct(probabilities.homeWin)} (avg odds ${consensusOdds.home.toFixed(2)}).`,
    },
    {
      name: "Market implied probability (draw)",
      value: probabilities.draw,
      direction: "neutral",
      weight: 0.9,
      reasoning: `Devigged consensus across ${bookmakerCount} bookmakers — draw ${pct(probabilities.draw)} (avg odds ${consensusOdds.draw.toFixed(2)}).`,
    },
    {
      name: "Market implied probability (away win)",
      value: probabilities.awayWin,
      direction: "away",
      weight: 0.9,
      reasoning: `Devigged consensus across ${bookmakerCount} bookmakers — away win ${pct(probabilities.awayWin)} (avg odds ${consensusOdds.away.toFixed(2)}).`,
    },
  ];

  // Confidence scales with bookmaker coverage (more books = sharper consensus).
  const confidence = Math.min(0.95, Math.max(0.7, 0.7 + 0.04 * bookmakerCount));

  const sourceList = ["the-odds-api.com", ...sources];

  // Reuse the shared validator for shape/quality, then attach the structured
  // probabilities (validateCollectorOutput does not carry unknown fields).
  const base = validateCollectorOutput(
    { factors, sources: sourceList, confidence },
    "market",
    matchId,
    DEFAULT_CONFIDENCE
  );

  return { ...base, impliedProbability: probabilities };
}

export const marketAgent: CollectorAgent = {
  id: "market",
  name: "Market Odds Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext, opts?) {
    if (!opts?.forceRefresh) {
      const cached = await getCachedCollector("market", matchId);
      if (cached) return cached;
    }

    // Primary: deterministic devigged odds from the-odds-api snapshot. The snapshot
    // is shared across the whole tournament and bounded by the-odds-api's 500/month
    // quota — force-refresh does NOT re-pull it (its own TTL governs freshness),
    // only the per-match collector cache above.
    const odds = await getMatchOdds(homeTeam, awayTeam);
    if (odds) {
      const output = buildDeterministicOutput(matchId, odds);
      await setCacheCollector("market", matchId, output);
      return output;
    }

    // Fallback: existing LLM + web-search market agent (preserves prior behavior
    // for placeholder/knockout fixtures and when odds are unavailable).
    const fallback = await runCollectorAgent(
      "market", matchId, homeTeam, awayTeam, "market.user.md", DEFAULT_CONFIDENCE, context, opts
    );
    await setCacheCollector("market", matchId, fallback);
    return fallback;
  },
};
