"use client";

import { useState, useRef, useCallback } from "react";

/** 单场比赛的最小入参。 */
export interface BatchMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
}

export interface BatchProgress {
  running: boolean;
  total: number;
  done: number;
  failed: number;
}

const CONCURRENCY = 3;
const IDLE: BatchProgress = { running: false, total: 0, done: 0, failed: 0 };

/**
 * 管理员批量预测执行器:限并发逐场 POST /api/predict。
 * 失败计数但不中断整体;运行中拒绝重复触发。
 */
export function useBatchPredict() {
  const [progress, setProgress] = useState<BatchProgress>(IDLE);
  const runningRef = useRef(false);

  const run = useCallback(
    async (
      items: BatchMatch[],
      opts: { token: string | null; forceRefresh?: boolean }
    ): Promise<BatchProgress> => {
      if (runningRef.current || items.length === 0) return progress;
      runningRef.current = true;

      const total = items.length;
      let done = 0;
      let failed = 0;
      setProgress({ running: true, total, done, failed });

      const queue = [...items];

      const worker = async () => {
        while (queue.length) {
          const m = queue.shift();
          if (!m) break;
          try {
            const res = await fetch("/api/predict", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
              },
              body: JSON.stringify({
                matchId: String(m.id),
                homeTeam: m.homeTeam,
                awayTeam: m.awayTeam,
                forceRefresh: !!opts.forceRefresh,
              }),
            });
            if (!res.ok) failed++;
          } catch {
            failed++;
          }
          done++;
          setProgress({ running: true, total, done, failed });
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
      );

      const final: BatchProgress = { running: false, total, done, failed };
      setProgress(final);
      runningRef.current = false;
      return final;
    },
    [progress]
  );

  return { progress, run };
}
