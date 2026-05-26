import { predict } from "../src/agents/orchestrator";
import { setKVStore } from "../src/agents/cache";

interface Env {
  FIFA_MATCHES: KVNamespace;
  DEEPSEEK_API_KEY: string;
  TAVILY_API_KEY: string;
}

const RATE_LIMIT = 10;
const WINDOW_S = 60;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  process.env.DEEPSEEK_API_KEY = context.env.DEEPSEEK_API_KEY;
  process.env.TAVILY_API_KEY = context.env.TAVILY_API_KEY;

  setKVStore(context.env.FIFA_MATCHES);

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

  let body: { matchId?: string; homeTeam?: string; awayTeam?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { matchId, homeTeam, awayTeam } = body;
  if (!matchId || !homeTeam || !awayTeam) {
    return new Response(
      JSON.stringify({ error: "matchId, homeTeam, and awayTeam are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const result = await predict(matchId, homeTeam, awayTeam);
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
