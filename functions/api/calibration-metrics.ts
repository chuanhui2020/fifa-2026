import { setCalibrationStore, getMetrics } from "../../src/agents/calibration";

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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  if (!await validateAdmin(context.request, context.env)) {
    return new Response(JSON.stringify({ error: "未授权访问" }), { status: 401, headers: corsHeaders });
  }

  setCalibrationStore(context.env.FIFA_MATCHES);

  const metrics = await getMetrics();
  return new Response(JSON.stringify(metrics), { headers: corsHeaders });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
