import { Env, Match } from "./types";
import { fetchESPNMultipleDates } from "./espn";
import { fetchFootballData } from "./football-data";
import { transformESPNEvents, mergeMatches } from "./transform";

function getRelevantDates(now: Date): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = formatter.format(tomorrow);

  const hour = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  ).getHours();

  if (hour >= 22) {
    return [today, tomorrowStr];
  }
  return [today];
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

    if (!isInTournamentWindow(now)) {
      const lastUpdated = await env.FIFA_MATCHES.get("meta:lastUpdated");
      if (lastUpdated) {
        const elapsed = now.getTime() - new Date(lastUpdated).getTime();
        if (elapsed < 6 * 60 * 60 * 1000) return;
      }
    }

    const existingData = await env.FIFA_MATCHES.get("matches:all");
    const existing: Match[] = existingData ? JSON.parse(existingData) : [];

    const matchWindow = isWithinMatchWindow(existing, now);

    if (!matchWindow) {
      const lastUpdated = await env.FIFA_MATCHES.get("meta:lastUpdated");
      if (lastUpdated) {
        const elapsed = now.getTime() - new Date(lastUpdated).getTime();
        if (elapsed < 55 * 60 * 1000) return;
      }
    }

    const dates = getRelevantDates(now);
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
          return;
        }
      } else {
        console.error("ESPN failed, no fallback API key configured");
        return;
      }
    }

    if (updates.length > 0) {
      const merged = mergeMatches(existing, updates);
      await env.FIFA_MATCHES.put("matches:all", JSON.stringify(merged));
    }

    await env.FIFA_MATCHES.put("meta:lastUpdated", now.toISOString());
    await env.FIFA_MATCHES.put("meta:activeWindow", JSON.stringify(matchWindow));
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
