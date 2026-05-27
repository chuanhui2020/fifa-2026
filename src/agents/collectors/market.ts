import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { MatchContext } from "../types";

export const marketAgent: CollectorAgent = {
  id: "market",
  name: "Market Odds Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext) {
    return runCollectorAgent("market", matchId, homeTeam, awayTeam, "market.user.md", 0.8, context);
  },
};
