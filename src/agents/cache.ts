import type { PredictionResult } from "./types";

interface CacheEntry {
  result: PredictionResult;
  expiresAt: number;
}

const memCache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 30 * 60 * 1000;

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

let kvStore: KVStore | null = null;

export function setKVStore(kv: KVStore): void {
  kvStore = kv;
}

export async function getCached(matchId: string): Promise<PredictionResult | null> {
  const entry = memCache.get(matchId);
  if (entry && Date.now() <= entry.expiresAt) return entry.result;
  if (entry) memCache.delete(matchId);

  if (kvStore) {
    const raw = await kvStore.get(`prediction:${matchId}`);
    if (raw) {
      try {
        const result: PredictionResult = JSON.parse(raw);
        memCache.set(matchId, { result, expiresAt: Date.now() + DEFAULT_TTL });
        return result;
      } catch {
        // corrupted cache entry, ignore
      }
    }
  }

  return null;
}

export async function setCache(
  matchId: string,
  result: PredictionResult,
  ttl = DEFAULT_TTL
): Promise<void> {
  memCache.set(matchId, { result, expiresAt: Date.now() + ttl });
  if (kvStore) {
    await kvStore.put(`prediction:${matchId}`, JSON.stringify(result), {
      expirationTtl: Math.ceil(ttl / 1000),
    });
  }
}
