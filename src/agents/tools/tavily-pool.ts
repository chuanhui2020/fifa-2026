import { getKVStore } from "../cache";

/**
 * Tavily 多账号号池:把搜索调用均匀分摊到 N 个 key 上,跟踪每号本月用量,
 * 对额度耗尽的号自动剔除到下月 2 号。状态存 KV(单键 tavily:pool),无 KV
 * 绑定时退化为模块级内存态。计数为 KV 软计数 + 安全余量(KV 无原子递增,
 * 高并发下小幅偏差由余量 + 429 兜底吸收)。
 */

const POOL_KEY = "tavily:pool";
const DEFAULT_LIMIT = 1000;
const DEFAULT_MARGIN = 50;
const CN_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8(账务月份/解封时点都按北京时间)

interface AccountState {
  used: number;
  failed: number;
  lastUsedAt: number | null;
  exhausted: boolean;
  ejectedUntil: number | null; // ms epoch;下月 2 号 00:00(UTC+8)
  lastError: string | null;
}

interface PoolState {
  month: string; // YYYY-MM(UTC+8)
  accounts: Record<string, AccountState>;
}

// ---------- env ----------

/** 解析号池 key:优先 TAVILY_API_KEYS(逗号分隔),回退单个 TAVILY_API_KEY。 */
export function getPoolKeys(): string[] {
  const multi = (process.env.TAVILY_API_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (multi.length > 0) return [...new Set(multi)];
  const single = (process.env.TAVILY_API_KEY || "").trim();
  return single ? [single] : [];
}

function monthlyLimit(): number {
  const n = parseInt(process.env.TAVILY_MONTHLY_LIMIT || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
}

function safetyMargin(): number {
  const n = parseInt(process.env.TAVILY_SAFETY_MARGIN || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MARGIN;
}

/** 有效上限:到达即停止派发该号(留余量防 KV 计数偏差导致真实超额)。 */
function effectiveCap(): number {
  return Math.max(1, monthlyLimit() - safetyMargin());
}

// ---------- keyId(脱敏,绝不外泄原始 key)----------

const keyIdCache = new Map<string, string>();

export async function keyIdFor(key: string): Promise<string> {
  const cached = keyIdCache.get(key);
  if (cached) return cached;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const id = hex.slice(0, 8);
  keyIdCache.set(key, id);
  return id;
}

// ---------- 时间(UTC+8)----------

function cnNow(): Date {
  // 返回一个其 UTC 字段即为北京墙钟的 Date
  return new Date(Date.now() + CN_OFFSET_MS);
}

function currentMonth(): string {
  const d = cnNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 下月 2 号 00:00(UTC+8)的真实 epoch ms。2 号晚于 Tavily 月初重置,安全。 */
function secondOfNextMonth(): number {
  const d = cnNow();
  const cnWall = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 2, 0, 0, 0);
  return cnWall - CN_OFFSET_MS;
}

// ---------- 状态读写 ----------

let memState: PoolState | null = null;

async function loadRaw(): Promise<PoolState | null> {
  const kv = getKVStore();
  if (kv) {
    const raw = await kv.get(POOL_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as PoolState;
      } catch {
        // 损坏则重建
      }
    }
    return null;
  }
  return memState;
}

async function saveRaw(state: PoolState): Promise<void> {
  memState = state;
  const kv = getKVStore();
  if (kv) await kv.put(POOL_KEY, JSON.stringify(state));
}

function emptyAccount(): AccountState {
  return { used: 0, failed: 0, lastUsedAt: null, exhausted: false, ejectedUntil: null, lastError: null };
}

function ensureAccount(state: PoolState, keyId: string): AccountState {
  let a = state.accounts[keyId];
  if (!a) {
    a = emptyAccount();
    state.accounts[keyId] = a;
  }
  return a;
}

/** 月份翻转重置 + 过期剔除复活(不依赖 key 列表,供 report* 复用)。 */
async function loadNormalized(): Promise<PoolState> {
  let state = await loadRaw();
  const month = currentMonth();
  const now = Date.now();

  if (!state) state = { month, accounts: {} };

  if (state.month !== month) {
    // 新账务月:计数清零;剔除状态按 ejectedUntil 重算(被剔除到下月 2 号的号本月初仍剔除)
    for (const id of Object.keys(state.accounts)) {
      const a = state.accounts[id];
      a.used = 0;
      a.failed = 0;
      a.exhausted = !!(a.ejectedUntil && now < a.ejectedUntil);
    }
    state.month = month;
  }

  // 解封时点已过 → 自动复活
  for (const id of Object.keys(state.accounts)) {
    const a = state.accounts[id];
    if (a.exhausted && a.ejectedUntil && now >= a.ejectedUntil) {
      a.exhausted = false;
      a.ejectedUntil = null;
    }
  }

  return state;
}

// ---------- 选号 ----------

/**
 * 从健康号中按 used 最小(并列随机)选一个;无健康号返回 null。
 * `exclude` 用于同一次搜索的失败转移:跳过本次已试过的 keyId。
 */
export async function acquireKey(
  exclude?: Set<string>
): Promise<{ keyId: string; apiKey: string } | null> {
  const keys = getPoolKeys();
  if (keys.length === 0) return null;

  const state = await loadNormalized();
  const cap = effectiveCap();

  const healthy: { key: string; id: string; used: number }[] = [];
  for (const key of keys) {
    const id = await keyIdFor(key);
    const a = ensureAccount(state, id);
    if (a.exhausted || a.used >= cap) continue;
    if (exclude && exclude.has(id)) continue;
    healthy.push({ key, id, used: a.used });
  }

  await saveRaw(state); // 持久化迁移/复活/新账户

  if (healthy.length === 0) return null;

  const minUsed = Math.min(...healthy.map((h) => h.used));
  const candidates = healthy.filter((h) => h.used === minUsed);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return { keyId: pick.id, apiKey: pick.key };
}

// ---------- 上报 ----------

export async function reportSuccess(keyId: string): Promise<void> {
  const state = await loadNormalized();
  const a = ensureAccount(state, keyId);
  a.used += 1;
  a.lastUsedAt = Date.now();
  if (a.used >= effectiveCap()) {
    a.exhausted = true;
    a.ejectedUntil = secondOfNextMonth();
    a.lastError = "本月额度达上限（自动剔除）";
  }
  await saveRaw(state);
}

export async function reportExhausted(keyId: string, reason: string): Promise<void> {
  const state = await loadNormalized();
  const a = ensureAccount(state, keyId);
  a.exhausted = true;
  a.ejectedUntil = secondOfNextMonth();
  a.lastError = reason;
  await saveRaw(state);
}

export async function reportTransient(keyId: string, reason: string): Promise<void> {
  const state = await loadNormalized();
  const a = ensureAccount(state, keyId);
  a.failed += 1;
  a.lastError = reason;
  await saveRaw(state);
}

/** 429 响应体是否指向月度额度耗尽(而非瞬时限流)。 */
export function isMonthlyExhaustion(bodyText: string): boolean {
  return /usage|credit|quota|monthly|plan limit|exhaust/i.test(bodyText);
}

// ---------- 监控 / 手动控制 ----------

export interface AccountStatus {
  keyId: string;
  used: number;
  limit: number;
  remaining: number;
  failed: number;
  exhausted: boolean;
  ejectedUntil: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

export interface PoolStatus {
  accounts: AccountStatus[];
  totals: {
    accounts: number;
    healthy: number;
    exhausted: number;
    totalUsed: number;
    totalRemaining: number;
    limitPerAccount: number;
  };
}

export async function getPoolStatus(): Promise<PoolStatus> {
  const keys = getPoolKeys();
  const state = await loadNormalized();
  const cap = effectiveCap();
  const limit = monthlyLimit();

  const accounts: AccountStatus[] = [];
  let healthy = 0;
  let exhausted = 0;
  let totalUsed = 0;
  let totalRemaining = 0;

  for (const key of keys) {
    const id = await keyIdFor(key);
    const a = ensureAccount(state, id);
    const remaining = Math.max(0, limit - a.used);
    const isHealthy = !a.exhausted && a.used < cap;
    if (isHealthy) healthy++;
    else exhausted++;
    totalUsed += a.used;
    totalRemaining += a.exhausted ? 0 : remaining;
    accounts.push({
      keyId: id,
      used: a.used,
      limit,
      remaining,
      failed: a.failed,
      exhausted: a.exhausted,
      ejectedUntil: a.ejectedUntil ? new Date(a.ejectedUntil).toISOString() : null,
      lastUsedAt: a.lastUsedAt ? new Date(a.lastUsedAt).toISOString() : null,
      lastError: a.lastError,
    });
  }

  await saveRaw(state);

  return {
    accounts,
    totals: {
      accounts: keys.length,
      healthy,
      exhausted,
      totalUsed,
      totalRemaining,
      limitPerAccount: limit,
    },
  };
}

/** 手动解封:清除剔除状态(keyId 省略则全部)。 */
export async function reinstate(keyId?: string): Promise<void> {
  const state = await loadNormalized();
  const ids = keyId ? [keyId] : Object.keys(state.accounts);
  for (const id of ids) {
    const a = state.accounts[id];
    if (!a) continue;
    a.exhausted = false;
    a.ejectedUntil = null;
  }
  await saveRaw(state);
}

/** 应急:计数清零并解封全部。 */
export async function resetCounters(): Promise<void> {
  const state = await loadNormalized();
  for (const id of Object.keys(state.accounts)) {
    state.accounts[id] = emptyAccount();
  }
  await saveRaw(state);
}
