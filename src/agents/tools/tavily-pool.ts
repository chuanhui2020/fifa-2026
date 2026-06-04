import { getKVStore } from "../cache";

/**
 * Tavily 多账号号池:把搜索调用均匀分摊到 N 个 key 上,跟踪每号本月用量,
 * 对额度耗尽的号自动剔除到下月 2 号。
 *
 * 存储:KV 是所有 key 的唯一真相源(单键 tavily:pool,内含原始 key + 元数据)。
 * 不再读任何环境变量——账号全部经「号池管理」界面增删。无 KV 绑定时退化为
 * 模块级内存态(仅本地开发)。计数为 KV 软计数 + 安全余量(KV 无原子递增,
 * 高并发下小幅偏差由余量 + 429 兜底吸收);面板可叠加 Tavily 官方 /usage 权威值。
 */

const POOL_KEY = "tavily:pool";
const DEFAULT_LIMIT = 1000;
const DEFAULT_MARGIN = 50;
const CN_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8(账务月份/解封时点都按北京时间)

interface AccountState {
  apiKey: string;              // 原始 key — KV 是唯一真相源
  keyPreview: string;          // 末 4 位,仅供界面区分(原始 key 绝不外泄前端)
  paused: boolean;             // 手动暂停:不派发,但保留计数与额度
  used: number;
  failed: number;
  lastUsedAt: number | null;
  exhausted: boolean;
  ejectedUntil: number | null; // ms epoch;下月 2 号 00:00(UTC+8)
  addedAt: number;
  lastError: string | null;
}

interface PoolState {
  month: string; // YYYY-MM(UTC+8)
  accounts: Record<string, AccountState>; // keyId → 账号
}

// ---------- 配置(非 key,保留环境变量)----------

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

function previewOf(key: string): string {
  const t = key.trim();
  return t.length <= 4 ? t : t.slice(-4);
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

/** 月份翻转重置 + 过期剔除复活。 */
async function loadNormalized(): Promise<PoolState> {
  let state = await loadRaw();
  const month = currentMonth();
  const now = Date.now();

  if (!state) state = { month, accounts: {} };
  if (!state.accounts) state.accounts = {};

  // 迁移:剔除旧版遗留的「幽灵号」——旧设计只存 keyId 哈希、原始 key 在环境变量里,
  // 这些条目没有 apiKey,在纯 KV 架构下无法派发也无法管理,直接清掉。
  for (const id of Object.keys(state.accounts)) {
    const a = state.accounts[id];
    if (!a || typeof a.apiKey !== "string" || a.apiKey.length === 0) {
      delete state.accounts[id];
    }
  }

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

// ---------- 号池规模(供 web-search 判断是否有可用账号)----------

/** 当前号池账号总数(含暂停/剔除)。web-search 用它判断号池是否为空。 */
export async function poolSize(): Promise<number> {
  const state = await loadNormalized();
  return Object.keys(state.accounts).length;
}

// ---------- 选号 ----------

/**
 * 从健康号中按 used 最小(并列随机)选一个;无健康号返回 null。
 * 跳过 paused / exhausted / 已达上限的号。
 * `exclude` 用于同一次搜索的失败转移:跳过本次已试过的 keyId。
 */
export async function acquireKey(
  exclude?: Set<string>
): Promise<{ keyId: string; apiKey: string } | null> {
  const state = await loadNormalized();
  const cap = effectiveCap();

  const healthy: { keyId: string; apiKey: string; used: number }[] = [];
  for (const [id, a] of Object.entries(state.accounts)) {
    if (a.paused || a.exhausted || a.used >= cap) continue;
    if (exclude && exclude.has(id)) continue;
    healthy.push({ keyId: id, apiKey: a.apiKey, used: a.used });
  }

  if (healthy.length === 0) return null;

  const minUsed = Math.min(...healthy.map((h) => h.used));
  const candidates = healthy.filter((h) => h.used === minUsed);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return { keyId: pick.keyId, apiKey: pick.apiKey };
}

// ---------- 上报 ----------

export async function reportSuccess(keyId: string): Promise<void> {
  const state = await loadNormalized();
  const a = state.accounts[keyId];
  if (!a) return;
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
  const a = state.accounts[keyId];
  if (!a) return;
  a.exhausted = true;
  a.ejectedUntil = secondOfNextMonth();
  a.lastError = reason;
  await saveRaw(state);
}

export async function reportTransient(keyId: string, reason: string): Promise<void> {
  const state = await loadNormalized();
  const a = state.accounts[keyId];
  if (!a) return;
  a.failed += 1;
  a.lastError = reason;
  await saveRaw(state);
}

/** 429 响应体是否指向月度额度耗尽(而非瞬时限流)。 */
export function isMonthlyExhaustion(bodyText: string): boolean {
  return /usage|credit|quota|monthly|plan limit|exhaust/i.test(bodyText);
}

// ---------- Tavily 官方真实用量(GET /usage)----------

/** 单号的官方真实用量(来自 Tavily /usage,权威值)。 */
export interface LiveUsage {
  used: number | null;        // key.usage
  limit: number | null;       // key.limit(unlimited 时为 null)
  remaining: number | null;   // limit - used(任一为 null 则 null)
  plan: string | null;        // account.current_plan
  error: string | null;       // 拉取失败原因(该号单独失败不影响其它号)
}

const USAGE_TIMEOUT_MS = 8_000;

/**
 * 调 Tavily 官方 `GET /usage` 拿单个 key 的真实用量。这是权威数字(KV 软计数只是
 * 本地估算)。按需触发(面板打开/新增校验时),不在每次搜索时调用,避免反噬额度/限流。
 */
async function fetchOneUsage(apiKey: string): Promise<LiveUsage> {
  const empty = (error: string | null): LiveUsage => ({
    used: null, limit: null, remaining: null, plan: null, error,
  });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), USAGE_TIMEOUT_MS);
    const res = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return empty(`HTTP ${res.status}`);
    const data = await res.json() as {
      key?: { usage?: number; limit?: number | null };
      account?: { current_plan?: string };
    };
    const used = typeof data.key?.usage === "number" ? data.key.usage : null;
    const limit = typeof data.key?.limit === "number" ? data.key.limit : null;
    const remaining = used !== null && limit !== null ? Math.max(0, limit - used) : null;
    return { used, limit, remaining, plan: data.account?.current_plan ?? null, error: null };
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    return empty(isTimeout ? "超时" : "网络错误");
  }
}

/** 并发拉取号池内所有 key 的官方真实用量,返回 keyId → LiveUsage。 */
export async function fetchRealUsage(): Promise<Record<string, LiveUsage>> {
  const state = await loadNormalized();
  const out: Record<string, LiveUsage> = {};
  await Promise.all(
    Object.entries(state.accounts).map(async ([id, a]) => {
      out[id] = await fetchOneUsage(a.apiKey);
    })
  );
  return out;
}

// ---------- 监控 / 手动控制 ----------

export interface AccountStatus {
  keyId: string;
  keyPreview: string;    // 末 4 位(原始 key 不外泄)
  used: number;          // KV 软计数(本地估算)
  limit: number;
  remaining: number;     // limit - 软计数
  failed: number;
  paused: boolean;
  exhausted: boolean;
  ejectedUntil: string | null;
  lastUsedAt: string | null;
  addedAt: string | null;
  lastError: string | null;
  live?: LiveUsage;      // Tavily 官方真实用量(仅 withLive 时填充)
}

export interface PoolStatus {
  accounts: AccountStatus[];
  totals: {
    accounts: number;
    healthy: number;
    paused: number;
    exhausted: number;
    totalUsed: number;       // 本地软计数合计(幕后,仅供参考)
    totalRemaining: number;  // 本地软计数剩余(幕后)
    limitPerAccount: number;
    // 官方 /usage 汇总(仅 withLive 时有意义)
    liveUsed: number | null;        // 官方已用合计(有任一号成功即为数值)
    liveRemaining: number | null;   // 官方剩余合计
    liveUnavailable: number;        // 官方额度拉取失败的号数
  };
}

export async function getPoolStatus(withLive = false): Promise<PoolStatus> {
  const state = await loadNormalized();
  const cap = effectiveCap();
  const limit = monthlyLimit();

  // 可选:并发拉取 Tavily 官方真实用量(权威值),与 KV 软计数并列展示。
  const live = withLive ? await fetchRealUsage() : null;

  const accounts: AccountStatus[] = [];
  let healthy = 0;
  let paused = 0;
  let exhausted = 0;
  let totalUsed = 0;
  let totalRemaining = 0;
  // 官方 /usage 汇总
  let liveUsed = 0;
  let liveRemaining = 0;
  let liveHasAny = false;
  let liveUnavailable = 0;

  for (const [id, a] of Object.entries(state.accounts)) {
    const remaining = Math.max(0, limit - a.used);
    if (a.paused) paused++;
    else if (a.exhausted || a.used >= cap) exhausted++;
    else healthy++;
    totalUsed += a.used;
    totalRemaining += a.exhausted ? 0 : remaining;

    const liveUsage = live
      ? live[id] ?? { used: null, limit: null, remaining: null, plan: null, error: "未拉取到" }
      : null;
    if (liveUsage) {
      if (liveUsage.error || liveUsage.used === null) {
        liveUnavailable++;
      } else {
        liveHasAny = true;
        liveUsed += liveUsage.used;
        if (liveUsage.remaining !== null) liveRemaining += liveUsage.remaining;
      }
    }

    accounts.push({
      keyId: id,
      keyPreview: a.keyPreview,
      used: a.used,
      limit,
      remaining,
      failed: a.failed,
      paused: a.paused,
      exhausted: a.exhausted,
      ejectedUntil: a.ejectedUntil ? new Date(a.ejectedUntil).toISOString() : null,
      lastUsedAt: a.lastUsedAt ? new Date(a.lastUsedAt).toISOString() : null,
      addedAt: a.addedAt ? new Date(a.addedAt).toISOString() : null,
      lastError: a.lastError,
      ...(liveUsage ? { live: liveUsage } : {}),
    });
  }

  await saveRaw(state);

  return {
    accounts,
    totals: {
      accounts: accounts.length,
      healthy,
      paused,
      exhausted,
      totalUsed,
      totalRemaining,
      limitPerAccount: limit,
      liveUsed: liveHasAny ? liveUsed : null,
      liveRemaining: liveHasAny ? liveRemaining : null,
      liveUnavailable,
    },
  };
}

// ---------- 账号管理(增 / 删 / 暂停 / 解封)----------

export interface AddAccountResult {
  ok: boolean;
  error?: string;
  keyId?: string;
}

/**
 * 新增账号:先调 Tavily 官方 /usage 校验 key 有效性(仅 401/403 视为无效拒绝;
 * 网络错误/超时放行,避免临时抖动挡住合法 key),通过则原文存入 KV。
 * 已存在则视为成功(幂等);若该 key 此前被剔除则一并复活。
 */
export async function addAccount(rawKey: string): Promise<AddAccountResult> {
  const apiKey = (rawKey || "").trim();
  if (!apiKey) return { ok: false, error: "key 不能为空" };

  const keyId = await keyIdFor(apiKey);
  const state = await loadNormalized();

  // 已存在 → 幂等返回(顺带解除暂停/剔除,等同重新启用)
  if (state.accounts[keyId]) {
    const a = state.accounts[keyId];
    a.paused = false;
    a.exhausted = false;
    a.ejectedUntil = null;
    await saveRaw(state);
    return { ok: true, keyId };
  }

  // 校验:只在确定无效(401/403)时拒绝
  const usage = await fetchOneUsage(apiKey);
  if (usage.error === "HTTP 401" || usage.error === "HTTP 403") {
    return { ok: false, error: `key 无效（${usage.error}）` };
  }

  state.accounts[keyId] = {
    apiKey,
    keyPreview: previewOf(apiKey),
    paused: false,
    used: 0,
    failed: 0,
    lastUsedAt: null,
    exhausted: false,
    ejectedUntil: null,
    addedAt: Date.now(),
    lastError: null,
  };
  await saveRaw(state);
  return { ok: true, keyId };
}

/** 暂停 / 恢复:暂停的号不参与派发,但保留计数与额度。 */
export async function setPaused(keyId: string, paused: boolean): Promise<void> {
  const state = await loadNormalized();
  const a = state.accounts[keyId];
  if (!a) return;
  a.paused = paused;
  await saveRaw(state);
}

/** 删除账号:从 KV 彻底移除(key 原文一并清除)。 */
export async function deleteAccount(keyId: string): Promise<void> {
  const state = await loadNormalized();
  if (state.accounts[keyId]) {
    delete state.accounts[keyId];
    await saveRaw(state);
  }
}

/** 手动解封:清除剔除状态并清零软计数,使其重新可派发(keyId 省略则全部)。 */
export async function reinstate(keyId?: string): Promise<void> {
  const state = await loadNormalized();
  const ids = keyId ? [keyId] : Object.keys(state.accounts);
  for (const id of ids) {
    const a = state.accounts[id];
    if (!a) continue;
    a.exhausted = false;
    a.ejectedUntil = null;
    a.used = 0;
    a.failed = 0;
    a.lastError = null;
  }
  await saveRaw(state);
}
