"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { groups, stages } from "@/data/matches";
import { isConfirmedFixture } from "@/data/teams";
import { MatchCard } from "@/components/MatchCard";
import { FilterChips } from "@/components/FilterChips";
import { TavilyPoolModal } from "@/components/TavilyPoolModal";
import { HealthEventsModal } from "@/components/HealthEventsModal";
import { ScrollDateIndicator } from "@/components/ScrollDateIndicator";
import { VisitorStats } from "@/components/VisitorStats";
import { convertMatchTimeToBJ } from "@/lib/timezone";
import { useMatches } from "@/hooks/useMatches";
import { usePredictions } from "@/hooks/usePredictions";
import { useBatchPredict } from "@/hooks/useBatchPredict";
import { useAdmin } from "@/contexts/AdminContext";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = weekdays[date.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

export default function SchedulePage() {
  const { matches, lastUpdated, isLive } = useMatches();
  const { predictions, refetch } = usePredictions();
  const { isAdmin, token, logout } = useAdmin();
  const { progress, run } = useBatchPredict();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthAlerts, setHealthAlerts] = useState(0);

  // 「一键预测」候选集:对阵已确定且待开赛的比赛。
  const eligible = useMemo(
    () => matches.filter((m) => m.status === "upcoming" && isConfirmedFixture(m.homeTeam, m.awayTeam)),
    [matches]
  );
  // 补缺集:候选集中尚无已发布预测的。
  const missing = useMemo(
    () => eligible.filter((m) => !predictions[String(m.id)]),
    [eligible, predictions]
  );

  // 管理员登录后拉取近 3 天异常数(error 级),给「系统异常」按钮加红点提示。
  useEffect(() => {
    if (!isAdmin || !token) return;
    let cancelled = false;
    fetch("/api/health-events", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d: { events?: { severity: string }[] }) => {
        if (!cancelled) setHealthAlerts((d.events ?? []).filter((e) => e.severity === "error").length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  async function handleBatchFill() {
    await run(missing, { token, forceRefresh: false });
    await refetch();
  }

  async function handleBatchForceAll() {
    if (!window.confirm(`将对全部 ${eligible.length} 场已确定对阵强制重新预测（绕过缓存，消耗较多额度）。确认？`)) return;
    await run(eligible, { token, forceRefresh: true });
    await refetch();
  }

  const [syncing, setSyncing] = useState(false);
  async function handleSyncKnockout() {
    if (!token) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-knockout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        alert(`同步成功！更新了 ${data.knockoutUpdated} 场淘汰赛对阵`);
        window.location.reload(); // 刷新页面以显示新对阵
      } else {
        alert(`同步失败：${data.error}`);
      }
    } catch (err) {
      alert(`同步失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSyncing(false);
    }
  }

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (selectedGroup && match.group !== selectedGroup) return false;
      if (selectedStage && match.stage !== selectedStage) return false;
      return true;
    });
  }, [matches, selectedGroup, selectedStage]);

  const groupedMatches = useMemo(() => {
    const grouped: Record<string, { match: typeof matches[number]; convertedTime: string }[]> = {};
    for (const match of filteredMatches) {
      const converted = convertMatchTimeToBJ(match.date, match.time);
      if (!grouped[converted.date]) {
        grouped[converted.date] = [];
      }
      grouped[converted.date].push({ match, convertedTime: converted.time });
    }
    // 同一天内按开球时间(北京时间 HH:MM)升序——同日期下字符串比较即时间顺序;
    // 并列按 id 兜底保证稳定。配合下方 grid 的 row-flow,即「早→晚 = 左上→右→换行」。
    for (const date in grouped) {
      grouped[date].sort(
        (a, b) =>
          a.convertedTime.localeCompare(b.convertedTime) || a.match.id - b.match.id
      );
    }
    // 日期段之间按 BJ 日期升序,整页自上而下严格时间递增。
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMatches]);

  // 首次进入 / 刷新:自动定位到「当前北京日期」的比赛段(无今天则取最近的未来段,赛事全过则最后一天)。
  // 只定位一次——之后筛选、轮询刷新都不再打扰用户。
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || groupedMatches.length === 0) return;

    const scrollToToday = () => {
      if (didAutoScroll.current) return;
      const dates = groupedMatches.map(([d]) => d);
      // 当前北京日期(YYYY-MM-DD),与分组 key 同口径
      const todayBJ = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const target = dates.find((d) => d >= todayBJ) ?? dates[dates.length - 1];
      const el = document.getElementById(`date-${target}`);
      if (!el) return;
      didAutoScroll.current = true;
      // 让「X月X日」尽量贴顶:按 sticky header 的实测高度(含标题 + 筛选条,随登录态/换行变化)
      // 精确让位,使日期行刚好落在 header 下沿,而非被筛选条遮住或留大段空白。
      const header = document.querySelector("header");
      const headerH = header ? header.getBoundingClientRect().height : 0;
      const y = el.getBoundingClientRect().top + window.scrollY - headerH;
      window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
    };

    // KV 已到位 → 直接按终态布局定位;否则用静态兜底先定位(600ms 兜底,避免 KV 慢/失败时停在顶部)。
    if (lastUpdated) {
      scrollToToday();
    } else {
      const timer = window.setTimeout(scrollToToday, 600);
      return () => window.clearTimeout(timer);
    }
  }, [groupedMatches, lastUpdated]);

  const stageOptions = stages.map((s) => s.label);
  const stageKeyFromLabel = (label: string | null): string | null => {
    if (!label) return null;
    return stages.find((s) => s.label === label)?.key || null;
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border safe-area-top">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">FIFA 2026 世界杯</h1>
              {isLive && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-live/20 text-live text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                  直播中
                </span>
              )}
            </div>
            <span className="text-xs text-muted">北京时间</span>
            {isAdmin && (
              <button
                onClick={logout}
                className="text-xs text-muted hover:text-foreground ml-2 px-3 min-h-[44px] py-2 rounded-full border border-border hover:border-highlight/50 active:bg-card-hover transition-all duration-150"
              >
                退出管理
              </button>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <button
                onClick={handleBatchFill}
                disabled={progress.running || missing.length === 0}
                className="text-xs font-medium px-3 min-h-[44px] py-2 rounded-full bg-highlight/10 text-highlight border border-highlight/30 hover:bg-highlight/20 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {progress.running
                  ? `预测中 ${progress.done}/${progress.total}…`
                  : missing.length === 0
                    ? "已全部预测"
                    : `一键预测（补 ${missing.length} 场）`}
              </button>
              <button
                onClick={handleBatchForceAll}
                disabled={progress.running || eligible.length === 0}
                className="text-xs text-muted hover:text-foreground px-3 min-h-[44px] py-2 rounded-full border border-border hover:border-highlight/50 active:bg-card-hover transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                强制全部重测（{eligible.length}）
              </button>
              <button
                onClick={handleSyncKnockout}
                disabled={syncing}
                className="text-xs font-medium px-3 min-h-[44px] py-2 rounded-full bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? "同步中..." : "同步32强对阵"}
              </button>
              <button
                onClick={() => setPoolOpen(true)}
                className="text-xs text-muted hover:text-foreground px-3 min-h-[44px] py-2 rounded-full border border-border hover:border-highlight/50 active:bg-card-hover transition-all duration-150"
              >
                号池管理
              </button>
              <button
                onClick={() => setHealthOpen(true)}
                className="relative text-xs text-muted hover:text-foreground px-3 min-h-[44px] py-2 rounded-full border border-border hover:border-highlight/50 active:bg-card-hover transition-all duration-150"
              >
                系统异常
                {healthAlerts > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-medium flex items-center justify-center">
                    {healthAlerts}
                  </span>
                )}
              </button>
              {!progress.running && progress.total > 0 && (
                <span className="text-xs text-muted">
                  完成 {progress.done}/{progress.total}
                  {progress.failed > 0 ? `，失败 ${progress.failed}` : ""}
                </span>
              )}
            </div>
          )}
          <div className="space-y-2">
            <FilterChips
              label="按阶段筛选"
              options={stageOptions}
              selected={selectedStage ? stages.find((s) => s.key === selectedStage)?.label || null : null}
              onSelect={(label) => {
                setSelectedStage(stageKeyFromLabel(label));
                if (label && stageKeyFromLabel(label) !== "group") {
                  setSelectedGroup(null);
                }
              }}
            />
            {(!selectedStage || selectedStage === "group") && (
              <FilterChips
                label="按小组筛选"
                options={groups}
                selected={selectedGroup}
                onSelect={setSelectedGroup}
              />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {groupedMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted text-sm">无匹配比赛</p>
            <button
              onClick={() => { setSelectedGroup(null); setSelectedStage(null); }}
              className="mt-3 text-upcoming text-sm font-medium cursor-pointer hover:underline py-2 px-4 min-h-[44px]"
            >
              清除筛选
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedMatches.map(([date, dateMatches]) => (
              <section key={date} id={`date-${date}`} className="scroll-mt-24">
                <h2 className="text-sm font-medium text-muted mb-3 py-2">
                  {formatDate(date)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dateMatches.map(({ match, convertedTime }) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      displayTime={convertedTime}
                      prediction={predictions[String(match.id)] ?? null}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <ScrollDateIndicator dates={groupedMatches.map(([date]) => date)} />

      <footer className="border-t border-border py-5 text-center safe-area-bottom">
        <div className="mb-3 flex justify-center">
          <VisitorStats />
        </div>
        <p className="text-xs text-muted">
          FIFA 2026 世界杯 · 美国 / 墨西哥 / 加拿大
          {lastUpdated && (
            <span className="ml-2">· 更新于 {new Date(lastUpdated).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </p>
      </footer>

      {isAdmin && <TavilyPoolModal open={poolOpen} onClose={() => setPoolOpen(false)} />}
      {isAdmin && <HealthEventsModal open={healthOpen} onClose={() => setHealthOpen(false)} />}
    </div>
  );
}
