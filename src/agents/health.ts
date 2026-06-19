import { getKVStore } from "./cache";

/**
 * 系统异常事件(最近 3 天,管理员页面查看)。
 * 与 worker/src/health.ts 两端写入同一个 KV 键、保持结构同构(worker 与 Pages 是两套打包,各自定义)。
 * 按 `id`(类型 + 场次)去重聚合,避免同一异常每次触发都新增一条。
 */
export interface HealthEvent {
  id: string;
  type: string;
  severity: "warn" | "error";
  source: string;
  message: string;
  matchId?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
}

export type NewHealthEvent = Pick<HealthEvent, "type" | "severity" | "source" | "message"> & {
  matchId?: string;
};

const HEALTH_KEY = "health:events";
const RETAIN_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 200;

/** 读取最近 3 天异常,按 lastSeen 倒序(管理员面板用)。 */
export async function getHealthEvents(): Promise<HealthEvent[]> {
  const kv = getKVStore();
  if (!kv) return [];
  const raw = await kv.get(HEALTH_KEY);
  if (!raw) return [];
  try {
    const events = JSON.parse(raw) as HealthEvent[];
    const now = Date.now();
    return events
      .filter((e) => now - e.lastSeen <= RETAIN_MS)
      .sort((a, b) => b.lastSeen - a.lastSeen);
  } catch {
    return [];
  }
}

/**
 * 合并写入(与 worker 端同语义):按 id 聚合,裁掉 3 天前、按 lastSeen 倒序封顶。
 * 无 KV 句柄或空事件直接返回。
 */
export async function recordHealthEvents(events: NewHealthEvent[], now: number): Promise<void> {
  const kv = getKVStore();
  if (!kv || events.length === 0) return;

  const byId = new Map<string, HealthEvent>();
  const raw = await kv.get(HEALTH_KEY);
  if (raw) {
    try {
      for (const e of JSON.parse(raw) as HealthEvent[]) byId.set(e.id, e);
    } catch {
      // corrupted -> 从空开始
    }
  }

  for (const ev of events) {
    const id = `${ev.type}:${ev.matchId ?? ""}`;
    const prev = byId.get(id);
    if (prev) {
      prev.lastSeen = now;
      prev.count += 1;
      prev.message = ev.message;
      prev.severity = ev.severity;
    } else {
      byId.set(id, { id, ...ev, firstSeen: now, lastSeen: now, count: 1 });
    }
  }

  const merged = [...byId.values()]
    .filter((e) => now - e.lastSeen <= RETAIN_MS)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, MAX_EVENTS);

  await kv.put(HEALTH_KEY, JSON.stringify(merged));
}
