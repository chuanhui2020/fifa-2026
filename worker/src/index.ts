import { Env, Match } from "./types";
import { fetchESPNMultipleDates } from "./espn";
import { fetchFootballData } from "./football-data";
import { transformESPNEvents, mergeMatches } from "./transform";
import { recordHealthEvents, detectWorkerAnomalies } from "./health";

function getRelevantDates(now: Date, existing: Match[]): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = 24 * 60 * 60 * 1000;
  const today = formatter.format(now);
  const tomorrow = formatter.format(new Date(now.getTime() + day));
  const yesterday = formatter.format(new Date(now.getTime() - day));

  // 始终多看一天：让「明天」开球时间/对阵的修正在赛前一天就经正常刷新落地，
  // 不必等到比赛当天（如种子里 id4 这类录入错，靠系统自己的管线拉平，不用手改 KV）。
  // ESPN 免费，每轮多 1 次调用，配合既有自限流可接受。
  const dates = new Set([yesterday, today, tomorrow]);

  // 自愈深夜场：任何在 KV 里仍标记 live 的比赛，把它的 ET 日期也重新查一遍，
  // 直到 ESPN 给出 post 才停。否则 22:00 ET 这类晚场跨过 ET 午夜才结束，
  // 其日期已滑出 [today, tomorrow] 窗口，会被永久冻结在 live（比分抓到了但状态翻不过来）。
  for (const match of existing) {
    if (match.status === "live") dates.add(match.date);
  }

  return [...dates];
}

function isWithinMatchWindow(matches: Match[], now: Date): boolean {
  const windowMs = 2 * 60 * 60 * 1000;
  for (const match of matches) {
    if (match.status === "live") return true;
    const matchTime = new Date(`${match.date}T${match.time}:00-04:00`);
    const diff = Math.abs(now.getTime() - matchTime.getTime());
    if (diff < windowMs) return true;
  }
  return false;
}

function isInTournamentWindow(now: Date): boolean {
  const start = new Date("2026-06-11T00:00:00-04:00");
  const end = new Date("2026-07-20T00:00:00-04:00");
  return now >= start && now <= end;
}

/**
 * Pages Functions 不支持 cron，定时预测的全套逻辑（LLM/号池/devig/归因/发布/复盘）都在
 * Pages 端。Worker 把自己的时钟借给 Pages：每次 scheduled 末尾 fire-and-forget 回调
 * /api/cron-predict（带共享密钥）。是否到点、预测哪几场、自动 resolve 都由 Pages 端自行判定。
 * 用 waitUntil 确保请求发出后不被提前回收；失败静默（下次 cron 再试）。
 */
async function pingCronPredict(env: Env): Promise<void> {
  if (!env.PAGES_BASE_URL || !env.CRON_SECRET) return;
  try {
    await fetch(`${env.PAGES_BASE_URL.replace(/\/$/, "")}/api/cron-predict`, {
      method: "POST",
      headers: { "X-Cron-Secret": env.CRON_SECRET },
    });
  } catch {
    // 定时预测回调失败不影响实时比分抓取；下个 cron 周期重试。
  }
}

const worker = {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const now = new Date();

    // 定时预测回调:放在最前,不受下方 ESPN 抓取自限流 return 影响。
    // cron-predict 幂等且无到点比赛时极廉价(仅读 KV + 比时间戳),每 2min 调用安全。
    ctx.waitUntil(pingCronPredict(env));

    // 本次运行前的更新时间:既用于自限流早返回,也用于下方 stale_data 自检
    //(stale 必须比对「更新前」的值,故只在此读一次,贯穿复用)。
    const prevLastUpdated = await env.FIFA_MATCHES.get("meta:lastUpdated");

    if (!isInTournamentWindow(now)) {
      if (prevLastUpdated) {
        const elapsed = now.getTime() - new Date(prevLastUpdated).getTime();
        if (elapsed < 6 * 60 * 60 * 1000) return;
      }
    }

    const existingData = await env.FIFA_MATCHES.get("matches:all");
    const existing: Match[] = existingData ? JSON.parse(existingData) : [];

    const matchWindow = isWithinMatchWindow(existing, now);

    if (!matchWindow) {
      if (prevLastUpdated) {
        const elapsed = now.getTime() - new Date(prevLastUpdated).getTime();
        if (elapsed < 55 * 60 * 1000) return;
      }
    }

    const dates = getRelevantDates(now, existing);
    let updates: Match[] = [];

    try {
      const events = await fetchESPNMultipleDates(dates);
      updates = transformESPNEvents(events);
    } catch {
      if (env.FOOTBALL_DATA_API_KEY) {
        try {
          updates = await fetchFootballData(env.FOOTBALL_DATA_API_KEY);
        } catch {
          console.error("Both data sources failed");
          await recordHealthEvents(env.FIFA_MATCHES, [{
            type: "fetch_failed", severity: "error", source: "worker",
            message: "ESPN 与 football-data 两个数据源都抓取失败,本轮跳过更新。",
          }], now.getTime());
          return;
        }
      } else {
        console.error("ESPN failed, no fallback API key configured");
        await recordHealthEvents(env.FIFA_MATCHES, [{
          type: "fetch_failed", severity: "error", source: "worker",
          message: "ESPN 抓取失败且未配置 football-data 兜底 key,本轮跳过更新。",
        }], now.getTime());
        return;
      }
    }

    let snapshot = existing;
    if (updates.length > 0) {
      snapshot = mergeMatches(existing, updates);
      await env.FIFA_MATCHES.put("matches:all", JSON.stringify(snapshot));
    }

    await env.FIFA_MATCHES.put("meta:lastUpdated", now.toISOString());
    await env.FIFA_MATCHES.put("meta:activeWindow", JSON.stringify(matchWindow));

    // 自检:卡死的 live(开球超 4h 仍 live)/ 比赛窗口内数据陈旧 → 记入 health:events,
    // 供管理员页面「系统异常」查看。stale 用更新前的 prevLastUpdated 判定。
    await recordHealthEvents(
      env.FIFA_MATCHES,
      detectWorkerAnomalies(snapshot, prevLastUpdated, matchWindow, now.getTime()),
      now.getTime()
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const lastUpdated = await env.FIFA_MATCHES.get("meta:lastUpdated");
      return new Response(JSON.stringify({ status: "ok", lastUpdated }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
