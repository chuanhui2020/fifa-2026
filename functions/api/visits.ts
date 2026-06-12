interface Env {
  FIFA_MATCHES: KVNamespace;
}

/** 当前北京日期 YYYY-MM-DD,与前端展示口径一致。 */
function bjToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function readInt(kv: KVNamespace, key: string): Promise<number> {
  const v = await kv.get(key);
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * 访客计数:POST 上报一次访问并按 visitorId 服务端去重,返回 { today, total }。
 *  - 总访问:visitorId 首次出现才 +1(键 visit:v:{id},永久)。
 *  - 今日访问:visitorId 当天首次出现才 +1(键 visit:d:{date}:{id},48h TTL 自动清理)。
 * 计数键 visits:total / visits:day:{date}。低流量团队站,KV 读改写竞态可忽略。
 * 返回值用"读后内存自增"得到,避免 KV 读己写的最终一致延迟导致少算一次。
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const kv = context.env.FIFA_MATCHES;

  let visitorId = "";
  try {
    const body = (await context.request.json()) as { visitorId?: unknown };
    if (typeof body?.visitorId === "string") visitorId = body.visitorId.slice(0, 64);
  } catch {
    // 无 body / 解析失败:按只读返回当前计数
  }

  const today = bjToday();
  const dayKey = `visits:day:${today}`;
  const totalKey = "visits:total";

  // visitorId 不合法:不计数,只回当前值
  if (visitorId.length < 8) {
    return jsonRes({ today: await readInt(kv, dayKey), total: await readInt(kv, totalKey) });
  }

  let total = await readInt(kv, totalKey);
  if (!(await kv.get(`visit:v:${visitorId}`))) {
    total += 1;
    await kv.put(totalKey, String(total));
    await kv.put(`visit:v:${visitorId}`, "1");
  }

  let todayCount = await readInt(kv, dayKey);
  if (!(await kv.get(`visit:d:${today}:${visitorId}`))) {
    todayCount += 1;
    await kv.put(dayKey, String(todayCount));
    await kv.put(`visit:d:${today}:${visitorId}`, "1", { expirationTtl: 60 * 60 * 48 });
  }

  return jsonRes({ today: todayCount, total });
};

/** 只读:不计数,供刷新展示。 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const kv = context.env.FIFA_MATCHES;
  const today = bjToday();
  return jsonRes({
    today: await readInt(kv, `visits:day:${today}`),
    total: await readInt(kv, "visits:total"),
  });
};
