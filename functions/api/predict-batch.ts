/**
 * 批量预测
 *
 * 对所有已确定对阵的比赛进行预测（常用于32强对阵确认后批量生成预测）
 */

import { predictPublishRecord } from "../../src/agents/publish";
import { setKVStore } from "../../src/agents/cache";
import { setCalibrationStore } from "../../src/agents/calibration";
import { isConfirmedFixture } from "../../src/data/teams";
import { Match } from "../../worker/src/types";

interface Env {
  FIFA_MATCHES: KVNamespace;
  DEEPSEEK_API_KEY: string;
  TAVILY_MONTHLY_LIMIT?: string;
  TAVILY_SAFETY_MARGIN?: string;
  ODDS_API_KEY: string;
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

  process.env.DEEPSEEK_API_KEY = context.env.DEEPSEEK_API_KEY;
  process.env.ODDS_API_KEY = context.env.ODDS_API_KEY;
  if (context.env.TAVILY_MONTHLY_LIMIT) process.env.TAVILY_MONTHLY_LIMIT = context.env.TAVILY_MONTHLY_LIMIT;
  if (context.env.TAVILY_SAFETY_MARGIN) process.env.TAVILY_SAFETY_MARGIN = context.env.TAVILY_SAFETY_MARGIN;

  setKVStore(context.env.FIFA_MATCHES);
  setCalibrationStore(context.env.FIFA_MATCHES);

  let body: { stage?: string; maxCount?: number; forceRefresh?: boolean };
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const { stage = "round32", maxCount = 10, forceRefresh = false } = body;

  try {
    // 读取所有比赛
    const matchesData = await context.env.FIFA_MATCHES.get("matches:all");
    const matches: Match[] = matchesData ? JSON.parse(matchesData) : [];

    // 筛选指定阶段且对阵已确认的比赛
    const targetMatches = matches.filter(m =>
      m.stage === stage &&
      m.status === "upcoming" &&
      isConfirmedFixture(m.homeTeam, m.awayTeam)
    ).slice(0, maxCount);

    if (targetMatches.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: `没有找到 ${stage} 阶段已确认对阵的比赛`,
        predicted: [],
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 批量预测
    const results = [];
    for (const match of targetMatches) {
      try {
        const { result } = await predictPublishRecord(
          match.id.toString(),
          match.homeTeam,
          match.awayTeam,
          { forceRefresh }
        );
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          success: true,
          prediction: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "预测失败";
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          success: false,
          error: message,
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      stage,
      totalMatches: targetMatches.length,
      predicted: results,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量预测失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
