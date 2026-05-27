import type { Factor, CollectorOutput, Attribution, PredictionResult } from "./types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isValidFactor(f: unknown): f is Factor {
  if (typeof f !== "object" || f === null) return false;
  const obj = f as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    obj.name.length > 0 &&
    typeof obj.value === "number" &&
    isFinite(obj.value) &&
    (obj.direction === "home" || obj.direction === "away" || obj.direction === "neutral") &&
    typeof obj.weight === "number" &&
    obj.weight >= 0 &&
    obj.weight <= 1 &&
    typeof obj.reasoning === "string" &&
    obj.reasoning.length > 0
  );
}

function isValidAttribution(a: unknown): a is Attribution {
  if (typeof a !== "object" || a === null) return false;
  const obj = a as Record<string, unknown>;
  return (
    typeof obj.factor === "string" &&
    typeof obj.contribution === "number" &&
    obj.contribution >= -1 &&
    obj.contribution <= 1 &&
    (obj.direction === "home" || obj.direction === "away" || obj.direction === "neutral") &&
    typeof obj.explanation === "string"
  );
}

function isValidProbability(p: unknown): p is number {
  return typeof p === "number" && isFinite(p) && p >= 0 && p <= 1;
}

export function validateCollectorOutput(
  parsed: unknown,
  agentId: string,
  matchId: string,
  defaultConfidence: number
): CollectorOutput {
  const obj = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;

  const confidence =
    typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : defaultConfidence;

  const factors: Factor[] = Array.isArray(obj.factors)
    ? obj.factors.filter(isValidFactor)
    : [];

  const sources: string[] = Array.isArray(obj.sources)
    ? obj.sources.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];

  if (factors.length === 0) {
    throw new ValidationError(
      `${agentId}Agent: no valid factors produced. Raw factors count: ${Array.isArray(obj.factors) ? obj.factors.length : 0}`
    );
  }

  if (sources.length === 0) {
    throw new ValidationError(
      `${agentId}Agent: no valid sources provided`
    );
  }

  return { agentId, matchId, timestamp: Date.now(), confidence, factors, sources };
}

export function validatePredictionResult(parsed: unknown, matchId: string): PredictionResult {
  const obj = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  const pred = (typeof obj.prediction === "object" && obj.prediction !== null ? obj.prediction : {}) as Record<string, unknown>;

  let homeWin = pred.homeWin;
  let draw = pred.draw;
  let awayWin = pred.awayWin;

  if (!isValidProbability(homeWin) || !isValidProbability(draw) || !isValidProbability(awayWin)) {
    throw new ValidationError(
      `Attribution: invalid probabilities - homeWin=${homeWin}, draw=${draw}, awayWin=${awayWin}. Each must be in [0, 1].`
    );
  }

  let h = homeWin as number;
  let d = draw as number;
  let a = awayWin as number;

  const sum = h + d + a;
  if (sum <= 0) {
    throw new ValidationError("Attribution: probabilities sum to 0 or negative");
  }

  if (Math.abs(sum - 1.0) > 0.05) {
    throw new ValidationError(
      `Attribution: probabilities sum to ${sum.toFixed(4)}, too far from 1.0 (tolerance: 0.05)`
    );
  }

  // Safe normalization for small deviations
  if (Math.abs(sum - 1.0) > 0.001) {
    h /= sum;
    d /= sum;
    a /= sum;
  }

  const attribution: Attribution[] = Array.isArray(obj.attribution)
    ? obj.attribution.filter(isValidAttribution)
    : [];

  const confidence =
    typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5;

  const summary = typeof obj.summary === "string" ? obj.summary : "";
  if (!summary) {
    throw new ValidationError("Attribution: missing summary");
  }

  return {
    matchId,
    prediction: { homeWin: h, draw: d, awayWin: a },
    attribution,
    summary,
    confidence,
    generatedAt: Date.now(),
    sources: [],
    missingAgents: [],
  };
}
