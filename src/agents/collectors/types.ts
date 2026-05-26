export type { CollectorOutput } from "../types";

export interface CollectorAgent {
  id: string;
  name: string;
  run(matchId: string, homeTeam: string, awayTeam: string): Promise<import("../types").CollectorOutput>;
}
