export type MatchStatus = "upcoming" | "live" | "finished";
export type MatchStage = "group" | "round32" | "round16" | "quarter" | "semi" | "third" | "final";

export interface Match {
  id: number;
  espnId?: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  group?: string;
  stage: MatchStage;
  venue: string;
  city: string;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
}

export interface Env {
  FIFA_MATCHES: KVNamespace;
  FOOTBALL_DATA_API_KEY?: string;
}
