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
  oddsSnapshot: 3 * 60 * 60 * 1000, // 3 hours - whole-tournament odds snapshot; long TTL keeps API calls within the free quota
  eloRatings: 24 * 60 * 60 * 1000,  // 24 hours - Elo changes only on international match days
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

/**
 * Generic long-lived snapshot store shared across matches (whole-tournament
 * odds, Elo ratings table, …). A single fetch populates it; per-match lookups
 * read from here, so per-match prediction freshness is decoupled from the
 * upstream fetch frequency. `namespace` keeps different sources from colliding.
 */
export async function getSnapshot<T>(namespace: string, key: string): Promise<T | null> {
  return getFromCache<T>(getCacheKey(namespace, key));
}

export async function setSnapshot<T>(namespace: string, key: string, data: T, ttl: number): Promise<void> {
  await setToCache(getCacheKey(namespace, key), data, ttl);
}

// Backward-compatible odds-specific aliases (the odds module predates the generic helpers).
export function getOddsSnapshot<T>(key: string): Promise<T | null> {
  return getSnapshot<T>("odds", key);
}

export function setOddsSnapshot<T>(key: string, data: T): Promise<void> {
  return setSnapshot<T>("odds", key, data, TTL.oddsSnapshot);
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
