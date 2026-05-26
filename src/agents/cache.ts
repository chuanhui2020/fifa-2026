import type { PredictionResult } from "./types";

interface CacheEntry {
  result: PredictionResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

export function getCached(matchId: string): PredictionResult | null {
  const entry = cache.get(matchId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(matchId);
    return null;
  }
  return entry.result;
}

export function setCache(matchId: string, result: PredictionResult, ttl = DEFAULT_TTL): void {
  cache.set(matchId, { result, expiresAt: Date.now() + ttl });
}
