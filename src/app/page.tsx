"use client";

import { useState, useMemo } from "react";
import { groups, stages } from "@/data/matches";
import { isConfirmedFixture } from "@/data/teams";
import { MatchCard } from "@/components/MatchCard";
import { FilterChips } from "@/components/FilterChips";
import { TavilyPoolModal } from "@/components/TavilyPoolModal";
import { ScrollDateIndicator } from "@/components/ScrollDateIndicator";
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

  async function handleBatchFill() {
    await run(missing, { token, forceRefresh: false });
    await refetch();
  }

  async function handleBatchForceAll() {
    if (!window.confirm(`将对全部 ${eligible.length} 场已确定对阵强制重新预测（绕过缓存，消耗较多额度）。确认？`)) return;
    await run(eligible, { token, forceRefresh: true });
    await refetch();
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
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMatches]);

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
                onClick={() => setPoolOpen(true)}
                className="text-xs text-muted hover:text-foreground px-3 min-h-[44px] py-2 rounded-full border border-border hover:border-highlight/50 active:bg-card-hover transition-all duration-150"
              >
                号池管理
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

      <footer className="border-t border-border py-4 text-center safe-area-bottom">
        <p className="text-xs text-muted">
          FIFA 2026 世界杯 · 美国 / 墨西哥 / 加拿大
          {lastUpdated && (
            <span className="ml-2">· 更新于 {new Date(lastUpdated).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </p>
      </footer>

      {isAdmin && <TavilyPoolModal open={poolOpen} onClose={() => setPoolOpen(false)} />}
    </div>
  );
}
