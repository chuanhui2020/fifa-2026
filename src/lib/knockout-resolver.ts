/**
 * 淘汰赛对阵解析器
 *
 * 根据小组赛结果自动计算排名，并将淘汰赛占位符（如 "Group A Winner"、"3rd Place A/B/C/D/F"）
 * 替换为实际晋级队伍，使对阵确认后可以进入预测流程。
 */

import { Match } from "@/data/matches";

export interface TeamStanding {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  group: string;
}

/**
 * 计算单个小组的积分榜（FIFA 世界杯规则）
 * 1. 积分（胜3平1负0）
 * 2. 净胜球
 * 3. 进球数
 * 4. 相互战绩（本实现暂不支持，需要额外比赛数据）
 * 5. 公平竞赛积分（本实现不支持）
 * 6. 抽签（本实现返回原顺序）
 */
function calculateGroupStandings(groupMatches: Match[]): TeamStanding[] {
  const standings = new Map<string, TeamStanding>();

  // 初始化所有队伍
  for (const match of groupMatches) {
    if (match.group && match.homeScore !== undefined && match.awayScore !== undefined) {
      if (!standings.has(match.homeTeam)) {
        standings.set(match.homeTeam, {
          team: match.homeTeam,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          group: match.group,
        });
      }
      if (!standings.has(match.awayTeam)) {
        standings.set(match.awayTeam, {
          team: match.awayTeam,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          group: match.group,
        });
      }
    }
  }

  // 统计比赛结果
  for (const match of groupMatches) {
    if (match.homeScore === undefined || match.awayScore === undefined) continue;
    if (match.status !== "finished") continue;

    const home = standings.get(match.homeTeam);
    const away = standings.get(match.awayTeam);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (match.homeScore < match.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  // 排序
  const sorted = Array.from(standings.values()).sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    return 0; // 相同则保持原顺序（实际应考虑相互战绩等）
  });

  return sorted;
}

/**
 * 计算所有小组的排名
 */
export function calculateAllGroupStandings(matches: Match[]): Map<string, TeamStanding[]> {
  const groups = new Set(matches.filter(m => m.group).map(m => m.group!));
  const result = new Map<string, TeamStanding[]>();

  for (const group of groups) {
    const groupMatches = matches.filter(m => m.group === group && m.stage === "group");
    result.set(group, calculateGroupStandings(groupMatches));
  }

  return result;
}

/**
 * 获取小组冠军
 */
function getGroupWinner(standings: Map<string, TeamStanding[]>, group: string): string | null {
  const standing = standings.get(group);
  if (!standing || standing.length < 1) return null;

  // 检查该组是否所有比赛都结束
  const topTeam = standing[0];
  if (topTeam.played < 3) return null; // 每队应打3场小组赛

  return topTeam.team;
}

/**
 * 获取小组第二名
 */
function getGroupSecond(standings: Map<string, TeamStanding[]>, group: string): string | null {
  const standing = standings.get(group);
  if (!standing || standing.length < 2) return null;

  const secondTeam = standing[1];
  if (secondTeam.played < 3) return null;

  return secondTeam.team;
}

/**
 * 获取指定组的第三名（用于最佳小组第三晋级规则）
 */
function getGroupThird(standings: Map<string, TeamStanding[]>, group: string): TeamStanding | null {
  const standing = standings.get(group);
  if (!standing || standing.length < 3) return null;

  const thirdTeam = standing[2];
  if (thirdTeam.played < 3) return null;

  return thirdTeam;
}

/**
 * 计算最佳小组第三名
 *
 * 2026世界杯48队，12个小组，每组4队。前2名直接晋级（24队），
 * 最佳8个小组第三也晋级，总共32队进淘汰赛。
 *
 * @param standings 所有小组排名
 * @param eligibleGroups 符合条件的小组（如 "A/B/C/D/F" 表示只从这些组选）
 * @param selectCount 需要选出几个第三名
 */
function getBestThirdPlaceTeams(
  standings: Map<string, TeamStanding[]>,
  eligibleGroups: string[],
  selectCount: number
): string[] {
  const thirdPlaceTeams: TeamStanding[] = [];

  for (const group of eligibleGroups) {
    const third = getGroupThird(standings, group);
    if (third) thirdPlaceTeams.push(third);
  }

  // 按积分、净胜球、进球数排序
  thirdPlaceTeams.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });

  return thirdPlaceTeams.slice(0, selectCount).map(t => t.team);
}

/**
 * 解析占位符名称，返回实际队名
 *
 * 支持的占位符格式：
 * - "Group A Winner" → A组第1
 * - "Group B 2nd" → B组第2
 * - "3rd Place A/B/C/D/F" → A/B/C/D/F组最佳第三（需额外上下文）
 * - "R32-1 Winner" → 32强第1场胜者（需额外上下文）
 * - "QF-2 Winner" → 1/4决赛第2场胜者（需额外上下文）
 * - "SF-1 Loser" → 半决赛第1场负者（需额外上下文）
 */
export function resolvePlaceholder(
  placeholder: string,
  standings: Map<string, TeamStanding[]>,
  knockoutResults?: Map<number, { winner: string; loser: string }>
): string | null {
  // 小组冠军：Group X Winner
  const groupWinnerMatch = placeholder.match(/^Group ([A-L]) Winner$/);
  if (groupWinnerMatch) {
    return getGroupWinner(standings, groupWinnerMatch[1]);
  }

  // 小组第二：Group X 2nd
  const groupSecondMatch = placeholder.match(/^Group ([A-L]) 2nd$/);
  if (groupSecondMatch) {
    return getGroupSecond(standings, groupSecondMatch[1]);
  }

  // 最佳小组第三：3rd Place A/B/C/D/F
  const thirdPlaceMatch = placeholder.match(/^3rd Place ([A-L/]+)$/);
  if (thirdPlaceMatch) {
    const eligibleGroups = thirdPlaceMatch[1].split("/");
    // 这个占位符需要知道是"哪一个"最佳第三，但赛程里没有标注序号
    // 暂时返回 null，需要更完整的对阵表才能确定
    const bestThirds = getBestThirdPlaceTeams(standings, eligibleGroups, eligibleGroups.length);
    // TODO: 需要根据 FIFA 规则确定具体是第几个最佳第三
    return bestThirds[0] || null;
  }

  // 淘汰赛胜者/负者：需要淘汰赛结果
  if (knockoutResults) {
    // R32-X Winner / R16-X Winner / QF-X Winner / SF-X Winner
    const winnerMatch = placeholder.match(/^(R32|R16|QF|SF)-(\d+) Winner$/);
    if (winnerMatch) {
      const matchId = parseInt(winnerMatch[2]);
      const result = knockoutResults.get(matchId);
      return result?.winner || null;
    }

    // SF-X Loser (用于三四名决赛)
    const loserMatch = placeholder.match(/^SF-(\d+) Loser$/);
    if (loserMatch) {
      const matchId = parseInt(loserMatch[1]);
      const result = knockoutResults.get(matchId);
      return result?.loser || null;
    }
  }

  return null;
}

/**
 * 检查指定小组是否所有比赛都已结束
 */
export function isGroupFinished(matches: Match[], group: string): boolean {
  const groupMatches = matches.filter(m => m.group === group && m.stage === "group");
  return groupMatches.every(m => m.status === "finished");
}

/**
 * 检查是否所有小组赛都已结束
 */
export function areAllGroupsFinished(matches: Match[]): boolean {
  const groups = Array.from(new Set(matches.filter(m => m.group).map(m => m.group!)));
  return groups.every(group => isGroupFinished(matches, group));
}

/**
 * 为单场淘汰赛比赛解析对阵
 */
export function resolveKnockoutMatch(
  match: Match,
  standings: Map<string, TeamStanding[]>,
  knockoutResults?: Map<number, { winner: string; loser: string }>
): { homeTeam: string; awayTeam: string } | null {
  const home = resolvePlaceholder(match.homeTeam, standings, knockoutResults);
  const away = resolvePlaceholder(match.awayTeam, standings, knockoutResults);

  if (!home || !away) return null;

  return { homeTeam: home, awayTeam: away };
}

/**
 * 批量解析所有待确认的淘汰赛对阵
 * 返回需要更新的比赛列表（id + 新的队名）
 */
export interface ResolvedMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  resolvedAt: string;
}

export function resolveAllKnockoutMatches(matches: Match[]): ResolvedMatch[] {
  const standings = calculateAllGroupStandings(matches);
  const resolved: ResolvedMatch[] = [];

  // 先处理32强（只依赖小组赛结果）
  const round32Matches = matches.filter(m => m.stage === "round32");
  for (const match of round32Matches) {
    const result = resolveKnockoutMatch(match, standings);
    if (result) {
      resolved.push({
        matchId: match.id,
        homeTeam: result.homeTeam,
        awayTeam: result.awayTeam,
        resolvedAt: new Date().toISOString(),
      });
    }
  }

  // TODO: 16强及以后需要依次解析（需要前一轮结果）
  // 当前先只处理32强，后续轮次在比赛结束后逐步解析

  return resolved;
}
