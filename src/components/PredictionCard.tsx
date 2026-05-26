"use client";

import { useState, useEffect } from "react";
import type { PredictionResult, Attribution } from "@/agents/types";

function ProbabilityBar({ homeWin, draw, awayWin, homeTeam, awayTeam }: {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeTeam?: string;
  awayTeam?: string;
}) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const label = `预测概率：${homeTeam || "主队"}胜 ${(homeWin * 100).toFixed(0)}%，平局 ${(draw * 100).toFixed(0)}%，${awayTeam || "客队"}胜 ${(awayWin * 100).toFixed(0)}%`;

  return (
    <div
      className="w-full h-2.5 rounded-full overflow-hidden flex bg-border gap-[1px]"
      role="img"
      aria-label={label}
    >
      <div
        className="h-full bg-emerald-400 rounded-l-full transition-all duration-500 ease-out"
        style={{ width: animated ? `${homeWin * 100}%` : "0%" }}
      />
      <div
        className="h-full bg-amber-400 transition-all duration-500 ease-out"
        style={{ width: animated ? `${draw * 100}%` : "0%" }}
      />
      <div
        className="h-full bg-rose-400 rounded-r-full transition-all duration-500 ease-out"
        style={{ width: animated ? `${awayWin * 100}%` : "0%" }}
      />
    </div>
  );
}

function AttributionItem({ factor, contribution, explanation, direction }: {
  factor: string;
  contribution: number;
  explanation: string;
  direction: "home" | "away" | "neutral";
}) {
  const config = {
    home: { color: "text-emerald-300", barColor: "bg-emerald-400", icon: "↑" },
    away: { color: "text-rose-300", barColor: "bg-rose-400", icon: "↓" },
    neutral: { color: "text-amber-300", barColor: "bg-amber-400", icon: "→" },
  }[direction];

  const absContribution = Math.abs(contribution);
  const barWidth = absContribution * 100;

  return (
    <div className="py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-foreground/90">{factor}</span>
        <span className={`text-xs font-medium tabular-nums ${config.color}`}>
          {config.icon} {contribution > 0 ? "+" : ""}{(contribution * 100).toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-border/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${config.barColor} transition-all duration-300 ease-out`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="text-xs text-muted mt-1.5 leading-relaxed">{explanation}</p>
    </div>
  );
}

const LOADING_STEPS = [
  "正在搜索实时数据...",
  "正在分析球队实力...",
  "正在综合归因分析...",
];

function LoadingSkeleton() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted mb-3" aria-live="polite">{LOADING_STEPS[step]}</p>
      <div className="space-y-2.5 animate-shimmer">
        <div className="flex justify-between">
          <div className="h-3.5 w-16 bg-border/60 rounded" />
          <div className="h-3.5 w-20 bg-border/60 rounded" />
        </div>
        <div className="h-2.5 w-full bg-border/60 rounded-full" />
        <div className="flex justify-between">
          <div className="h-3 w-8 bg-border/60 rounded" />
          <div className="h-3 w-6 bg-border/60 rounded" />
          <div className="h-3 w-8 bg-border/60 rounded" />
        </div>
        <div className="mt-2 h-3 w-full bg-border/60 rounded" />
        <div className="h-3 w-3/4 bg-border/60 rounded" />
      </div>
    </div>
  );
}

export function PredictionCard({
  matchId,
  homeTeam,
  awayTeam,
}: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePredict() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, homeTeam, awayTeam }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "预测失败");
      }

      const data: PredictionResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "预测失败");
    } finally {
      setLoading(false);
    }
  }

  if (!result && !error) {
    return (
      <div>
        <button
          onClick={handlePredict}
          disabled={loading}
          aria-label={loading ? "AI 正在分析比赛" : "点击获取 AI 预测"}
          className="mt-2 w-full min-h-[44px] py-2.5 px-3 rounded-lg bg-highlight/10 text-highlight text-sm font-medium hover:bg-highlight/20 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-highlight/30 border-t-highlight rounded-full animate-spin" />
              AI 分析中...
            </span>
          ) : "AI 预测"}
        </button>
        {loading && <LoadingSkeleton />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-xs text-rose-300">{error}</p>
            <button
              onClick={handlePredict}
              className="mt-2 min-h-[44px] px-3 py-2 text-xs font-medium text-highlight bg-highlight/10 rounded-lg hover:bg-highlight/20 active:scale-[0.98] transition-all duration-150"
            >
              重新预测
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { prediction, attribution, summary, confidence } = result!;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">AI 预测</span>
        <span className="text-xs text-muted tabular-nums">
          置信度 {(confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center justify-between text-sm tabular-nums mb-1.5">
        <span className="text-emerald-300 font-medium w-1/3 text-left">{(prediction.homeWin * 100).toFixed(0)}%</span>
        <span className="text-amber-300 font-medium w-1/3 text-center">{(prediction.draw * 100).toFixed(0)}%</span>
        <span className="text-rose-300 font-medium w-1/3 text-right">{(prediction.awayWin * 100).toFixed(0)}%</span>
      </div>
      <ProbabilityBar
        homeWin={prediction.homeWin}
        draw={prediction.draw}
        awayWin={prediction.awayWin}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
      <div className="flex items-center justify-between text-xs text-muted mt-1.5">
        <span className="w-1/3 text-left">主胜</span>
        <span className="w-1/3 text-center">平</span>
        <span className="w-1/3 text-right">客胜</span>
      </div>

      {summary && (
        <p className="mt-3 text-xs text-muted leading-relaxed">{summary}</p>
      )}

      {attribution.length > 0 && (
        <details className="mt-3 group">
          <summary className="text-xs text-highlight cursor-pointer hover:text-highlight/80 transition-colors duration-150 list-none flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-90"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            归因分析详情
          </summary>
          <div className="mt-2 pt-1">
            {attribution.map((attr: Attribution, i: number) => (
              <AttributionItem key={i} {...attr} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
