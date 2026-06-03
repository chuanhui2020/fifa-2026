import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { MatchContext } from "../types";
import { getCachedCollector, setCacheCollector } from "../cache";

export const formAgent: CollectorAgent = {
  id: "form",
  name: "Recent Form Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext, opts?) {
    if (!opts?.forceRefresh) {
      const cached = await getCachedCollector("form", matchId);
      if (cached) return cached;
    }

    const output = await runCollectorAgent(
      "form", matchId, homeTeam, awayTeam, "form.user.md", 0.6, context, opts
    );
    await setCacheCollector("form", matchId, output);
    return output;
  },
};
