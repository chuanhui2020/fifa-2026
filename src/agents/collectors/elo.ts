import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";

export const eloAgent: CollectorAgent = {
  id: "elo",
  name: "Elo Rating Agent",
  async run(matchId, homeTeam, awayTeam) {
    return runCollectorAgent("elo", matchId, homeTeam, awayTeam, "elo.user.md", 0.7);
  },
};
