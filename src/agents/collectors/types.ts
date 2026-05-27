import type { MatchContext } from "../types";
export type { CollectorOutput } from "../types";

export interface CollectorAgent {
  id: string;
  name: string;
  run(matchId: string, homeTeam: string, awayTeam: string, context?: MatchContext): Promise<import("../types").CollectorOutput>;
}
