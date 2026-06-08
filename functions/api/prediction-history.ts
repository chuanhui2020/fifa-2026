import { setKVStore } from "../../src/agents/cache";
import { getHistory } from "../../src/agents/prediction-history";

interface Env {
  FIFA_MATCHES: KVNamespace;
}

/**
 * 公开只读：返回单场比赛的预测历史快照数组（按时间升序），
 * 供复盘卡片展开时画概率演变 + 列出重大归因变更。无需鉴权。
 * 用法：GET /api/prediction-history?matchId=3
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const matchId = url.searchParams.get("matchId");

  if (!matchId) {
    return new Response(
      JSON.stringify({ error: "matchId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  setKVStore(context.env.FIFA_MATCHES);
  const history = await getHistory(matchId);

  return new Response(JSON.stringify({ matchId, history }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=30, max-age=15",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
