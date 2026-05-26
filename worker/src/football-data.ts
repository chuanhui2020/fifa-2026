import { Match } from "./types";

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED";
  stage: string;
  group: string | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  venue?: string;
}

function mapFDStatus(status: string): Match["status"] {
  switch (status) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
      return "finished";
    default:
      return "upcoming";
  }
}

function mapFDStage(stage: string): Match["stage"] {
  const map: Record<string, Match["stage"]> = {
    "GROUP_STAGE": "group",
    "ROUND_OF_32": "round32",
    "LAST_16": "round16",
    "QUARTER_FINALS": "quarter",
    "SEMI_FINALS": "semi",
    "THIRD_PLACE": "third",
    "FINAL": "final",
  };
  return map[stage] || "group";
}

export async function fetchFootballData(apiKey: string): Promise<Match[]> {
  const url = "https://api.football-data.org/v4/competitions/WC/matches";
  const resp = await fetch(url, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!resp.ok) {
    throw new Error(`football-data.org returned ${resp.status}`);
  }
  const data = await resp.json() as { matches: FootballDataMatch[] };

  return data.matches.map((m, idx) => {
    const utcDate = new Date(m.utcDate);
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

    const match: Match = {
      id: m.id || idx + 1,
      date,
      time,
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      stage: mapFDStage(m.stage),
      group: m.group?.replace("GROUP_", "") || undefined,
      venue: m.venue || "",
      city: "",
      status: mapFDStatus(m.status),
    };

    if (match.status !== "upcoming" && m.score.fullTime.home !== null) {
      match.homeScore = m.score.fullTime.home;
      match.awayScore = m.score.fullTime.away ?? undefined;
    }

    return match;
  });
}
