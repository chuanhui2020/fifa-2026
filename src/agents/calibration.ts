import type { PredictionResult } from "./types";

export interface CalibrationEntry {
  matchId: string;
  predictedAt: number;
  prediction: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  confidence: number;
  actual?: "home" | "draw" | "away";
  resolvedAt?: number;
}

export interface CalibrationMetrics {
  totalPredictions: number;
  resolvedPredictions: number;
  brierScore: number;
  logLoss: number;
  calibrationByBucket: { bucket: string; predicted: number; actual: number; count: number }[];
  accuracy: number;
}

const store: CalibrationEntry[] = [];

export function recordPrediction(result: PredictionResult): void {
  const existing = store.find((e) => e.matchId === result.matchId);
  if (existing) return;

  store.push({
    matchId: result.matchId,
    predictedAt: result.generatedAt,
    prediction: result.prediction,
    confidence: result.confidence,
  });
}

export function resolveMatch(matchId: string, outcome: "home" | "draw" | "away"): boolean {
  const entry = store.find((e) => e.matchId === matchId);
  if (!entry) return false;
  entry.actual = outcome;
  entry.resolvedAt = Date.now();
  return true;
}

export function getMetrics(): CalibrationMetrics {
  const resolved = store.filter((e) => e.actual !== undefined);

  if (resolved.length === 0) {
    return {
      totalPredictions: store.length,
      resolvedPredictions: 0,
      brierScore: 0,
      logLoss: 0,
      calibrationByBucket: [],
      accuracy: 0,
    };
  }

  let brierSum = 0;
  let logLossSum = 0;
  let correctCount = 0;

  const buckets = new Map<string, { predictedSum: number; actualSum: number; count: number }>();

  for (const entry of resolved) {
    const { prediction, actual } = entry;
    const outcomeVec = { home: 0, draw: 0, away: 0 };
    outcomeVec[actual!] = 1;

    // Brier score: mean squared error of probability forecasts
    brierSum +=
      Math.pow(prediction.homeWin - outcomeVec.home, 2) +
      Math.pow(prediction.draw - outcomeVec.draw, 2) +
      Math.pow(prediction.awayWin - outcomeVec.away, 2);

    // Log loss
    const eps = 1e-10;
    const predictedProb =
      actual === "home" ? prediction.homeWin :
      actual === "draw" ? prediction.draw :
      prediction.awayWin;
    logLossSum += -Math.log(Math.max(predictedProb, eps));

    // Accuracy: did the highest probability match the outcome?
    const maxProb = Math.max(prediction.homeWin, prediction.draw, prediction.awayWin);
    const predicted =
      maxProb === prediction.homeWin ? "home" :
      maxProb === prediction.draw ? "draw" : "away";
    if (predicted === actual) correctCount++;

    // Calibration buckets (0-10%, 10-20%, ..., 90-100%)
    const bucketIdx = Math.min(Math.floor(predictedProb * 10), 9);
    const bucketKey = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}%`;
    const bucket = buckets.get(bucketKey) || { predictedSum: 0, actualSum: 0, count: 0 };
    bucket.predictedSum += predictedProb;
    bucket.actualSum += 1; // outcome happened
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
  }

  const calibrationByBucket = Array.from(buckets.entries()).map(([bucket, data]) => ({
    bucket,
    predicted: data.predictedSum / data.count,
    actual: data.actualSum / data.count,
    count: data.count,
  }));

  return {
    totalPredictions: store.length,
    resolvedPredictions: resolved.length,
    brierScore: brierSum / resolved.length,
    logLoss: logLossSum / resolved.length,
    calibrationByBucket,
    accuracy: correctCount / resolved.length,
  };
}

export function getAllEntries(): CalibrationEntry[] {
  return [...store];
}
