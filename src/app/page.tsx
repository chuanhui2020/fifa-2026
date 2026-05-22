"use client";

import { useState, useMemo } from "react";
import { matches, groups, stages, MatchStage } from "@/data/matches";
import { MatchCard } from "@/components/MatchCard";
import { FilterChips } from "@/components/FilterChips";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = weekdays[date.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

function groupMatchesByDate(matchList: typeof matches) {
  const grouped: Record<string, typeof matches> = {};
  for (const match of matchList) {
    if (!grouped[match.date]) {
      grouped[match.date] = [];
    }
    grouped[match.date].push(match);
  }
  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
}

export default function SchedulePage() {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (selectedGroup && match.group !== selectedGroup) return false;
      if (selectedStage && match.stage !== selectedStage) return false;
      return true;
    });
  }, [selectedGroup, selectedStage]);

  const groupedMatches = useMemo(() => groupMatchesByDate(filteredMatches), [filteredMatches]);

  const stageOptions = stages.map((s) => s.label);
  const stageKeyFromLabel = (label: string | null): string | null => {
    if (!label) return null;
    return stages.find((s) => s.label === label)?.key || null;
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border safe-area-top">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold tracking-tight">FIFA 2026</h1>
            <span className="text-xs text-muted">{matches.length} 场比赛</span>
          </div>
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
              className="mt-3 text-upcoming text-sm font-medium cursor-pointer hover:underline"
            >
              清除筛选
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedMatches.map(([date, dateMatches]) => (
              <section key={date}>
                <h2 className="text-sm font-medium text-muted mb-3 sticky top-[108px] bg-background/95 backdrop-blur-sm py-2 z-10">
                  {formatDate(date)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dateMatches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center safe-area-bottom">
        <p className="text-xs text-muted">FIFA World Cup 2026 · USA / Mexico / Canada</p>
      </footer>
    </div>
  );
}
