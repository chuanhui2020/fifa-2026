import type { PredictionResult, PredictionSnapshot, PredictionShift, Attribution } from "./types";
import { getKVStore } from "./cache";

/** 单场保留的最近快照数；超出则丢弃最旧。 */
const MAX_SNAPSHOTS = 30;

/** 概率波动阈值（百分点）：任一结果变化 ≥ 此值记一条 prob-swing。 */
const PROB_SWING_PP = 0.10;

/** 判定「高权重因子」的贡献绝对值阈值，用于因子方向反转/增删检测。 */
const SIGNIFICANT_CONTRIBUTION = 0.05;

const HISTORY_PREFIX = "pred-history:";

function historyKey(matchId: string): string {
  return HISTORY_PREFIX + matchId;
}

/** 读取一场比赛的全部历史快照（按时间升序）。无则空数组。 */
export async function getHistory(matchId: string): Promise<PredictionSnapshot[]> {
  const kv = getKVStore();
  if (!kv) return [];
  const raw = await kv.get(historyKey(matchId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 取概率最高的结果作为「结论」标签。 */
function topOutcome(p: { homeWin: number; draw: number; awayWin: number }): "home" | "draw" | "away" {
  const max = Math.max(p.homeWin, p.draw, p.awayWin);
  if (max === p.homeWin) return "home";
  if (max === p.draw) return "draw";
  return "away";
}

const OUTCOME_CN: Record<"home" | "draw" | "away", string> = {
  home: "主胜",
  draw: "平局",
  away: "客胜",
};

/** 从归因里取贡献绝对值最大的前 N 个因子，作为快照的 topFactors。 */
function extractTopFactors(attribution: Attribution[], n = 4): PredictionSnapshot["topFactors"] {
  return [...attribution]
    .sort((a, b) => Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0))
    .slice(0, n)
    .map((a) => ({ factor: a.factor, direction: a.direction, contribution: a.contribution || 0 }));
}

/**
 * 对比本次预测与上一版快照，产出重大变更列表。首次预测（prev 为空）返回 []。
 * 检测维度：
 *  - outcome-flip：top 结论翻转
 *  - prob-swing：任一结果概率变化 ≥ 阈值
 *  - factor-flip：同名高权重因子方向反转
 *  - factor-added / factor-removed：高权重因子出现 / 消失
 */
export function detectShifts(prev: PredictionSnapshot | null, next: PredictionResult): PredictionShift[] {
  if (!prev) return [];
  const shifts: PredictionShift[] = [];

  // 1) 结论翻转
  const prevTop = topOutcome(prev.prediction);
  const nextTop = topOutcome(next.prediction);
  if (prevTop !== nextTop) {
    shifts.push({
      kind: "outcome-flip",
      label: `${OUTCOME_CN[prevTop]}→${OUTCOME_CN[nextTop]}`,
      before: OUTCOME_CN[prevTop],
      after: OUTCOME_CN[nextTop],
      note: `AI 结论从「${OUTCOME_CN[prevTop]}」翻转为「${OUTCOME_CN[nextTop]}」`,
    });
  }

  // 2) 概率大幅波动（逐结果，取最大的一项避免刷屏）
  const deltas: { key: "homeWin" | "draw" | "awayWin"; cn: string; d: number }[] = [
    { key: "homeWin", cn: "主胜", d: next.prediction.homeWin - prev.prediction.homeWin },
    { key: "draw", cn: "平局", d: next.prediction.draw - prev.prediction.draw },
    { key: "awayWin", cn: "客胜", d: next.prediction.awayWin - prev.prediction.awayWin },
  ];
  const biggest = deltas.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a));
  if (Math.abs(biggest.d) >= PROB_SWING_PP) {
    const beforeP = prev.prediction[biggest.key];
    const afterP = next.prediction[biggest.key];
    shifts.push({
      kind: "prob-swing",
      label: biggest.cn,
      before: `${(beforeP * 100).toFixed(0)}%`,
      after: `${(afterP * 100).toFixed(0)}%`,
      note: `${biggest.cn}概率 ${biggest.d > 0 ? "上升" : "下降"} ${Math.abs(biggest.d * 100).toFixed(0)}pp（${(beforeP * 100).toFixed(0)}%→${(afterP * 100).toFixed(0)}%）`,
    });
  }

  // 3) 因子层面：方向反转 / 高权重因子增删
  const prevFactors = new Map(prev.topFactors.map((f) => [f.factor, f]));
  const nextFactors = extractTopFactors(next.attribution, 6);
  const nextMap = new Map(nextFactors.map((f) => [f.factor, f]));

  for (const nf of nextFactors) {
    const pf = prevFactors.get(nf.factor);
    if (pf) {
      // 方向反转（且双方都达到显著贡献）
      if (
        pf.direction !== nf.direction &&
        pf.direction !== "neutral" &&
        nf.direction !== "neutral" &&
        Math.abs(nf.contribution) >= SIGNIFICANT_CONTRIBUTION
      ) {
        shifts.push({
          kind: "factor-flip",
          label: nf.factor,
          before: pf.direction === "home" ? "利主" : "利客",
          after: nf.direction === "home" ? "利主" : "利客",
          note: `「${nf.factor}」由${pf.direction === "home" ? "利主" : "利客"}转为${nf.direction === "home" ? "利主" : "利客"}`,
        });
      }
    } else if (Math.abs(nf.contribution) >= SIGNIFICANT_CONTRIBUTION) {
      // 新出现的高权重因子
      shifts.push({
        kind: "factor-added",
        label: nf.factor,
        after: nf.direction === "home" ? "利主" : nf.direction === "away" ? "利客" : "中性",
        note: `新增关键因子「${nf.factor}」`,
      });
    }
  }

  // 高权重因子消失
  for (const pf of prev.topFactors) {
    if (Math.abs(pf.contribution) >= SIGNIFICANT_CONTRIBUTION && !nextMap.has(pf.factor)) {
      shifts.push({
        kind: "factor-removed",
        label: pf.factor,
        before: pf.direction === "home" ? "利主" : pf.direction === "away" ? "利客" : "中性",
        note: `关键因子「${pf.factor}」不再显著`,
      });
    }
  }

  return shifts;
}

/**
 * 追加一次预测到历史：检测相对上一版的重大变更，构造快照并写回 KV。
 * 返回本次检测到的 shifts（供调用方记录/日志）。失败静默（不影响主预测流程）。
 */
export async function appendHistory(result: PredictionResult): Promise<PredictionShift[]> {
  const kv = getKVStore();
  if (!kv) return [];

  const history = await getHistory(result.matchId);
  const prev = history.length > 0 ? history[history.length - 1] : null;

  // 幂等保护：若上一条快照与本次结果同一时刻（缓存命中返回旧结果），
  // 不重复追加，也不误报变更。
  if (prev && prev.at === result.generatedAt) return [];

  const shifts = detectShifts(prev, result);

  const snapshot: PredictionSnapshot = {
    at: result.generatedAt,
    prediction: result.prediction,
    confidence: result.confidence,
    topFactors: extractTopFactors(result.attribution),
    shifts,
  };

  history.push(snapshot);
  // 仅保留最近 N 次
  const trimmed = history.slice(-MAX_SNAPSHOTS);

  try {
    await kv.put(historyKey(result.matchId), JSON.stringify(trimmed));
  } catch {
    // 历史写入失败不影响主流程
  }

  return shifts;
}
