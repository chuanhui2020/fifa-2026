"use client";

import { Match } from "@/data/matches";
import type { PredictionResult } from "@/agents/types";
import { getTeamDisplay } from "@/data/teams";
import { getVenueDisplay, getCityDisplay } from "@/data/venues";
import { PredictionCard } from "./PredictionCard";
import { ReviewCard } from "./ReviewCard";
import { ErrorBoundary } from "./ErrorBoundary";

function StatusBadge({ status }: { status: Match["status"] }) {
  const config = {
    live: { label: "进行中", className: "bg-live/20 text-live" },
    upcoming: { label: "即将开始", className: "bg-upcoming/20 text-upcoming" },
    finished: { label: "已结束", className: "bg-finished/20 text-finished" },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {status === "live" && (
        <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse-live" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function TeamRow({
  name,
  score,
  isWinner,
}: {
  name: string;
  score?: number;
  isWinner: boolean;
}) {
  const { cn, code } = getTeamDisplay(name);
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`flex items-center text-sm truncate ${isWinner ? "font-semibold text-foreground" : "text-foreground"}`}>
        {code && (
          <img
            src={`https://flagcdn.com/${code}.svg`}
            width="20"
            height="15"
            alt=""
            aria-hidden="true"
            className="mr-1.5 shrink-0 rounded-[2px] ring-1 ring-white/20 object-cover"
            style={{ width: 20, height: 15, aspectRatio: "4/3" }}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        {cn}
      </span>
      {score !== undefined && (
        <span className={`text-sm tabular-nums font-semibold ml-2 ${isWinner ? "text-foreground" : "text-muted"}`}>
          {score}
        </span>
      )}
    </div>
  );
}

function StageLabel({ match }: { match: Match }) {
  if (match.group) return <span className="text-xs text-muted font-medium">{match.group}组</span>;
  const stageLabels: Record<string, string> = {
    round32: "32强",
    round16: "16强",
    quarter: "1/4决赛",
    semi: "半决赛",
    third: "三四名",
    final: "决赛",
  };
  return <span className="text-xs text-highlight font-medium">{stageLabels[match.stage] || match.stage}</span>;
}

export function MatchCard({ match, displayTime, prediction }: { match: Match; displayTime?: string; prediction?: PredictionResult | null }) {
  const homeWins = match.status === "finished" && match.homeScore !== undefined && match.awayScore !== undefined && match.homeScore > match.awayScore;
  const awayWins = match.status === "finished" && match.homeScore !== undefined && match.awayScore !== undefined && match.awayScore > match.homeScore;

  const borderColor = {
    live: "border-l-live",
    upcoming: "border-l-upcoming",
    finished: "border-l-border",
  }[match.status];

  return (
    <article
      className={`bg-card border border-border rounded-xl p-4 border-l-[3px] ${borderColor} transition-colors duration-200 active:bg-card-hover hover:bg-card-hover content-visibility-auto`}
    >
      <div className="flex items-center justify-between mb-3">
        <StatusBadge status={match.status} />
        <StageLabel match={match} />
      </div>

      <div className="space-y-0.5">
        <TeamRow name={match.homeTeam} score={match.homeScore} isWinner={homeWins} />
        <TeamRow name={match.awayTeam} score={match.awayScore} isWinner={awayWins} />
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <svg className="w-3.5 h-3.5 text-muted/60 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs text-foreground/70 truncate">{getVenueDisplay(match.venue)}</p>
            <p className="text-[11px] text-muted/70 truncate">{getCityDisplay(match.city)}</p>
          </div>
        </div>
        <span className="text-xs text-muted tabular-nums font-medium shrink-0">{displayTime || match.time}</span>
      </div>

      {match.status === "upcoming" && (
        <ErrorBoundary>
          <PredictionCard
            matchId={String(match.id)}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            published={prediction}
          />
        </ErrorBoundary>
      )}

      {match.status === "finished" && prediction && (
        <ErrorBoundary>
          <ReviewCard match={match} prediction={prediction} />
        </ErrorBoundary>
      )}
    </article>
  );
}
