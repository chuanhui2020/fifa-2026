"use client";

import { useState, useEffect, useCallback } from "react";
import type { PredictionResult } from "@/agents/types";

export interface UsePredictionsResult {
  predictions: Record<string, PredictionResult>;
  /** 重新拉取已发布预测（批量预测完成后调用，让卡片刷新）。 */
  refetch: () => Promise<void>;
}

/**
 * 拉取已发布的预测结果（matchId → PredictionResult），供所有访客只读查看。
 * 接口失败时返回空对象（页面静默降级，不影响赛程显示）。
 */
export function usePredictions(): UsePredictionsResult {
  const [predictions, setPredictions] = useState<Record<string, PredictionResult>>({});

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/predictions");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.predictions) setPredictions(data.predictions);
    } catch {
      // 静默降级：无预测数据时只是不显示预测
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/predictions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.predictions) setPredictions(data.predictions);
      })
      .catch(() => {
        // 静默降级
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { predictions, refetch };
}
