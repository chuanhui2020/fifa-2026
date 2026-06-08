import type { PredictionResult, PredictionShift } from "./types";
import { predict } from "./orchestrator";
import { getKVStore } from "./cache";
import { appendHistory } from "./prediction-history";

const PUBLISHED_KEY = "predictions:published";

/**
 * 把一次预测结果写入「已发布」副本（matchId → 最新 PredictionResult），
 * 供公开只读接口 /api/predictions 给普通访客查看。无 TTL，长期保留。
 * 读-改-写单键；调用方需自行串行化以避免并发覆盖（cron 端按序处理）。
 * 失败静默——不影响预测主流程。
 */
export async function publishPrediction(result: PredictionResult): Promise<void> {
  const kv = getKVStore();
  if (!kv) return;
  try {
    const raw = await kv.get(PUBLISHED_KEY);
    const published = raw ? JSON.parse(raw) : {};
    published[result.matchId] = result;
    await kv.put(PUBLISHED_KEY, JSON.stringify(published));
  } catch (e) {
    console.error("publishPrediction failed:", e);
  }
}

/**
 * 一次性把多场预测结果写入「已发布」副本：单键 predictions:published 做
 * 一次读-改-写，避免并行预测各自 RMW 互相覆盖（lost update）。
 * cron 批量预测专用——预测本身可并行，发布在此处统一串行落库。
 */
export async function publishPredictionsBatch(results: PredictionResult[]): Promise<void> {
  const kv = getKVStore();
  if (!kv || results.length === 0) return;
  try {
    const raw = await kv.get(PUBLISHED_KEY);
    const published = raw ? JSON.parse(raw) : {};
    for (const r of results) published[r.matchId] = r;
    await kv.put(PUBLISHED_KEY, JSON.stringify(published));
  } catch (e) {
    console.error("publishPredictionsBatch failed:", e);
  }
}

/**
 * 完整的一次「预测 → 发布 → 记历史(含重大变更检测)」流程，
 * 供 /api/predict（管理员手动 / 一键）与 /api/cron-predict（定时单场）共用，
 * 确保两条路径的副作用完全一致。
 *
 * 返回预测结果与本次检测到的重大变更，调用方可据此返回或记日志。
 */
export async function predictPublishRecord(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  opts?: { forceRefresh?: boolean }
): Promise<{ result: PredictionResult; shifts: PredictionShift[] }> {
  const result = await predict(matchId, homeTeam, awayTeam, opts);
  await publishPrediction(result);
  const shifts = await appendHistory(result);
  return { result, shifts };
}
