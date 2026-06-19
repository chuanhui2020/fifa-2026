import { Match } from "./types";

/**
 * 系统异常事件(最近 3 天,管理员页面查看)。
 * worker 与 Pages(src/agents/health.ts)两端写入同一个 KV 键、保持结构同构。
 * 按 `id`(类型 + 场次)去重聚合:同一异常只更新 lastSeen / count++,避免每 2min 刷屏。
 */
export interface HealthEvent {
  id: string; // 去重键:`${type}:${matchId ?? ""}`
  type: string; // stuck_live | stale_data | fetch_failed | predict_failed | ...
  severity: "warn" | "error";
  source: string; // worker | cron-predict
  message: string; // 中文摘要
  matchId?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
}

/** 新事件入参(不含聚合元数据,由 recordHealthEvents 补全)。 */
export type NewHealthEvent = Pick<HealthEvent, "type" | "severity" | "source" | "message"> & {
  matchId?: string;
};

export const HEALTH_KEY = "health:events";
const RETAIN_MS = 3 * 24 * 60 * 60 * 1000; // 只留最近 3 天
const MAX_EVENTS = 200; // 封顶,防 KV 单键膨胀

async function read(kv: KVNamespace): Promise<HealthEvent[]> {
  const raw = await kv.get(HEALTH_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HealthEvent[];
  } catch {
    return [];
  }
}

/**
 * 合并写入:按 id 聚合(已存在则 count++/刷新 lastSeen 与摘要,否则新增),
 * 裁掉 3 天前的、按 lastSeen 倒序封顶 MAX_EVENTS。空进直接返回不写。
 */
export async function recordHealthEvents(
  kv: KVNamespace,
  events: NewHealthEvent[],
  now: number
): Promise<void> {
  if (events.length === 0) return;

  const byId = new Map<string, HealthEvent>();
  for (const e of await read(kv)) byId.set(e.id, e);

  for (const ev of events) {
    const id = `${ev.type}:${ev.matchId ?? ""}`;
    const prev = byId.get(id);
    if (prev) {
      prev.lastSeen = now;
      prev.count += 1;
      prev.message = ev.message; // 用最新摘要(如卡死时长会增长)
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

/**
 * worker 端自检:扫当前赛程 + 上次更新时间,返回本轮要记录的异常(不落库,由调用方汇总写)。
 *  - stuck_live:某场开球已超 4h 仍 live(深夜场跨美东午夜冻结那类)。
 *  - stale_data:比赛窗口内距上次成功更新 > 15min(抓取链路异常;窗口外节流不算)。
 */
export function detectWorkerAnomalies(
  matches: Match[],
  lastUpdatedISO: string | null,
  inMatchWindow: boolean,
  now: number
): NewHealthEvent[] {
  const out: NewHealthEvent[] = [];

  const STUCK_MS = 4 * 60 * 60 * 1000;
  for (const m of matches) {
    if (m.status !== "live") continue;
    const kickoff = new Date(`${m.date}T${m.time}:00-04:00`).getTime();
    if (Number.isNaN(kickoff)) continue;
    if (now - kickoff > STUCK_MS) {
      out.push({
        type: "stuck_live",
        severity: "error",
        source: "worker",
        matchId: String(m.id),
        message: `${m.homeTeam} vs ${m.awayTeam}(${m.date} ${m.time} ET)开球已 ${Math.floor(
          (now - kickoff) / 3600000
        )}h 仍为 live,疑似状态未翻牌。`,
      });
    }
  }

  const STALE_MS = 15 * 60 * 1000;
  if (inMatchWindow && lastUpdatedISO) {
    const elapsed = now - new Date(lastUpdatedISO).getTime();
    if (elapsed > STALE_MS) {
      out.push({
        type: "stale_data",
        severity: "warn",
        source: "worker",
        message: `比赛窗口内实时数据已 ${Math.floor(elapsed / 60000)}min 未更新(正常应 ≤4min)。`,
      });
    }
  }

  return out;
}
