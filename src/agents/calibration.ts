import type { PredictionResult } from "./types";
import type { KVStore } from "./cache";

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

const CAL_PREFIX = "cal:";
const MANIFEST_KEY = "cal:manifest";

let kvStore: KVStore | null = null;

export function setCalibrationStore(kv: KVStore): void {
  kvStore = kv;
}

async function getManifest(): Promise<string[]> {
  if (!kvStore) return [];
  const raw = await kvStore.get(MANIFEST_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function putManifest(ids: string[]): Promise<void> {
  if (!kvStore) return;
  await kvStore.put(MANIFEST_KEY, JSON.stringify(ids));
}

async function getEntry(matchId: string): Promise<CalibrationEntry | null> {
  if (!kvStore) return null;
  const raw = await kvStore.get(CAL_PREFIX + matchId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function putEntry(entry: CalibrationEntry): Promise<void> {
  if (!kvStore) return;
  await kvStore.put(CAL_PREFIX + entry.matchId, JSON.stringify(entry));
}

export async function recordPrediction(result: PredictionResult): Promise<void> {
  if (!kvStore) return;
  const existing = await getEntry(result.matchId);
  if (existing) return;

  const entry: CalibrationEntry = {
    matchId: result.matchId,
    predictedAt: result.generatedAt,
    prediction: result.prediction,
    confidence: result.confidence,
  };

  await putEntry(entry);
  const manifest = await getManifest();
  if (!manifest.includes(result.matchId)) {
    manifest.push(result.matchId);
    await putManifest(manifest);
  }
}

export async function resolveMatch(matchId: string, outcome: "home" | "draw" | "away"): Promise<boolean> {
  const entry = await getEntry(matchId);
  if (!entry) return false;
  entry.actual = outcome;
  entry.resolvedAt = Date.now();
  await putEntry(entry);
  return true;
}

export async function getMetrics(): Promise<CalibrationMetrics> {
  const manifest = await getManifest();
  const entries: CalibrationEntry[] = [];
  for (const id of manifest) {
    const e = await getEntry(id);
    if (e) entries.push(e);
  }

  const resolved = entries.filter((e) => e.actual !== undefined);

  if (resolved.length === 0) {
    return {
      totalPredictions: entries.length,
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

    brierSum +=
      Math.pow(prediction.homeWin - outcomeVec.home, 2) +
      Math.pow(prediction.draw - outcomeVec.draw, 2) +
      Math.pow(prediction.awayWin - outcomeVec.away, 2);

    const eps = 1e-10;
    const predictedProb =
      actual === "home" ? prediction.homeWin :
      actual === "draw" ? prediction.draw :
      prediction.awayWin;
    logLossSum += -Math.log(Math.max(predictedProb, eps));

    const maxProb = Math.max(prediction.homeWin, prediction.draw, prediction.awayWin);
    const predicted =
      maxProb === prediction.homeWin ? "home" :
      maxProb === prediction.draw ? "draw" : "away";
    if (predicted === actual) correctCount++;

    const bucketIdx = Math.min(Math.floor(predictedProb * 10), 9);
    const bucketKey = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}%`;
    const bucket = buckets.get(bucketKey) || { predictedSum: 0, actualSum: 0, count: 0 };
    bucket.predictedSum += predictedProb;
    bucket.actualSum += 1;
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
    totalPredictions: entries.length,
    resolvedPredictions: resolved.length,
    brierScore: brierSum / resolved.length,
    logLoss: logLossSum / resolved.length,
    calibrationByBucket,
    accuracy: correctCount / resolved.length,
  };
}

export async function getAllEntries(): Promise<CalibrationEntry[]> {
  const manifest = await getManifest();
  const entries: CalibrationEntry[] = [];
  for (const id of manifest) {
    const e = await getEntry(id);
    if (e) entries.push(e);
  }
  return entries;
}
