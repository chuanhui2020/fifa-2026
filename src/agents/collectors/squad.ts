import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";

export const squadAgent: CollectorAgent = {
  id: "squad",
  name: "Squad & Injury Agent",
  async run(matchId, homeTeam, awayTeam) {
    return runCollectorAgent("squad", matchId, homeTeam, awayTeam, "squad.user.md", 0.5);
  },
};
