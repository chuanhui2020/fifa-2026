import { setKVStore } from "../../src/agents/cache";
import {
  getPoolStatus,
  reinstate,
  addAccount,
  setPaused,
  deleteAccount,
} from "../../src/agents/tools/tavily-pool";

interface Env {
  FIFA_MATCHES: KVNamespace;
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
  if (env.TAVILY_MONTHLY_LIMIT) process.env.TAVILY_MONTHLY_LIMIT = env.TAVILY_MONTHLY_LIMIT;
  if (env.TAVILY_SAFETY_MARGIN) process.env.TAVILY_SAFETY_MARGIN = env.TAVILY_SAFETY_MARGIN;
  setKVStore(env.FIFA_MATCHES);
}

// GET：返回号池状态（?live=1 时附带 Tavily 官方真实用量）
export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return new Response(JSON.stringify({ error: "未授权访问" }), { status: 401, headers: CORS });
  }
  applyEnv(context.env);
  const params = new URL(context.request.url).searchParams;
  const withLive = params.get("live") === "1";
  // ?refresh=1：强制绕过 5 分钟 usage 缓存现拉官方额度（刷新按钮）；否则走缓存。
  const forceRefresh = params.get("refresh") === "1";
  const status = await getPoolStatus(withLive, forceRefresh);
  return new Response(JSON.stringify(status), { headers: CORS });
};

// POST：账号管理
//   {action:"add", apiKey}        新增账号（校验后原文存入 KV）
//   {action:"pause", keyId}       暂停（不派发）
//   {action:"resume", keyId}      恢复
//   {action:"delete", keyId}      删除（从 KV 彻底移除）
//   {action:"reinstate", keyId?}  解封并清零软计数（keyId 省略则全部）
export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return new Response(JSON.stringify({ error: "未授权访问" }), { status: 401, headers: CORS });
  }
  applyEnv(context.env);

  let body: { action?: string; keyId?: string; apiKey?: string };
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: CORS });
  }

  switch (body.action) {
    case "add": {
      const result = await addAccount(body.apiKey || "");
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.error || "新增失败" }), { status: 400, headers: CORS });
      }
      break;
    }
    case "pause":
      if (!body.keyId) {
        return new Response(JSON.stringify({ error: "缺少 keyId" }), { status: 400, headers: CORS });
      }
      await setPaused(body.keyId, true);
      break;
    case "resume":
      if (!body.keyId) {
        return new Response(JSON.stringify({ error: "缺少 keyId" }), { status: 400, headers: CORS });
      }
      await setPaused(body.keyId, false);
      break;
    case "delete":
      if (!body.keyId) {
        return new Response(JSON.stringify({ error: "缺少 keyId" }), { status: 400, headers: CORS });
      }
      await deleteAccount(body.keyId);
      break;
    case "reinstate":
      await reinstate(body.keyId);
      break;
    default:
      return new Response(
        JSON.stringify({ error: "未知操作（action 应为 add / pause / resume / delete / reinstate）" }),
        { status: 400, headers: CORS }
      );
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
