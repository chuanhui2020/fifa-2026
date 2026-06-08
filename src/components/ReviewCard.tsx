"use client";

import { useState } from "react";
import type { Match } from "@/data/matches";
import type { PredictionResult, PredictionSnapshot, PredictionShift } from "@/agents/types";
import { getTeamDisplay } from "@/data/teams";

type Outcome = "home" | "draw" | "away";

/** 从比分判定真实胜负。 */
function actualOutcome(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

/** 取概率最高的预测结论。 */
function predictedOutcome(p: { homeWin: number; draw: number; awayWin: number }): Outcome {
  const max = Math.max(p.homeWin, p.draw, p.awayWin);
  if (max === p.homeWin) return "home";
  if (max === p.draw) return "draw";
  return "away";
}

/** shift 类型 → 中文标签 + 配色。 */
const SHIFT_META: Record<PredictionShift["kind"], { tag: string; cls: string }> = {
  "outcome-flip": { tag: "结论翻转", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  "prob-swing": { tag: "概率突变", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "factor-flip": { tag: "因子反转", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  "factor-added": { tag: "新增因子", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  "factor-removed": { tag: "因子消失", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

/** 概率演变迷你折线：三条线(主/平/客),x 轴为预测序列。纯 SVG,无依赖。 */
function ProbTimeline({ history }: { history: PredictionSnapshot[] }) {
  if (history.length < 2) return null;

  const W = 240;
  const H = 56;
  const n = history.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (p: number) => H - p * H;

  const line = (key: "homeWin" | "draw" | "awayWin") =>
    history.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.prediction[key]).toFixed(1)}`).join(" ");

  const series: { key: "homeWin" | "draw" | "awayWin"; color: string }[] = [
    { key: "homeWin", color: "#34d399" },
    { key: "draw", color: "#fbbf24" },
    { key: "awayWin", color: "#fb7185" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none" aria-label="预测概率演变">
      {series.map((s) => (
        <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function ReviewCard({ match, prediction }: { match: Match; prediction?: PredictionResult | null }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<PredictionSnapshot[] | null>(null);
  const [loadingHist, setLoadingHist] = useState(false);

  const homeCn = getTeamDisplay(match.homeTeam).cn || match.homeTeam;
  const awayCn = getTeamDisplay(match.awayTeam).cn || match.awayTeam;

  const hasScore = match.homeScore !== undefined && match.awayScore !== undefined;

  // 无预测可复盘时不渲染(已结束但从未预测过的比赛)。
  if (!prediction) return null;

  const actual = hasScore ? actualOutcome(match.homeScore!, match.awayScore!) : null;
  const predicted = predictedOutcome(prediction.prediction);
  const hit = actual !== null && actual === predicted;

  const outcomeCn: Record<Outcome, string> = { home: `${homeCn}胜`, draw: "平局", away: `${awayCn}胜` };
  const predProb = prediction.prediction;
  const predProbOf: Record<Outcome, number> = { home: predProb.homeWin, draw: predProb.draw, away: predProb.awayWin };

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && history === null && !loadingHist) {
      setLoadingHist(true);
      try {
        const res = await fetch(`/api/prediction-history?matchId=${match.id}`);
        if (res.ok) {
          const data = await res.json();
          setHistory(Array.isArray(data?.history) ? data.history : []);
        } else {
          setHistory([]);
        }
      } catch {
        setHistory([]);
      } finally {
        setLoadingHist(false);
      }
    }
  }

  // 全部历史里出现过的重大变更(去重展示;最新在前)。
  const allShifts: { at: number; shift: PredictionShift }[] = (history ?? [])
    .flatMap((s) => s.shifts.map((shift) => ({ at: s.at, shift })))
    .reverse();

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* 复盘标题行:命中标记 */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-medium text-foreground">AI 预测复盘</span>
        {actual !== null && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              hit ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {hit ? "✓ 命中" : "✗ 未中"}
          </span>
        )}
      </div>

      {/* 预测 vs 实际 对照 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-card-hover/40 border border-border/60 px-3 py-2">
          <p className="text-muted mb-1">AI 预测</p>
          <p className="text-foreground font-medium">
            {outcomeCn[predicted]}
            <span className="text-muted tabular-nums ml-1.5">{(predProbOf[predicted] * 100).toFixed(0)}%</span>
          </p>
        </div>
        <div className="rounded-lg bg-card-hover/40 border border-border/60 px-3 py-2">
          <p className="text-muted mb-1">实际结果</p>
          <p className="text-foreground font-medium">
            {actual !== null ? outcomeCn[actual] : "—"}
            {hasScore && (
              <span className="text-muted tabular-nums ml-1.5">
                {match.homeScore}:{match.awayScore}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 展开:概率演变 + 重大变更 */}
      <button
        onClick={toggle}
        className="mt-3 w-full text-xs text-highlight hover:text-highlight/80 transition-colors duration-150 flex items-center justify-center gap-1 min-h-[44px]"
        aria-expanded={open}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        {open ? "收起分析过程" : "查看分析演变与重大变更"}
      </button>

      {open && (
        <div className="mt-2">
          {loadingHist ? (
            <p className="text-xs text-muted py-2 text-center" aria-live="polite">加载历史…</p>
          ) : history && history.length > 0 ? (
            <>
              {history.length >= 2 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted">概率演变（{history.length} 次预测）</span>
                    <span className="flex items-center gap-2 text-[10px]">
                      <span className="text-emerald-300">主</span>
                      <span className="text-amber-300">平</span>
                      <span className="text-rose-300">客</span>
                    </span>
                  </div>
                  <ProbTimeline history={history} />
                </div>
              )}

              {allShifts.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">重大归因变更（{allShifts.length}）</p>
                  <ul className="space-y-1.5">
                    {allShifts.map(({ at, shift }, i) => {
                      const meta = SHIFT_META[shift.kind];
                      const t = new Date(at);
                      const tStr = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium ${meta.cls}`}>
                            {meta.tag}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-foreground/90 leading-snug">{shift.note}</p>
                            <p className="text-[10px] text-muted/70 tabular-nums">{tStr}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted py-1">分析过程中无重大变更，预测保持稳定。</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted py-2 text-center">暂无历史记录。</p>
          )}
        </div>
      )}
    </div>
  );
}
