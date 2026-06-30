/**
 * 手动清理 KV 中的重复/脏数据
 *
 * 用于修复场馆名不匹配导致的重复比赛（如 id79 占位符 + id760491 真实对阵）
 */

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
    const existingData = await context.env.FIFA_MATCHES.get("matches:all");
    const matches: Match[] = existingData ? JSON.parse(existingData) : [];

    // 找到重复的 id79（占位符）和 id760491（真实对阵，Mexico vs Ecuador）
    const id79 = matches.find(m => m.id === 79);
    const id760491 = matches.find(m => String(m.id) === "760491");

    if (!id79 || !id760491) {
      return new Response(JSON.stringify({
        success: false,
        message: "未找到预期的重复记录（id79 或 id760491）",
        found: { id79: !!id79, id760491: !!id760491 }
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 把 id760491 的真实对阵合并到 id79，然后删除 id760491
    const cleaned = matches.filter(m => String(m.id) !== "760491").map(m => {
      if (m.id === 79) {
        return {
          ...m,
          homeTeam: id760491.homeTeam,
          awayTeam: id760491.awayTeam,
          espnId: id760491.espnId,
          status: id760491.status,
          venue: "Estadio Azteca", // 归一化到标准名
        };
      }
      return m;
    });

    await context.env.FIFA_MATCHES.put("matches:all", JSON.stringify(cleaned));

    return new Response(JSON.stringify({
      success: true,
      message: "已清理重复数据",
      before: matches.length,
      after: cleaned.length,
      merged: {
        deletedId: "760491",
        mergedInto: 79,
        finalFixture: `${id760491.homeTeam} vs ${id760491.awayTeam}`,
      }
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "清理失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
