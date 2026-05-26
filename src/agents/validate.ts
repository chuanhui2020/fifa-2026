import type { Factor, CollectorOutput, Attribution, PredictionResult } from "./types";

function isValidFactor(f: unknown): f is Factor {
  if (typeof f !== "object" || f === null) return false;
  const obj = f as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.value === "number" &&
    (obj.direction === "home" || obj.direction === "away" || obj.direction === "neutral") &&
    typeof obj.weight === "number" &&
    obj.weight >= 0 &&
    obj.weight <= 1 &&
    typeof obj.reasoning === "string"
  );
}

function isValidAttribution(a: unknown): a is Attribution {
  if (typeof a !== "object" || a === null) return false;
  const obj = a as Record<string, unknown>;
  return (
    typeof obj.factor === "string" &&
    typeof obj.contribution === "number" &&
    (obj.direction === "home" || obj.direction === "away" || obj.direction === "neutral") &&
    typeof obj.explanation === "string"
  );
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
    ? obj.sources.filter((s): s is string => typeof s === "string")
    : [];

  return { agentId, matchId, timestamp: Date.now(), confidence, factors, sources };
}

export function validatePredictionResult(parsed: unknown, matchId: string): PredictionResult {
  const obj = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  const pred = (typeof obj.prediction === "object" && obj.prediction !== null ? obj.prediction : {}) as Record<string, unknown>;

  let homeWin = typeof pred.homeWin === "number" ? pred.homeWin : 0.33;
  let draw = typeof pred.draw === "number" ? pred.draw : 0.34;
  let awayWin = typeof pred.awayWin === "number" ? pred.awayWin : 0.33;

  const sum = homeWin + draw + awayWin;
  if (sum <= 0 || Math.abs(sum - 1.0) > 0.01) {
    const s = sum <= 0 ? 3 : sum;
    homeWin /= s;
    draw /= s;
    awayWin /= s;
  }

  const attribution: Attribution[] = Array.isArray(obj.attribution)
    ? obj.attribution.filter(isValidAttribution)
    : [];

  const confidence =
    typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5;

  return {
    matchId,
    prediction: { homeWin, draw, awayWin },
    attribution,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    confidence,
    generatedAt: Date.now(),
  };
}
