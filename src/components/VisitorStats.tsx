"use client";

import { useEffect, useRef, useState } from "react";
import { useVisits } from "@/hooks/useVisits";

/** 数字 0→target 计数动画(ease-out),尊重 prefers-reduced-motion;target 为 null 时不动。 */
function useCountUp(target: number | null, durationMs = 700): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = target;
    if (reduced || from === to) {
      setVal(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return val;
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  const display = useCountUp(loading ? null : value);
  return (
    <div className="flex min-w-[86px] flex-col items-center justify-center px-4 py-2">
      <span className="text-base font-semibold leading-none tabular-nums text-foreground">
        {loading ? "—" : display.toLocaleString("en-US")}
      </span>
      <span className="mt-1 text-[11px] font-medium text-muted">{label}</span>
    </div>
  );
}

/**
 * 访客统计:今日访问 / 总访问 两枚指标对(Data-Dense Dashboard 取向)。
 * 深色 token + 等宽数字 + count-up,细分隔线分隔;预留最小宽度避免计数时抖动(CLS)。
 */
export function VisitorStats() {
  const { today, total, loading } = useVisits();
  return (
    <div
      className="inline-flex items-stretch overflow-hidden rounded-xl border border-border bg-card/40"
      role="group"
      aria-label={`今日访问 ${today ?? 0} 人,总访问 ${total ?? 0} 人`}
    >
      <Stat label="今日访问" value={today ?? 0} loading={loading} />
      <div className="w-px self-stretch bg-border" aria-hidden="true" />
      <Stat label="总访问" value={total ?? 0} loading={loading} />
    </div>
  );
}
