export interface Factor {
  name: string;
  value: number;
  direction: "home" | "away" | "neutral";
  weight: number;
  reasoning: string;
}

export interface CollectorOutput {
  agentId: string;
  matchId: string;
  timestamp: number;
  confidence: number;
  factors: Factor[];
  sources: string[];
  /**
   * Structured win/draw/away probabilities, when this collector can produce
   * them deterministically (currently the market agent from devigged odds).
   * Lets computeBaseProbability use a reliable anchor instead of string-matching
   * factor names. Sums to ~1.
   */
  impliedProbability?: { homeWin: number; draw: number; awayWin: number };
}

export interface Attribution {
  factor: string;
  contribution: number;
  direction: "home" | "away" | "neutral";
  explanation: string;
}

export interface PredictionResult {
  matchId: string;
  prediction: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  attribution: Attribution[];
  summary: string;
  confidence: number;
  generatedAt: number;
  sources: string[];
  missingAgents: string[];
  log?: PredictionLog;
}

/**
 * 单条「重大归因变更」：相对上一版预测，本次出现的显著波动。
 * 用于复盘时重点高亮——为什么 AI 改主意了。
 */
export interface PredictionShift {
  /**
   * outcome-flip: top 结论翻转（主胜↔客胜↔平）
   * prob-swing:   某一结果概率变化 ≥ 阈值（默认 10pp）
   * factor-flip:  某高权重因子方向反转
   * factor-added / factor-removed: 高权重因子出现 / 消失
   */
  kind: "outcome-flip" | "prob-swing" | "factor-flip" | "factor-added" | "factor-removed";
  /** 简短标签，如「主胜→平局」「Elo 排名」 */
  label: string;
  /** 变化前的值（概率类为 0-1，因子类为方向字符串） */
  before?: string;
  /** 变化后的值 */
  after?: string;
  /** 一句话中文说明，直接展示给用户 */
  note: string;
}

/**
 * 一次预测的精简历史快照。每场比赛保留一个数组（最近 N 次），
 * 既供复盘画概率演变，也承载相对上一版的重大变更。
 */
export interface PredictionSnapshot {
  at: number;
  prediction: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  confidence: number;
  /** 该次预测贡献最大的前几个因子（名称 + 方向），用于变更对比与展示 */
  topFactors: { factor: string; direction: "home" | "away" | "neutral"; contribution: number }[];
  /** 相对上一版的重大变更；首次预测为空数组 */
  shifts: PredictionShift[];
}

export interface MatchContext {
  date: string;
  time: string;
  venue: string;
  city: string;
  stage: string;
  group?: string;
  isNeutralVenue: boolean;
}

const KNOCKOUT_STAGES = new Set(["round32", "round16", "quarter", "semi", "third", "final"]);

export function isKnockoutStage(stage: string): boolean {
  return KNOCKOUT_STAGES.has(stage);
}

export interface SearchMetrics {
  queriesCount: number;
  resultsCount: number;
  queries: string[];
  sourceUrls: string[];
}

export interface PredictionLog {
  matchId: string;
  startedAt: number;
  completedAt: number;
  collectors: {
    agentId: string;
    durationMs: number;
    status: "success" | "failed" | "timeout";
    factorsCount: number;
    sourcesCount: number;
    searchMetrics?: SearchMetrics;
    error?: string;
  }[];
  attributionDurationMs: number;
  totalDurationMs: number;
  validCollectorCount: number;
}

export interface TextContent {
  type: "text";
  text: string;
}

export function isTextContent(c: unknown): c is TextContent {
  return (
    typeof c === "object" &&
    c !== null &&
    (c as Record<string, unknown>).type === "text" &&
    typeof (c as Record<string, unknown>).text === "string"
  );
}
