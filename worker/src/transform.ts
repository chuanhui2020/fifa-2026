import { Match, MatchStage, MatchStatus } from "./types";
import { ESPNEvent } from "./espn";
import { getGroup, normalizeTeamName } from "./group-map";

const STAGE_DATE_RANGES: { start: string; end: string; stage: MatchStage }[] = [
  { start: "2026-06-11", end: "2026-06-27", stage: "group" },
  { start: "2026-06-28", end: "2026-07-03", stage: "round32" },
  { start: "2026-07-04", end: "2026-07-07", stage: "round16" },
  { start: "2026-07-09", end: "2026-07-11", stage: "quarter" },
  { start: "2026-07-14", end: "2026-07-15", stage: "semi" },
  { start: "2026-07-18", end: "2026-07-18", stage: "third" },
  { start: "2026-07-19", end: "2026-07-19", stage: "final" },
];

function getStageFromDate(dateStr: string): MatchStage {
  for (const range of STAGE_DATE_RANGES) {
    if (dateStr >= range.start && dateStr <= range.end) {
      return range.stage;
    }
  }
  return "group";
}

function mapStatus(state: "pre" | "in" | "post"): MatchStatus {
  switch (state) {
    case "pre": return "upcoming";
    case "in": return "live";
    case "post": return "finished";
  }
}

function utcToET(utcDateStr: string): { date: string; time: string } {
  const utcDate = new Date(utcDateStr);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = get("hour") === "24" ? "00" : get("hour");
  const time = `${hour}:${get("minute")}`;
  return { date, time };
}

export function transformESPNEvents(events: ESPNEvent[]): Match[] {
  return events.map((event, index) => {
    const comp = event.competitions[0];
    if (!comp) return null;

    const homeComp = comp.competitors.find((c) => c.homeAway === "home");
    const awayComp = comp.competitors.find((c) => c.homeAway === "away");
    if (!homeComp || !awayComp) return null;

    const homeTeam = normalizeTeamName(homeComp.team.displayName);
    const awayTeam = normalizeTeamName(awayComp.team.displayName);
    const status = mapStatus(comp.status.type.state);

    const { date, time } = utcToET(event.date);
    const stage = getStageFromDate(date);
    const group = stage === "group" ? getGroup(homeTeam) : undefined;

    const match: Match = {
      id: parseInt(event.id) || index + 1,
      espnId: event.id,
      date,
      time,
      homeTeam,
      awayTeam,
      stage,
      venue: comp.venue?.fullName || "",
      city: comp.venue?.address?.city || "",
      status,
    };

    if (group) match.group = group;

    if (status === "live" || status === "finished") {
      const homeScore = parseInt(homeComp.score || "0");
      const awayScore = parseInt(awayComp.score || "0");
      if (!isNaN(homeScore)) match.homeScore = homeScore;
      if (!isNaN(awayScore)) match.awayScore = awayScore;
    }

    return match;
  }).filter((m): m is Match => m !== null);
}

export function mergeMatches(existing: Match[], updates: Match[]): Match[] {
  const merged = [...existing];

  for (const update of updates) {
    const idx = merged.findIndex((m) => {
      if (m.espnId && update.espnId) return m.espnId === update.espnId;
      return m.date === update.date && m.homeTeam === update.homeTeam && m.awayTeam === update.awayTeam;
    });

    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...update, id: merged[idx].id };
    } else {
      const byDateVenue = merged.findIndex(
        (m) => m.date === update.date && m.venue === update.venue && m.status === "upcoming"
      );
      if (byDateVenue >= 0) {
        merged[byDateVenue] = { ...merged[byDateVenue], ...update, id: merged[byDateVenue].id };
      }
    }
  }

  return merged;
}
