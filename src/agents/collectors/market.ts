import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";

export const marketAgent: CollectorAgent = {
  id: "market",
  name: "Market Odds Agent",
  async run(matchId, homeTeam, awayTeam) {
    return runCollectorAgent("market", matchId, homeTeam, awayTeam, "market.user.md", 0.8);
  },
};
