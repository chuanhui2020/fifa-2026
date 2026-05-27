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

export interface MatchContext {
  date: string;
  time: string;
  venue: string;
  city: string;
  stage: string;
  group?: string;
  isNeutralVenue: boolean;
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
