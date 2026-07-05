/**
 * 手动同步淘汰赛对阵
 *
 * 从 ESPN 拉取最新数据，更新 KV 中的淘汰赛对阵（占位符 → 真实队名）
 */

import { fetchESPNMultipleDates } from "../../worker/src/espn";
import { transformESPNEvents, mergeMatches, reconcileKnockoutSlots } from "../../worker/src/transform";
import { Match } from "../../worker/src/types";

interface Env {
  FIFA_MATCHES: KVNamespace;
  ADMIN_PASSWORD: string;
  ADMIN_SECRET: string;
}

async function validateAdmin(request: Request, env: { ADMIN_PASSWORD: string; ADMIN_SECRET: string }): Promise<boolean> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(env.ADMIN_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(env.ADMIN_PASSWORD));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return token === expected;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return new Response(
      JSON.stringify({ error: "未授权访问" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 拉取未来 7 天的赛程（覆盖整个淘汰赛阶段）
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      dates.push(formatter.format(date));
    }

    // 从 ESPN 拉取数据
    const events = await fetchESPNMultipleDates(dates);
    const updates = transformESPNEvents(events);

    // 读取现有数据
    const existingData = await context.env.FIFA_MATCHES.get("matches:all");
    const existing: Match[] = existingData ? JSON.parse(existingData) : [];

    // 合并更新 + 按固定槽位对账淘汰赛（收敛重复行 / 复位漂移行）
    const merged = reconcileKnockoutSlots(mergeMatches(existing, updates));

    // 写回 KV
    await context.env.FIFA_MATCHES.put("matches:all", JSON.stringify(merged));
    await context.env.FIFA_MATCHES.put("meta:lastUpdated", new Date().toISOString());

    // 统计更新的淘汰赛对阵
    const knockoutStages = ["round32", "round16", "quarter", "semi", "third", "final"];
    const updatedMatches = updates.filter(m => knockoutStages.includes(m.stage));

    return new Response(JSON.stringify({
      success: true,
      totalUpdated: updates.length,
      knockoutUpdated: updatedMatches.length,
      knockoutMatches: updatedMatches.map(m => ({
        id: m.id,
        stage: m.stage,
        date: m.date,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
      })),
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
