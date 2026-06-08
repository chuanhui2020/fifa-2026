import { predictPublishRecord } from "../../src/agents/publish";
import { setKVStore } from "../../src/agents/cache";
import { setCalibrationStore } from "../../src/agents/calibration";
import { isConfirmedFixture } from "../../src/data/teams";

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

// 端点本就 admin-only，此限流仅约束已鉴权管理员，主要防失控。放宽以支撑「一键预测」批量。
const RATE_LIMIT = 120;
const WINDOW_S = 60;

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

  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
  const window = Math.floor(Date.now() / (WINDOW_S * 1000));
  const rateLimitKey = `ratelimit:${ip}:${window}`;
  const count = parseInt((await context.env.FIFA_MATCHES.get(rateLimitKey)) || "0");
  if (count >= RATE_LIMIT) {
    return new Response(
      JSON.stringify({ error: "请求过于频繁，请稍后再试" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }
  await context.env.FIFA_MATCHES.put(rateLimitKey, String(count + 1), {
    expirationTtl: WINDOW_S,
  });

  let body: { matchId?: string; homeTeam?: string; awayTeam?: string; forceRefresh?: boolean };
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { matchId, homeTeam, awayTeam, forceRefresh } = body;
  if (!matchId || !homeTeam || !awayTeam) {
    return new Response(
      JSON.stringify({ error: "matchId, homeTeam, and awayTeam are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!isConfirmedFixture(homeTeam, awayTeam)) {
    return new Response(
      JSON.stringify({ error: "对阵未确定，暂不支持预测" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 预测 → 发布(供公开只读查看) → 记历史(含重大变更检测)，三步与 cron 路径共用同一实现。
    const { result } = await predictPublishRecord(matchId, homeTeam, awayTeam, { forceRefresh: !!forceRefresh });

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
