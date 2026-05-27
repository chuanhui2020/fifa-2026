import type { CollectorAgent } from "./types";
import { runCollectorAgent } from "./runner";
import type { MatchContext } from "../types";

export const formAgent: CollectorAgent = {
  id: "form",
  name: "Recent Form Agent",
  async run(matchId, homeTeam, awayTeam, context?: MatchContext) {
    return runCollectorAgent("form", matchId, homeTeam, awayTeam, "form.user.md", 0.6, context);
  },
};
