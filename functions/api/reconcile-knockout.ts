/**
 * 按种子固定槽位重建淘汰赛（对账修复）
 *
 * 背景：淘汰赛占位对阵（"R32-9 Winner" 等）合并进 KV 时，ESPN 的 provisional 场次会因
 * 场馆/日期抖动或占位名 pairKey collision 造成两类脏数据：
 *   - 重复行：真实对阵被当成「新场次」另建一行（如西雅图 id94 占位 + id760505 真实）；
 *   - 错绑漂移：种子行被 espnId 拖到别的槽位（如 QF id97 被搬离 7/9 Gillette 撞进 7/10 SoFi）。
 * mergeMatches 的护栏能防复发，但无法回收已污染的历史数据。本端点以静态种子的固定槽位
 * （日期/场馆/站内 id 权威）为基准重建全部 32 场淘汰赛：每个种子槽位取「落在该槽位或同 id」
 * 的真实对阵行叠加队名/比分/status/espnId，占位场次保留种子占位名。非种子 id 的重复行
 * （如 id760505）自然被丢弃。小组赛行保持 KV 现状（真实队名 + 比分）不动。
 */

import { matches as seedMatches } from "../../src/data/matches";
import { isRealTeam } from "../../src/data/teams";
import { normalizeVenueName } from "../../worker/src/group-map";
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const isKnockout = (stage: string) => stage !== "group";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return json({ error: "未授权访问" }, 401);
  }

  try {
    const raw = await context.env.FIFA_MATCHES.get("matches:all");
    const live: Match[] = raw ? JSON.parse(raw) : [];
    if (live.length === 0) {
      return json({ success: false, message: "KV matches:all 为空，跳过" });
    }

    const nv = (v: string) => normalizeVenueName(v || "");
    const liveKO = live.filter((m) => isKnockout(m.stage));
    const groupRows = live.filter((m) => !isKnockout(m.stage)); // 保留小组赛现状

    const rebuilt: Match[] = [];
    const changes: { seedId: number; slot: string; before: string[]; after: string }[] = [];

    for (const seed of seedMatches.filter((m) => isKnockout(m.stage))) {
      // 候选：同 id 的行 或 落在种子固定槽位（stage + date + 归一化 venue）的行
      const candidates = liveKO.filter(
        (m) =>
          String(m.id) === String(seed.id) ||
          (m.stage === seed.stage && m.date === seed.date && nv(m.venue) === nv(seed.venue))
      );
      const real = candidates.find((c) => isRealTeam(c.homeTeam) && isRealTeam(c.awayTeam));

      const out: Match = { ...seed }; // 种子槽位权威：id/date/time/venue/city/stage/group + 占位队名
      if (real) {
        out.homeTeam = real.homeTeam;
        out.awayTeam = real.awayTeam;
        out.espnId = real.espnId;
        out.status = real.status;
        if (real.homeScore !== undefined) out.homeScore = real.homeScore;
        if (real.awayScore !== undefined) out.awayScore = real.awayScore;
      }
      rebuilt.push(out);

      // 变化检测：候选不止一行（重复/撞槽），或唯一候选的 id/日期/队名与重建结果不一致（漂移）
      const only = candidates.length === 1 ? candidates[0] : null;
      const drifted =
        !only ||
        String(only.id) !== String(out.id) ||
        only.date !== out.date ||
        nv(only.venue) !== nv(out.venue) ||
        only.homeTeam !== out.homeTeam ||
        only.awayTeam !== out.awayTeam;
      if (drifted) {
        changes.push({
          seedId: seed.id,
          slot: `${seed.stage} ${seed.date} ${seed.venue}`,
          before: candidates.map((c) => `id${c.id} espnId=${c.espnId ?? "-"} ${c.homeTeam} vs ${c.awayTeam} @${c.date}/${nv(c.venue)}`),
          after: `id${out.id} espnId=${out.espnId ?? "-"} ${out.homeTeam} vs ${out.awayTeam} @${out.date}/${out.venue}`,
        });
      }
    }

    const cleaned = [...groupRows, ...rebuilt];
    await context.env.FIFA_MATCHES.put("matches:all", JSON.stringify(cleaned));
    await context.env.FIFA_MATCHES.put("meta:lastUpdated", new Date().toISOString());

    return json({
      success: true,
      before: live.length,
      after: cleaned.length,
      groupKept: groupRows.length,
      koRebuilt: rebuilt.length,
      changedSlots: changes.length,
      changes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "对账失败";
    return json({ error: message }, 500);
  }
};
