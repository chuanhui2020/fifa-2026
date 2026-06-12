import type { Factor, CollectorOutput, Attribution, PredictionResult } from "./types";
import type { BaseProbability } from "./base-probability";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Maximum absolute probability-point deviation the attribution model may apply
 * to any single outcome relative to the deterministic base probability. The
 * prompt instructs the model to stay within this band; this enforces it so a
 * hallucinated swing can't override a reliable market/Elo anchor.
 */
export const MAX_ANCHOR_DEVIATION = 0.15;

/**
 * Clamp each outcome to within ±MAX_ANCHOR_DEVIATION of the base while
 * maintaining sum=1. Values that hit a bound are fixed there; remaining
 * probability is distributed among unfixed outcomes proportionally.
 */
function clampToAnchor(
  pred: { homeWin: number; draw: number; awayWin: number },
  base: BaseProbability
): { homeWin: number; draw: number; awayWin: number } {
  const baseArr = [base.homeWin, base.draw, base.awayWin];
  const predArr = [pred.homeWin, pred.draw, pred.awayWin];
  const result = [0, 0, 0];
  const fixed = [false, false, false];

  for (let iter = 0; iter < 3; iter++) {
    let fixedSum = 0;
    let freeOrigSum = 0;

    for (let i = 0; i < 3; i++) {
      if (fixed[i]) fixedSum += result[i];
      else freeOrigSum += predArr[i];
    }

    const remaining = 1 - fixedSum;
    let newlyFixed = false;

    for (let i = 0; i < 3; i++) {
      if (fixed[i]) continue;
      const share = freeOrigSum > 0
        ? predArr[i] / freeOrigSum * remaining
        : remaining / (3 - fixed.filter(Boolean).length);
      const lo = baseArr[i] - MAX_ANCHOR_DEVIATION;
      const hi = baseArr[i] + MAX_ANCHOR_DEVIATION;

      if (share <= lo) { result[i] = lo; fixed[i] = true; newlyFixed = true; break; }
      else if (share >= hi) { result[i] = hi; fixed[i] = true; newlyFixed = true; break; }
      else { result[i] = share; }
    }

    if (!newlyFixed) break;
  }

  const sum = result[0] + result[1] + result[2];
  if (sum <= 0 || !isFinite(sum)) return { homeWin: base.homeWin, draw: base.draw, awayWin: base.awayWin };
  if (Math.abs(sum - 1) > 0.001) {
    return { homeWin: result[0] / sum, draw: result[1] / sum, awayWin: result[2] / sum };
  }
  return { homeWin: result[0], draw: result[1], awayWin: result[2] };
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

export function validatePredictionResult(
  parsed: unknown,
  matchId: string,
  base?: BaseProbability
): PredictionResult {
  const obj = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  const pred = (typeof obj.prediction === "object" && obj.prediction !== null ? obj.prediction : {}) as Record<string, unknown>;

  const homeWin = pred.homeWin;
  const draw = pred.draw;
  const awayWin = pred.awayWin;

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

  // Enforce the ±15% anchor: the model is told to stay within this band of the
  // deterministic base, but the prompt alone is only a soft constraint. Clamp
  // here so a hallucinated swing can't override a reliable market/Elo anchor.
  if (base) {
    const anchored = clampToAnchor({ homeWin: h, draw: d, awayWin: a }, base);
    h = anchored.homeWin;
    d = anchored.draw;
    a = anchored.awayWin;

    // Knockout: draw is not a valid final outcome. Force it to 0 and redistribute.
    if (base.draw === 0 && d > 0) {
      const total = h + a;
      if (total > 0) { h = (h + d * (h / total)); a = (a + d * (a / total)); }
      else { h = 0.5; a = 0.5; }
      d = 0;
    }
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
    ...(base
      ? { baseProbability: { homeWin: base.homeWin, draw: base.draw, awayWin: base.awayWin, source: base.source } }
      : {}),
  };
}
