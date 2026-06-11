import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { CollectorOutput, Factor, MatchContext } from "../types";
import { getEloRatings, type MatchElo } from "../elo";
import { validateCollectorOutput } from "../validate";
import { getCachedCollector, setCacheCollector } from "../cache";

const DEFAULT_CONFIDENCE = 0.7;

function buildDeterministicOutput(matchId: string, homeTeam: string, awayTeam: string, elo: MatchElo): CollectorOutput {
  const diff = Math.round(elo.home - elo.away);

  // Factor names contain "Elo rating" with the rating in `value` and a home/away
  // direction, which is exactly what estimateFromElo (base-probability.ts) consumes.
  const factors: Factor[] = [
    {
      name: "Elo rating (home)",
      value: elo.home,
      direction: "home",
      weight: 0.85,
      reasoning: `${homeTeam} Elo ${Math.round(elo.home)} (eloratings.net), ${diff >= 0 ? "+" : ""}${diff} vs ${awayTeam}.`,
    },
    {
      name: "Elo rating (away)",
      value: elo.away,
      direction: "away",
      weight: 0.85,
      reasoning: `${awayTeam} Elo ${Math.round(elo.away)} (eloratings.net), ${-diff >= 0 ? "+" : ""}${-diff} vs ${homeTeam}.`,
    },
  ];

  const base = validateCollectorOutput(
    { factors, sources: ["eloratings.net"], confidence: 0.85 },
    "elo",
    matchId,
    DEFAULT_CONFIDENCE
  );

  return { ...base, deterministic: true };
}

export const eloAgent: CollectorAgent = {
  id: "elo",
  name: "Elo Rating Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext, opts?) {
    if (!opts?.forceRefresh) {
      const cached = await getCachedCollector("elo", matchId);
      if (cached) return cached;
    }

    // Primary: deterministic ratings from eloratings.net. The ratings table is a
    // shared, deterministic snapshot — force-refresh does not bust it (its own
    // 24h TTL governs freshness), only the per-match collector cache above.
    const elo = await getEloRatings(homeTeam, awayTeam);
    if (elo) {
      const output = buildDeterministicOutput(matchId, homeTeam, awayTeam, elo);
      await setCacheCollector("elo", matchId, output);
      return output;
    }

    // Fallback: existing LLM + web-search Elo agent (for placeholder/knockout
    // fixtures and when the ratings table is unavailable).
    const fallback = await runCollectorAgent(
      "elo", matchId, homeTeam, awayTeam, "elo.user.md", DEFAULT_CONFIDENCE, context, opts
    );
    await setCacheCollector("elo", matchId, fallback);
    return fallback;
  },
};
