import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";

export const formAgent: CollectorAgent = {
  id: "form",
  name: "Recent Form Agent",
  async run(matchId, homeTeam, awayTeam) {
    return runCollectorAgent("form", matchId, homeTeam, awayTeam, "form.user.md", 0.6);
  },
};
