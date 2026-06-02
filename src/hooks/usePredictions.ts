"use client";

import { useState, useEffect } from "react";
import type { PredictionResult } from "@/agents/types";

/**
 * 拉取已发布的预测结果（matchId → PredictionResult），供所有访客只读查看。
 * 接口失败时返回空对象（页面静默降级，不影响赛程显示）。
 */
export function usePredictions(): Record<string, PredictionResult> {
  const [predictions, setPredictions] = useState<Record<string, PredictionResult>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/predictions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.predictions) setPredictions(data.predictions);
      })
      .catch(() => {
        // 静默降级：无预测数据时只是不显示预测
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return predictions;
}
