"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/contexts/AdminContext";

interface HealthEvent {
  id: string;
  type: string;
  severity: "warn" | "error";
  source: string;
  message: string;
  matchId?: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
}

const TYPE_LABEL: Record<string, string> = {
  stuck_live: "比赛卡死",
  stale_data: "数据陈旧",
  fetch_failed: "抓取失败",
  predict_failed: "预测失败",
};

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function HealthEventsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAdmin();
  const [events, setEvents] = useState<HealthEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health-events", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `加载失败（${res.status}）`);
      }
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // 打开面板即拉取异常列表。load() 开头同步 setLoading(true) 是初始化副作用,沿用项目既有豁免。
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, load]);

  if (!open) return null;

  const errorCount = events?.filter((e) => e.severity === "error").length ?? 0;
  const warnCount = events?.filter((e) => e.severity === "warn").length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="系统异常"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">系统异常 · 近 3 天</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-muted hover:text-foreground text-sm px-2 py-1 rounded-lg hover:bg-card-hover transition-colors"
          >
            ✕
          </button>
        </div>

        {events && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mb-3">
            <span className="text-rose-400">错误 {errorCount}</span>
            <span className="text-amber-400">警告 {warnCount}</span>
            <span>共 {events.length} 类</span>
          </div>
        )}

        {error && <p className="text-xs text-rose-400 mb-2" role="alert">{error}</p>}
        {loading && <p className="text-xs text-muted mb-2">加载中…</p>}

        <div className="space-y-2">
          {events?.map((e) => (
            <div key={e.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  {e.severity === "error" ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 shrink-0">
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                  ) : (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                  )}
                  <span className="text-[11px] text-muted/70 truncate">{e.source}</span>
                </span>
                {e.count > 1 && (
                  <span className="text-[11px] text-muted shrink-0 tabular-nums">×{e.count}</span>
                )}
              </div>
              <p className="text-sm text-foreground/90 break-words">{e.message}</p>
              <div className="text-[11px] text-muted/70 mt-1.5 tabular-nums">
                首次 {fmtTime(e.firstSeen)} · 最近 {fmtTime(e.lastSeen)}
              </div>
            </div>
          ))}
          {!loading && events && events.length === 0 && (
            <p className="text-xs text-muted">近 3 天无异常 🎉</p>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={load}
            disabled={loading}
            className="flex-1 py-2 rounded-full text-xs font-medium text-muted border border-border hover:bg-card-hover transition-colors disabled:opacity-50"
          >
            刷新
          </button>
        </div>
      </div>
    </div>
  );
}
