interface Env {
  FIFA_MATCHES: KVNamespace;
}

/**
 * 公开只读接口：返回管理员已生成并「发布」的预测结果（matchId → PredictionResult）。
 * 无需鉴权，供普通访客查看。预测的生成（花费 LLM）仍由 /api/predict 的 admin 鉴权把守。
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const raw = await context.env.FIFA_MATCHES.get("predictions:published");
  const predictions = raw ? JSON.parse(raw) : {};

  return new Response(JSON.stringify({ predictions }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=30, max-age=15",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
