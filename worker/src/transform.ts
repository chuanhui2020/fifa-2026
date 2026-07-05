import { Match, MatchStage, MatchStatus } from "./types";
import { ESPNEvent } from "./espn";
import { getGroup, normalizeTeamName, normalizeVenueName, isRealTeamName } from "./group-map";
import { KNOCKOUT_SLOTS } from "./knockout-slots";

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

/** 种子稳定 id 上限：静态赛程 id 为 1..104；ESPN 事件号是 6 位（≥760000）。 */
const SEED_ID_MAX = 1000;

/**
 * 把 ESPN 抓到的 updates 合并进 existing（KV 现有全量）。匹配优先级：
 *   1) espnId 精确 —— 一旦某行带过 espnId，后续最稳，日期/队名怎么变都跟得上。
 *   2) 主客队对（日期无关）—— 小组赛即使官方调了开球时间/日期也能命中并改正。
 *   3) stage+date+venue 兜底 —— 淘汰赛占位对阵（"A组第2 vs B组第2"）按固定的
 *      日期+场馆槽位原地更新成真实队名，避免重复行。
 * 命中后保留站内稳定 id，其余字段（date/time/status/score/venue/espnId）以 ESPN 为准。
 *
 * 淘汰赛特有的两条护栏（否则占位符会污染种子槽位）：
 *   - 真实队名门槛：ESPN 尚未定队的淘汰赛 provisional 场次（队名仍是 "Round of 16 X
 *     Winner" 等占位）一律跳过。它们不带任何种子里没有的信息，却会因 pairKey 把所有占位名
 *     压成同一键、或 espnId 绑定后跟随 ESPN 的日期/场馆漂移，把种子行「拖走」
 *     （如 QF id97 被搬离 7/9 Gillette 撞进 7/10 SoFi）。
 *   - 淘汰赛不新增行：32 个淘汰赛槽位在种子里已全量存在，ESPN 不应引入新场次；没命中就
 *     跳过，避免像西雅图 id94/id760505 那样凭空多出一条重复。只有小组赛允许新增。
 * 收尾再跑一次 dedupeKnockoutSlots，回收历史遗留的 ESPN 重复行。
 */
export function mergeMatches(existing: Match[], updates: Match[]): Match[] {
  const merged = [...existing];

  for (const update of updates) {
    const isKnockout = update.stage !== "group";

    // 真实队名门槛：占位淘汰赛 update 直接丢弃，不绑定、不新增、不修改。
    if (isKnockout && !(isRealTeamName(update.homeTeam) && isRealTeamName(update.awayTeam))) {
      continue;
    }

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
    } else if (!isKnockout) {
      // 淘汰赛没命中不新增（种子已全量）；仅小组赛容许新增缺失的真实场次。
      merged.push(update);
    }
  }

  return dedupeKnockoutSlots(merged);
}

/**
 * 收尾去重：同一淘汰赛槽位（stage + date + 归一化 venue）里若同时存在种子稳定行
 * （id < SEED_ID_MAX）与 ESPN 另建的重复行（id ≥ SEED_ID_MAX，6 位事件号），
 * 把真实字段（队名/status/score/espnId）并回种子行、丢弃 ESPN 重复行，保留种子稳定 id。
 * 只回收「非种子 id」的重复；两条种子行撞同一槽位（错绑，如 QF id97/id98）不在此收敛，
 * 交由按种子重建的对账端点处理，以免误删一场合法比赛。
 */
function dedupeKnockoutSlots(matches: Match[]): Match[] {
  const slotKey = (m: Match) => `${m.stage}|${m.date}|${normalizeVenueName(m.venue)}`;
  const bySlot = new Map<string, Match[]>();
  for (const m of matches) {
    const k = slotKey(m);
    const arr = bySlot.get(k);
    if (arr) arr.push(m);
    else bySlot.set(k, [m]);
  }

  const dropIds = new Set<number>();
  const patch = new Map<number, Match>();
  for (const rows of bySlot.values()) {
    if (rows.length < 2 || rows[0].stage === "group") continue;
    const seedRows = rows.filter((m) => m.id < SEED_ID_MAX);
    const espnDups = rows.filter((m) => m.id >= SEED_ID_MAX);
    if (seedRows.length !== 1 || espnDups.length === 0) continue;
    const seedRow = seedRows[0];
    // 优先取带真实队名的 ESPN 行做数据源
    const src =
      espnDups.find((m) => isRealTeamName(m.homeTeam) && isRealTeamName(m.awayTeam)) ?? espnDups[0];
    patch.set(seedRow.id, {
      ...seedRow,
      homeTeam: src.homeTeam,
      awayTeam: src.awayTeam,
      espnId: src.espnId,
      status: src.status,
      ...(src.homeScore !== undefined ? { homeScore: src.homeScore } : {}),
      ...(src.awayScore !== undefined ? { awayScore: src.awayScore } : {}),
    });
    for (const d of espnDups) dropIds.add(d.id);
  }

  if (dropIds.size === 0 && patch.size === 0) return matches;
  return matches.filter((m) => !dropIds.has(m.id)).map((m) => patch.get(m.id) ?? m);
}

/**
 * 按固定槽位对账淘汰赛，以 KNOCKOUT_SLOTS（赛前即固定的 32 个 stage+date+venue+id）为权威，
 * 重建全部淘汰赛行；小组赛行原样保留。每个槽位取「同 id 或落在该 stage+date+归一化 venue」
 * 的行中带真实队名者，叠加队名/status/score/espnId；无真实对阵则保留占位名。
 * 由此一次性收敛两类脏数据并自愈：
 *   - ESPN 另建的重复行（非种子 id，不在槽位表中 → 自然不产出，等于删除）；
 *   - 被 provisional 事件用 espnId 拖走的种子行（如 QF id97 漂到别的场馆 → 按 id 命中后复位）。
 * 幂等：KV 干净后再次运行产出一致，可安全地在每次 cron 同步后执行。
 */
export function reconcileKnockoutSlots(matches: Match[]): Match[] {
  const groupRows = matches.filter((m) => m.stage === "group");
  const koRows = matches.filter((m) => m.stage !== "group");
  const nv = (v: string) => normalizeVenueName(v || "");

  const rebuilt: Match[] = KNOCKOUT_SLOTS.map((slot) => {
    const candidates = koRows.filter(
      (m) =>
        m.id === slot.id ||
        (m.stage === slot.stage && m.date === slot.date && nv(m.venue) === nv(slot.venue))
    );
    const real = candidates.find((c) => isRealTeamName(c.homeTeam) && isRealTeamName(c.awayTeam));

    const out: Match = {
      id: slot.id,
      date: slot.date,
      time: slot.time,
      homeTeam: slot.homeTeam,
      awayTeam: slot.awayTeam,
      stage: slot.stage,
      venue: slot.venue,
      city: slot.city,
      status: "upcoming",
    };
    if (real) {
      out.homeTeam = real.homeTeam;
      out.awayTeam = real.awayTeam;
      out.status = real.status;
      if (real.espnId) out.espnId = real.espnId;
      if (real.homeScore !== undefined) out.homeScore = real.homeScore;
      if (real.awayScore !== undefined) out.awayScore = real.awayScore;
    }
    return out;
  });

  return [...groupRows, ...rebuilt];
}
