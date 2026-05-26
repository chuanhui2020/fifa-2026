"use client";

import { Match } from "@/data/matches";
import { getTeamDisplay } from "@/data/teams";
import { getVenueDisplay, getCityDisplay } from "@/data/venues";
import { PredictionCard } from "./PredictionCard";

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
            alt={cn}
            className="mr-1.5 shrink-0 rounded-[2px] ring-1 ring-white/20 object-cover"
            style={{ width: 20, height: 15 }}
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

export function MatchCard({ match, displayTime }: { match: Match; displayTime?: string }) {
  const homeWins = match.status === "finished" && match.homeScore !== undefined && match.awayScore !== undefined && match.homeScore > match.awayScore;
  const awayWins = match.status === "finished" && match.homeScore !== undefined && match.awayScore !== undefined && match.awayScore > match.homeScore;

  const borderColor = {
    live: "border-l-live",
    upcoming: "border-l-upcoming",
    finished: "border-l-border",
  }[match.status];

  return (
    <article
      className={`bg-card border border-border rounded-xl p-4 border-l-[3px] ${borderColor} transition-colors duration-200 hover:bg-card-hover`}
    >
      <div className="flex items-center justify-between mb-3">
        <StatusBadge status={match.status} />
        <StageLabel match={match} />
      </div>

      <div className="space-y-0.5">
        <TeamRow name={match.homeTeam} score={match.homeScore} isWinner={homeWins} />
        <TeamRow name={match.awayTeam} score={match.awayScore} isWinner={awayWins} />
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted truncate max-w-[60%]">{getVenueDisplay(match.venue)}, {getCityDisplay(match.city)}</span>
        <span className="text-xs text-muted tabular-nums font-medium">{displayTime || match.time}</span>
      </div>

      {match.status === "upcoming" && (
        <PredictionCard matchId={String(match.id)} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
      )}
    </article>
  );
}
