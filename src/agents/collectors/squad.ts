import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { MatchContext } from "../types";
import { getCachedCollector, setCacheCollector } from "../cache";

export const squadAgent: CollectorAgent = {
  id: "squad",
  name: "Squad & Injury Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext, opts?) {
    if (!opts?.forceRefresh) {
      const cached = await getCachedCollector("squad", matchId);
      if (cached) return cached;
    }

    const output = await runCollectorAgent(
      "squad", matchId, homeTeam, awayTeam, "squad.user.md", 0.5, context, opts
    );
    await setCacheCollector("squad", matchId, output);
    return output;
  },
};
