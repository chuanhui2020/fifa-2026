import { Match, MatchStage, MatchStatus } from "./types";
import { ESPNEvent } from "./espn";
import { getGroup, normalizeTeamName, normalizeVenueName } from "./group-map";

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

function mapStatus(state: string): MatchStatus {
  switch (state) {
    case "in": return "live";
    case "post": return "finished";
    // pre / postponed / canceled / suspended / 其它未知状态 → 一律按「未开赛」兜底。
    // Match.status 只有 upcoming/live/finished 三态;无 default 时未知状态会落成 undefined,
    // 让前端与自动 resolve 行为未定义。与 football-data.ts 的降级保持一致。
    default: return "upcoming";
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
      venue: normalizeVenueName(comp.venue?.fullName || ""),
      // ESPN 偶尔把州/省塞进 city（如 "Inglewood, California"）；只取主体，
      // 与静态赛程的 city 命名（"Inglewood"）一致，前端查表才能映射成中文。
      city: (comp.venue?.address?.city || "").split(",")[0].trim(),
      status,
    };

    if (group) match.group = group;

    if (status === "live" || status === "finished") {
      // 用 ?? "" 而非 || "0":区分「ESPN 没给 score」(undefined → parseInt("") → NaN → 不写)
      // 与「真 0 分」("0" → 0 → 写)。缺数据时不写假 0-0,mergeMatches 会保留上一次真实比分,
      // 避免把虚假 0-0 灌进 matches:all 再被自动 resolve 当成赛果。
      const homeScore = parseInt(homeComp.score ?? "");
      const awayScore = parseInt(awayComp.score ?? "");
      if (!isNaN(homeScore)) match.homeScore = homeScore;
      if (!isNaN(awayScore)) match.awayScore = awayScore;
    }

    return match;
  }).filter((m): m is Match => m !== null);
}

/**
 * 队名归一化键：先过别名表，再 NFD 拆分音符 + 小写 + 只留 a–z。
 * NFD 会把 ç/ü 等拆成「基字母 + 组合音符」，组合音符不是 a–z，被末步一并清掉，
 * 于是 Curaçao→curacao、Türkiye→turkiye，吸收 ESPN/种子的命名差异。
 */
function teamKey(name: string): string {
  return normalizeTeamName(name)
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** 主客有序的对阵键，用于「日期无关」匹配（容忍开球时间/日期被官方改动）。 */
function pairKey(home: string, away: string): string {
  return `${teamKey(home)}|${teamKey(away)}`;
}

/**
 * 把 ESPN 抓到的 updates 合并进 existing（KV 现有全量）。匹配优先级：
 *   1) espnId 精确 —— 一旦某行带过 espnId，后续最稳，日期/队名怎么变都跟得上。
 *   2) 主客队对（日期无关）—— 小组赛即使官方调了开球时间/日期也能命中并改正。
 *   3) stage+date+venue 兜底 —— 淘汰赛占位对阵（"A组第2 vs B组第2"）按固定的
 *      日期+场馆槽位原地更新成真实队名，避免重复行。
 *   4) 都没命中 —— 视为种子里缺的真实场次，直接新增，不再静默丢弃。
 * 命中后保留站内稳定 id，其余字段（date/time/status/score/venue/espnId）以 ESPN 为准。
 */
export function mergeMatches(existing: Match[], updates: Match[]): Match[] {
  const merged = [...existing];

  for (const update of updates) {
    let idx = -1;

    if (update.espnId) {
      idx = merged.findIndex((m) => m.espnId && m.espnId === update.espnId);
    }

    if (idx < 0) {
      const pk = pairKey(update.homeTeam, update.awayTeam);
      idx = merged.findIndex((m) => pairKey(m.homeTeam, m.awayTeam) === pk);
    }

    if (idx < 0) {
      // venue 两侧都归一化后比较，容忍 KV 里残留的旧冠名（如 "Estadio Banorte"）
      // 与归一化后 update（"Estadio Azteca"）对不上。update.venue 已在 transform 阶段
      // 归一化，这里对 merged 侧再归一化一次即可双向兜底。
      const uv = normalizeVenueName(update.venue);
      idx = merged.findIndex(
        (m) => m.stage === update.stage && m.date === update.date && normalizeVenueName(m.venue) === uv
      );
    }

    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...update, id: merged[idx].id };
    } else {
      merged.push(update);
    }
  }

  return merged;
}
