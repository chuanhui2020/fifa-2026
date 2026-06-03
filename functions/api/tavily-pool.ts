import { setKVStore } from "../../src/agents/cache";
import { getPoolStatus, reinstate, resetCounters } from "../../src/agents/tools/tavily-pool";

interface Env {
  FIFA_MATCHES: KVNamespace;
  TAVILY_API_KEY: string;
  TAVILY_API_KEYS?: string;
  TAVILY_MONTHLY_LIMIT?: string;
  TAVILY_SAFETY_MARGIN?: string;
  ADMIN_PASSWORD: string;
  ADMIN_SECRET: string;
}

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

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

function applyEnv(env: Env): void {
  process.env.TAVILY_API_KEY = env.TAVILY_API_KEY;
  if (env.TAVILY_API_KEYS) process.env.TAVILY_API_KEYS = env.TAVILY_API_KEYS;
  if (env.TAVILY_MONTHLY_LIMIT) process.env.TAVILY_MONTHLY_LIMIT = env.TAVILY_MONTHLY_LIMIT;
  if (env.TAVILY_SAFETY_MARGIN) process.env.TAVILY_SAFETY_MARGIN = env.TAVILY_SAFETY_MARGIN;
  setKVStore(env.FIFA_MATCHES);
}

// GET：返回号池状态
export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return new Response(JSON.stringify({ error: "未授权访问" }), { status: 401, headers: CORS });
  }
  applyEnv(context.env);
  const status = await getPoolStatus();
  return new Response(JSON.stringify(status), { headers: CORS });
};

// POST：{action:"reinstate", keyId?} 手动解封 | {action:"reset"} 清零
export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return new Response(JSON.stringify({ error: "未授权访问" }), { status: 401, headers: CORS });
  }
  applyEnv(context.env);

  let body: { action?: string; keyId?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: CORS });
  }

  if (body.action === "reinstate") {
    await reinstate(body.keyId);
  } else if (body.action === "reset") {
    await resetCounters();
  } else {
    return new Response(JSON.stringify({ error: "未知操作（action 应为 reinstate 或 reset）" }), { status: 400, headers: CORS });
  }

  const status = await getPoolStatus();
  return new Response(JSON.stringify(status), { headers: CORS });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
