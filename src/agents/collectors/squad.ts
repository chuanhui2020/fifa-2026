import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { MatchContext } from "../types";

export const squadAgent: CollectorAgent = {
  id: "squad",
  name: "Squad & Injury Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext) {
    return runCollectorAgent("squad", matchId, homeTeam, awayTeam, "squad.user.md", 0.5, context);
  },
};
