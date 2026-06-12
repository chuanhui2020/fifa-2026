import { predict } from "../../src/agents/orchestrator";
import { publishPredictionsBatch } from "../../src/agents/publish";
import { appendHistory } from "../../src/agents/prediction-history";
import { setKVStore } from "../../src/agents/cache";
import { setCalibrationStore, resolveMatch, getAllEntries } from "../../src/agents/calibration";
import { matches as staticMatches } from "../../src/data/matches";
import { isConfirmedFixture } from "../../src/data/teams";
import type { PredictionResult, PredictionShift } from "../../src/agents/types";

interface Env {
  FIFA_MATCHES: KVNamespace;
  DEEPSEEK_API_KEY: string;
  TAVILY_MONTHLY_LIMIT?: string;
  TAVILY_SAFETY_MARGIN?: string;
  ODDS_API_KEY: string;
  CRON_SECRET: string;
}

/** 单次触发最多预测的场次，防止赛前同档比赛一次性打爆 CPU/额度。按离开赛最近优先。 */
const MAX_PER_RUN = 5;

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

/**
 * 按距开赛时间（毫秒）算调度档位：
 *  - >3天（>72h）：每 24h 一次（走缓存）——远期 form/squad 几乎不变，无需高频重跑省 DeepSeek
 *  - 1天–3天（24h–72h）：每 12h 一次（走缓存）
 *  - 1h–24h：每 4h 一次（走缓存）
 *  - 5min–1h：每 10min 一次（强制不走缓存）
 *  - <5min 或已开赛：不预测（保留最后一次）
 * 返回 null 表示本档不预测。
 */
function schedule(ttkMs: number): { intervalMs: number; forceRefresh: boolean } | null {
  if (ttkMs <= 5 * MIN) return null;            // 比赛 5min 之内 / 已开赛：保留最后一次
  if (ttkMs <= HOUR) return { intervalMs: 10 * MIN, forceRefresh: true };
  if (ttkMs <= 24 * HOUR) return { intervalMs: 4 * HOUR, forceRefresh: false };
  if (ttkMs <= 72 * HOUR) return { intervalMs: 12 * HOUR, forceRefresh: false };
  return { intervalMs: 24 * HOUR, forceRefresh: false };
}

/** 静态赛程时间是美东时间（夏令时 -04:00）；返回该场开赛的绝对时间戳。 */
function kickoffMs(date: string, time: string): number {
  return new Date(`${date}T${time}:00-04:00`).getTime();
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 定时预测端点。由 Cron Worker fire-and-forget 调用（带 CRON_SECRET）。
 * Worker 只借时钟，全部调度判定 + 预测 + 自动复盘判定都在此完成（可直接 import 整个 src/）。
 * 幂等：每次靠 published[id].generatedAt 与档位间隔判断是否到点，重复触发不会重复预测。
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const secret = context.request.headers.get("X-Cron-Secret");
  if (!context.env.CRON_SECRET || secret !== context.env.CRON_SECRET) {
    return jsonRes({ error: "未授权" }, 401);
  }

  process.env.DEEPSEEK_API_KEY = context.env.DEEPSEEK_API_KEY;
  process.env.ODDS_API_KEY = context.env.ODDS_API_KEY;
  if (context.env.TAVILY_MONTHLY_LIMIT) process.env.TAVILY_MONTHLY_LIMIT = context.env.TAVILY_MONTHLY_LIMIT;
  if (context.env.TAVILY_SAFETY_MARGIN) process.env.TAVILY_SAFETY_MARGIN = context.env.TAVILY_SAFETY_MARGIN;

  setKVStore(context.env.FIFA_MATCHES);
  setCalibrationStore(context.env.FIFA_MATCHES);

  const now = Date.now();

  // 已发布预测：取 generatedAt 判断每场是否到点。
  let published: Record<string, PredictionResult> = {};
  try {
    const raw = await context.env.FIFA_MATCHES.get("predictions:published");
    if (raw) published = JSON.parse(raw);
  } catch {
    published = {};
  }

  // 选出本次到点、应预测的比赛（对阵已确定 + 未到 5min 窗口 + 距上次预测超过档位间隔）。
  type Due = { matchId: string; homeTeam: string; awayTeam: string; ttk: number; forceRefresh: boolean };
  const due: Due[] = [];

  for (const m of staticMatches) {
    if (!isConfirmedFixture(m.homeTeam, m.awayTeam)) continue;
    const ttk = kickoffMs(m.date, m.time) - now;
    const sched = schedule(ttk);
    if (!sched) continue;

    const last = published[String(m.id)]?.generatedAt ?? 0;
    if (now - last < sched.intervalMs) continue;

    due.push({ matchId: String(m.id), homeTeam: m.homeTeam, awayTeam: m.awayTeam, ttk, forceRefresh: sched.forceRefresh });
  }

  // 离开赛最近的优先，截断到 MAX_PER_RUN，避免一次打爆。
  due.sort((a, b) => a.ttk - b.ttk);
  const batch = due.slice(0, MAX_PER_RUN);

  // 并行预测；发布在最后统一一次写库（避免单键 RMW 互相覆盖）。历史为 per-match 键，逐场写安全。
  const settled = await Promise.allSettled(
    batch.map((d) => predict(d.matchId, d.homeTeam, d.awayTeam, { forceRefresh: d.forceRefresh }))
  );

  const ok: PredictionResult[] = [];
  const predicted: { matchId: string; shifts: PredictionShift[] }[] = [];
  const failed: { matchId: string; error: string }[] = [];

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "fulfilled") {
      ok.push(s.value);
      const shifts = await appendHistory(s.value);
      predicted.push({ matchId: batch[i].matchId, shifts });
    } else {
      const error = s.reason instanceof Error ? s.reason.message : String(s.reason);
      failed.push({ matchId: batch[i].matchId, error });
    }
  }

  await publishPredictionsBatch(ok);

  // 自动复盘判定：扫 KV 实时赛程里已结束且有比分、且尚未 resolve 的比赛，按比分判定胜负。
  const resolved: { matchId: string; outcome: string }[] = [];
  try {
    const raw = await context.env.FIFA_MATCHES.get("matches:all");
    if (raw) {
      const live: { id: number; status: string; homeScore?: number; awayScore?: number }[] = JSON.parse(raw);
      const entries = await getAllEntries();
      const resolvedSet = new Set(entries.filter((e) => e.actual !== undefined).map((e) => e.matchId));

      for (const lm of live) {
        const id = String(lm.id);
        if (lm.status !== "finished") continue;
        if (lm.homeScore === undefined || lm.awayScore === undefined) continue;
        if (resolvedSet.has(id)) continue;

        const outcome: "home" | "draw" | "away" =
          lm.homeScore > lm.awayScore ? "home" : lm.homeScore < lm.awayScore ? "away" : "draw";
        const didResolve = await resolveMatch(id, outcome);
        if (didResolve) resolved.push({ matchId: id, outcome });
      }
    }
  } catch (e) {
    console.error("auto-resolve failed:", e);
  }

  return jsonRes({
    now: new Date(now).toISOString(),
    dueCount: due.length,
    predictedCount: ok.length,
    predicted: predicted.map((p) => ({ matchId: p.matchId, shifts: p.shifts.length })),
    failed,
    resolved,
  });
};
