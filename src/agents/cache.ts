import type { PredictionResult, CollectorOutput } from "./types";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const TTL = {
  elo: 6 * 60 * 60 * 1000,       // 6 hours - historical data changes slowly
  form: 2 * 60 * 60 * 1000,      // 2 hours - recent results update moderately
  market: 15 * 60 * 1000,        // 15 minutes - odds change frequently
  squad: 30 * 60 * 1000,         // 30 minutes - injury news updates often
  prediction: 30 * 60 * 1000,    // 30 minutes - final prediction
} as const;

const memCache = new Map<string, CacheEntry<unknown>>();

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

let kvStore: KVStore | null = null;

export function setKVStore(kv: KVStore): void {
  kvStore = kv;
}

function getCacheKey(type: string, id: string): string {
  return `${type}:${id}`;
}

async function getFromCache<T>(key: string): Promise<T | null> {
  const entry = memCache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() <= entry.expiresAt) return entry.data;
  if (entry) memCache.delete(key);

  if (kvStore) {
    const raw = await kvStore.get(key);
    if (raw) {
      try {
        const data: T = JSON.parse(raw);
        memCache.set(key, { data, expiresAt: Date.now() + TTL.prediction });
        return data;
      } catch {
        // corrupted entry
      }
    }
  }

  return null;
}

async function setToCache<T>(key: string, data: T, ttl: number): Promise<void> {
  memCache.set(key, { data, expiresAt: Date.now() + ttl });
  if (kvStore) {
    await kvStore.put(key, JSON.stringify(data), {
      expirationTtl: Math.ceil(ttl / 1000),
    });
  }
}

export async function getCached(matchId: string): Promise<PredictionResult | null> {
  return getFromCache<PredictionResult>(getCacheKey("prediction", matchId));
}

export async function setCache(matchId: string, result: PredictionResult): Promise<void> {
  await setToCache(getCacheKey("prediction", matchId), result, TTL.prediction);
}

export async function getCachedCollector(agentId: string, matchId: string): Promise<CollectorOutput | null> {
  const ttlKey = agentId as keyof typeof TTL;
  if (!(ttlKey in TTL)) return null;
  return getFromCache<CollectorOutput>(getCacheKey(agentId, matchId));
}

export async function setCacheCollector(agentId: string, matchId: string, output: CollectorOutput): Promise<void> {
  const ttlKey = agentId as keyof typeof TTL;
  const ttl = TTL[ttlKey] || TTL.prediction;
  await setToCache(getCacheKey(agentId, matchId), output, ttl);
}
