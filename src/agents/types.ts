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
}
