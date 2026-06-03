import { predict } from "../../src/agents/orchestrator";
import { setKVStore } from "../../src/agents/cache";
import { setCalibrationStore } from "../../src/agents/calibration";
import { matches } from "../../src/data/matches";

interface Env {
  FIFA_MATCHES: KVNamespace;
  DEEPSEEK_API_KEY: string;
  TAVILY_API_KEY: string;
  TAVILY_API_KEYS?: string;
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
  const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  if (!await validateAdmin(context.request, context.env)) {
    return new Response(JSON.stringify({ error: "未授权访问" }), { status: 401, headers: corsHeaders });
  }

  process.env.DEEPSEEK_API_KEY = context.env.DEEPSEEK_API_KEY;
  process.env.TAVILY_API_KEY = context.env.TAVILY_API_KEY;
  process.env.ODDS_API_KEY = context.env.ODDS_API_KEY;
  if (context.env.TAVILY_API_KEYS) process.env.TAVILY_API_KEYS = context.env.TAVILY_API_KEYS;
  if (context.env.TAVILY_MONTHLY_LIMIT) process.env.TAVILY_MONTHLY_LIMIT = context.env.TAVILY_MONTHLY_LIMIT;
  if (context.env.TAVILY_SAFETY_MARGIN) process.env.TAVILY_SAFETY_MARGIN = context.env.TAVILY_SAFETY_MARGIN;
  setKVStore(context.env.FIFA_MATCHES);
  setCalibrationStore(context.env.FIFA_MATCHES);

  const groupMatches = matches.filter((m) => m.stage === "group");

  const results: { matchId: number; teams: string; status: string; error?: string }[] = [];

  for (const match of groupMatches) {
    try {
      await predict(String(match.id), match.homeTeam, match.awayTeam);
      results.push({ matchId: match.id, teams: `${match.homeTeam} vs ${match.awayTeam}`, status: "ok" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ matchId: match.id, teams: `${match.homeTeam} vs ${match.awayTeam}`, status: "error", error });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;

  return new Response(
    JSON.stringify({ total: groupMatches.length, ok, failed, results }),
    { headers: corsHeaders }
  );
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
