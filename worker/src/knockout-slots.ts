import { MatchStage } from "./types";

/**
 * 淘汰赛 32 个固定槽位（stage / date / time / venue / city / 站内稳定 id / 占位队名）。
 * 与静态种子 src/data/matches.ts 的淘汰赛部分（id 73..104）逐字一致，是 Worker 侧
 * 「按种子槽位对账」的唯一权威——赛程/场馆在赛前即固定，只有队名随赛果确定。
 * 若官方调整淘汰赛赛程，这里需与 src/data/matches.ts 同步更新。
 */
export interface KnockoutSlot {
  id: number;
  stage: MatchStage;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  city: string;
}

export const KNOCKOUT_SLOTS: KnockoutSlot[] = [
  { id: 73, stage: "round32", date: "2026-06-28", time: "15:00", homeTeam: "Group A 2nd", awayTeam: "Group B 2nd", venue: "SoFi Stadium", city: "Inglewood" },
  { id: 74, stage: "round32", date: "2026-06-29", time: "13:00", homeTeam: "Group C Winner", awayTeam: "Group F 2nd", venue: "NRG Stadium", city: "Houston" },
  { id: 75, stage: "round32", date: "2026-06-29", time: "16:30", homeTeam: "Group E Winner", awayTeam: "3rd Place A/B/C/D/F", venue: "Gillette Stadium", city: "Foxborough" },
  { id: 76, stage: "round32", date: "2026-06-29", time: "21:00", homeTeam: "Group F Winner", awayTeam: "Group C 2nd", venue: "Estadio BBVA", city: "Monterrey" },
  { id: 77, stage: "round32", date: "2026-06-30", time: "13:00", homeTeam: "Group E 2nd", awayTeam: "Group I 2nd", venue: "AT&T Stadium", city: "Arlington" },
  { id: 78, stage: "round32", date: "2026-06-30", time: "17:00", homeTeam: "Group I Winner", awayTeam: "3rd Place C/D/F/G/H", venue: "MetLife Stadium", city: "East Rutherford" },
  { id: 79, stage: "round32", date: "2026-06-30", time: "21:00", homeTeam: "Group A Winner", awayTeam: "3rd Place C/E/F/H/I", venue: "Estadio Azteca", city: "Mexico City" },
  { id: 80, stage: "round32", date: "2026-07-01", time: "12:00", homeTeam: "Group L Winner", awayTeam: "3rd Place E/H/I/J/K", venue: "Mercedes-Benz Stadium", city: "Atlanta" },
  { id: 81, stage: "round32", date: "2026-07-01", time: "16:00", homeTeam: "Group G Winner", awayTeam: "3rd Place A/E/H/I/J", venue: "Lumen Field", city: "Seattle" },
  { id: 82, stage: "round32", date: "2026-07-01", time: "20:00", homeTeam: "Group D Winner", awayTeam: "3rd Place B/E/F/I/J", venue: "Levi's Stadium", city: "Santa Clara" },
  { id: 83, stage: "round32", date: "2026-07-02", time: "15:00", homeTeam: "Group H Winner", awayTeam: "Group J 2nd", venue: "SoFi Stadium", city: "Inglewood" },
  { id: 84, stage: "round32", date: "2026-07-02", time: "19:00", homeTeam: "Group K 2nd", awayTeam: "Group L 2nd", venue: "BMO Field", city: "Toronto" },
  { id: 85, stage: "round32", date: "2026-07-02", time: "23:00", homeTeam: "Group B Winner", awayTeam: "3rd Place E/F/G/I/J", venue: "BC Place", city: "Vancouver" },
  { id: 86, stage: "round32", date: "2026-07-03", time: "14:00", homeTeam: "Group D 2nd", awayTeam: "Group G 2nd", venue: "AT&T Stadium", city: "Arlington" },
  { id: 87, stage: "round32", date: "2026-07-03", time: "18:00", homeTeam: "Group J Winner", awayTeam: "Group H 2nd", venue: "Hard Rock Stadium", city: "Miami Gardens" },
  { id: 88, stage: "round32", date: "2026-07-03", time: "21:30", homeTeam: "Group K Winner", awayTeam: "3rd Place D/E/I/J/L", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City" },
  { id: 89, stage: "round16", date: "2026-07-04", time: "13:00", homeTeam: "R32-1 Winner", awayTeam: "R32-3 Winner", venue: "NRG Stadium", city: "Houston" },
  { id: 90, stage: "round16", date: "2026-07-04", time: "17:00", homeTeam: "R32-2 Winner", awayTeam: "R32-5 Winner", venue: "Lincoln Financial Field", city: "Philadelphia" },
  { id: 91, stage: "round16", date: "2026-07-05", time: "16:00", homeTeam: "R32-4 Winner", awayTeam: "R32-6 Winner", venue: "MetLife Stadium", city: "East Rutherford" },
  { id: 92, stage: "round16", date: "2026-07-05", time: "20:00", homeTeam: "R32-7 Winner", awayTeam: "R32-8 Winner", venue: "Estadio Azteca", city: "Mexico City" },
  { id: 93, stage: "round16", date: "2026-07-06", time: "15:00", homeTeam: "R32-11 Winner", awayTeam: "R32-12 Winner", venue: "AT&T Stadium", city: "Arlington" },
  { id: 94, stage: "round16", date: "2026-07-06", time: "20:00", homeTeam: "R32-9 Winner", awayTeam: "R32-10 Winner", venue: "Lumen Field", city: "Seattle" },
  { id: 95, stage: "round16", date: "2026-07-07", time: "12:00", homeTeam: "R32-14 Winner", awayTeam: "R32-16 Winner", venue: "Mercedes-Benz Stadium", city: "Atlanta" },
  { id: 96, stage: "round16", date: "2026-07-07", time: "16:00", homeTeam: "R32-13 Winner", awayTeam: "R32-15 Winner", venue: "BC Place", city: "Vancouver" },
  { id: 97, stage: "quarter", date: "2026-07-09", time: "16:00", homeTeam: "R16-1 Winner", awayTeam: "R16-2 Winner", venue: "Gillette Stadium", city: "Foxborough" },
  { id: 98, stage: "quarter", date: "2026-07-10", time: "15:00", homeTeam: "R16-5 Winner", awayTeam: "R16-6 Winner", venue: "SoFi Stadium", city: "Inglewood" },
  { id: 99, stage: "quarter", date: "2026-07-11", time: "17:00", homeTeam: "R16-3 Winner", awayTeam: "R16-4 Winner", venue: "Hard Rock Stadium", city: "Miami Gardens" },
  { id: 100, stage: "quarter", date: "2026-07-11", time: "21:00", homeTeam: "R16-7 Winner", awayTeam: "R16-8 Winner", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City" },
  { id: 101, stage: "semi", date: "2026-07-14", time: "15:00", homeTeam: "QF-1 Winner", awayTeam: "QF-2 Winner", venue: "AT&T Stadium", city: "Arlington" },
  { id: 102, stage: "semi", date: "2026-07-15", time: "15:00", homeTeam: "QF-3 Winner", awayTeam: "QF-4 Winner", venue: "Mercedes-Benz Stadium", city: "Atlanta" },
  { id: 103, stage: "third", date: "2026-07-18", time: "17:00", homeTeam: "SF-1 Loser", awayTeam: "SF-2 Loser", venue: "Hard Rock Stadium", city: "Miami Gardens" },
  { id: 104, stage: "final", date: "2026-07-19", time: "15:00", homeTeam: "SF-1 Winner", awayTeam: "SF-2 Winner", venue: "MetLife Stadium", city: "East Rutherford" },
];
