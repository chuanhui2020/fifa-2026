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
  /** Pages 站点域名（如 https://fifa-2026.pages.dev），用于回调 /api/cron-predict 触发定时预测。 */
  PAGES_BASE_URL?: string;
  /** 与 Pages 端 CRON_SECRET 共享的密钥，鉴权 cron 回调。 */
  CRON_SECRET?: string;
}
