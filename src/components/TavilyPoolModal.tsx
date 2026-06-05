"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import type { PoolStatus } from "@/agents/tools/tavily-pool";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
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

type PostAction = "add" | "pause" | "resume" | "delete" | "reinstate";

export function TavilyPoolModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAdmin();
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");

  // forceRefresh=true 时附带 refresh=1，让后端绕过 5 分钟 usage 缓存现拉官方额度（刷新按钮用）；
  // 自动加载（开面板、增删后回拉）省略，走缓存即可。
  const load = useCallback(async (live = true, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const qs = live ? `?live=1${forceRefresh ? "&refresh=1" : ""}` : "";
      const res = await fetch(`/api/tavily-pool${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `加载失败（${res.status}）`);
      }
      setStatus(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // 打开面板即拉取号池状态。load() 开头会同步 setLoading(true)，
    // 这是面板初始化的必要副作用而非级联渲染，沿用项目既有约定豁免该规则。
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, load]);

  /** 通用 POST：成功后用返回的最新状态覆盖（不含官方额度，刷新按钮再带）。 */
  async function post(action: PostAction, payload?: { keyId?: string; apiKey?: string }): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tavily-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `操作失败（${res.status}）`);
      }
      setStatus(await res.json());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const key = newKey.trim();
    if (!key) return;
    const ok = await post("add", { apiKey: key });
    if (ok) {
      setNewKey("");
      // 新增成功后重新拉取以带上官方额度展示。
      load();
    }
  }

  async function handleDelete(keyId: string, preview: string) {
    if (!window.confirm(`确定删除账号 …${preview}？将从 KV 彻底移除，不可恢复。`)) return;
    await post("delete", { keyId });
  }

  if (!open) return null;

  const t = status?.totals;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tavily 号池管理"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Tavily 号池管理</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-muted hover:text-foreground text-sm px-2 py-1 rounded-lg hover:bg-card-hover transition-colors"
          >
            ✕
          </button>
        </div>

        {t && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mb-3">
            <span>账号 {t.accounts}</span>
            <span className="text-emerald-400">健康 {t.healthy}</span>
            {t.paused > 0 && <span className="text-amber-400">已暂停 {t.paused}</span>}
            <span className="text-rose-400">已剔除 {t.exhausted}</span>
            {t.liveUsed !== null ? (
              <>
                <span>已用 {t.liveUsed}</span>
                <span>剩余 {t.liveRemaining}</span>
              </>
            ) : (
              <span className="text-amber-400/80">官方额度不可用</span>
            )}
            {t.liveUnavailable > 0 && (
              <span className="text-amber-400/80">{t.liveUnavailable} 个号额度未拉取到</span>
            )}
          </div>
        )}

        {/* 新增账号 */}
        <div className="flex gap-2 mb-3">
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy && newKey.trim()) handleAdd();
            }}
            placeholder="粘贴 Tavily API Key 新增账号"
            autoComplete="off"
            className="flex-1 min-w-0 px-3 py-2 rounded-full text-xs bg-background border border-border text-foreground placeholder:text-muted focus:outline-none focus:border-highlight/50"
          />
          <button
            onClick={handleAdd}
            disabled={busy || !newKey.trim()}
            className="py-2 px-4 rounded-full text-xs font-medium text-highlight border border-highlight/30 hover:bg-highlight/10 transition-colors disabled:opacity-50"
          >
            添加
          </button>
        </div>

        {error && <p className="text-xs text-rose-400 mb-2" role="alert">{error}</p>}
        {loading && <p className="text-xs text-muted mb-2">加载中…</p>}

        <div className="space-y-2">
          {status?.accounts.map((a) => {
            // 官方 /usage 为准:用量条与数字均取官方值;官方不可用时退化为"额度未知"。
            const liveOk = !!a.live && !a.live.error && a.live.used !== null;
            const officialUsed = liveOk ? a.live!.used! : null;
            const officialLimit = liveOk ? a.live!.limit : null;
            const officialRemaining = liveOk ? a.live!.remaining : null;
            const pct =
              officialUsed !== null && officialLimit && officialLimit > 0
                ? Math.min(100, (officialUsed / officialLimit) * 100)
                : 0;
            const barColor = a.paused
              ? "bg-amber-400"
              : a.exhausted
                ? "bg-rose-400"
                : "bg-emerald-400";
            return (
              <div key={a.keyId} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs text-foreground/80">
                    #{a.keyId} <span className="text-muted">…{a.keyPreview}</span>
                  </span>
                  {a.paused ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">已暂停</span>
                  ) : a.exhausted ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">
                      已剔除 · 解封 {fmtTime(a.ejectedUntil)}
                    </span>
                  ) : (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">健康</span>
                  )}
                </div>
                <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 gap-2">
                  <span className="text-[11px] tabular-nums min-w-0 truncate">
                    {a.live?.error ? (
                      <span className="text-amber-400/80">额度未知（{a.live.error}）</span>
                    ) : officialUsed !== null ? (
                      <span className="text-foreground/80">
                        {officialUsed} / {officialLimit ?? "无限"}
                        {officialRemaining !== null ? `（剩 ${officialRemaining}）` : ""}
                        {a.live?.plan ? ` · ${a.live.plan}` : ""}
                      </span>
                    ) : (
                      <span className="text-muted">额度加载中…</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.exhausted && (
                      <button
                        onClick={() => post("reinstate", { keyId: a.keyId })}
                        disabled={busy}
                        className="text-[11px] text-highlight hover:underline disabled:opacity-50"
                      >
                        解封
                      </button>
                    )}
                    <button
                      onClick={() => post(a.paused ? "resume" : "pause", { keyId: a.keyId })}
                      disabled={busy}
                      className="text-[11px] text-muted hover:text-foreground hover:underline disabled:opacity-50"
                    >
                      {a.paused ? "恢复" : "暂停"}
                    </button>
                    <button
                      onClick={() => handleDelete(a.keyId, a.keyPreview)}
                      disabled={busy}
                      className="text-[11px] text-rose-400 hover:underline disabled:opacity-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
                {a.lastError && <p className="text-[11px] text-muted/70 mt-1 truncate">{a.lastError}</p>}
              </div>
            );
          })}
          {!loading && status && status.accounts.length === 0 && (
            <p className="text-xs text-muted">号池为空。粘贴 Tavily API Key 新增账号即可启用网页搜索。</p>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => load(true, true)}
            disabled={loading || busy}
            className="flex-1 py-2 rounded-full text-xs font-medium text-muted border border-border hover:bg-card-hover transition-colors disabled:opacity-50"
          >
            刷新
          </button>
        </div>
      </div>
    </div>
  );
}
