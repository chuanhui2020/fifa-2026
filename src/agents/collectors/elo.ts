import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { MatchContext } from "../types";

export const eloAgent: CollectorAgent = {
  id: "elo",
  name: "Elo Rating Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext) {
    return runCollectorAgent("elo", matchId, homeTeam, awayTeam, "elo.user.md", 0.7, context);
  },
};
