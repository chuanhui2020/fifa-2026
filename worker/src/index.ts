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

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const now = new Date();

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
    } catch (espnError) {
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
