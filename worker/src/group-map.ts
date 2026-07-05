export const GROUP_MAP: Record<string, string> = {
  "Mexico": "A",
  "South Africa": "A",
  "South Korea": "A",
  "Korea Republic": "A",
  "Czechia": "A",
  "Czech Republic": "A",
  "Canada": "B",
  "Bosnia and Herzegovina": "B",
  "Bosnia & Herzegovina": "B",
  "Qatar": "B",
  "Switzerland": "B",
  "Brazil": "C",
  "Morocco": "C",
  "Haiti": "C",
  "Scotland": "C",
  "United States": "D",
  "USA": "D",
  "Paraguay": "D",
  "Australia": "D",
  "Türkiye": "D",
  "Turkey": "D",
  "Germany": "E",
  "Curacao": "E",
  "Curaçao": "E",
  "Ivory Coast": "E",
  "Côte d'Ivoire": "E",
  "Ecuador": "E",
  "Netherlands": "F",
  "Japan": "F",
  "Sweden": "F",
  "Tunisia": "F",
  "Spain": "G",
  "Cape Verde": "G",
  "Cabo Verde": "G",
  "Saudi Arabia": "G",
  "Uruguay": "G",
  "Belgium": "H",
  "Egypt": "H",
  "Iran": "H",
  "New Zealand": "H",
  "France": "I",
  "Senegal": "I",
  "Iraq": "I",
  "Norway": "I",
  "Argentina": "J",
  "Algeria": "J",
  "Austria": "J",
  "Jordan": "J",
  "Portugal": "K",
  "Congo DR": "K",
  "DR Congo": "K",
  "Uzbekistan": "K",
  "Colombia": "K",
  "England": "L",
  "Croatia": "L",
  "Ghana": "L",
  "Panama": "L",
};

export const TEAM_NAME_NORMALIZE: Record<string, string> = {
  "Korea Republic": "South Korea",
  "Czech Republic": "Czechia",
  "Bosnia & Herzegovina": "Bosnia and Herzegovina",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "USA": "United States",
  "Turkey": "Türkiye",
  "Curaçao": "Curacao",
  "Côte d'Ivoire": "Ivory Coast",
  "Cabo Verde": "Cape Verde",
  "DR Congo": "Congo DR",
};

export function normalizeTeamName(name: string): string {
  return TEAM_NAME_NORMALIZE[name] || name;
}

/**
 * 是否为已确认的真实球队（在 48 强表内）。GROUP_MAP 覆盖全部 48 队（含常见别名），
 * 淘汰赛占位名（"R32-9 Winner"、"Round of 16 5 Winner"、"3rd Place A/B/C/D/F"、
 * "Group A Winner" 等）都不在其中。用于淘汰赛合并的「真实队名门槛」：ESPN 尚未定队的
 * provisional 占位场次不参与合并，避免把种子固定槽位拖走或凭空重复。
 */
export function isRealTeamName(name: string): boolean {
  return name in GROUP_MAP || normalizeTeamName(name) in GROUP_MAP;
}

/**
 * 场馆名归一化：ESPN 会用商业冠名（如阿兹特克世界杯期间冠名 "Estadio Banorte"），
 * 而静态赛程/占位对阵用通用名（"Estadio Azteca"）。淘汰赛占位对阵没有真实队名，
 * mergeMatches 只能靠 stage+date+venue 兜底命中——venue 对不上就会把同一场比赛
 * 当成「新场次」重复插入，占位行永不被真实对阵覆盖。统一到规范名后才能命中。
 * 键取归一化形式（去标点/小写）以容忍 ESPN 拼写抖动。
 */
const VENUE_NAME_NORMALIZE: Record<string, string> = {
  "estadio banorte": "Estadio Azteca",
  "estadio ciudad de mexico": "Estadio Azteca",
};

function venueKey(name: string): string {
  return name.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeVenueName(name: string): string {
  if (!name) return name;
  return VENUE_NAME_NORMALIZE[venueKey(name)] || name;
}

export function getGroup(teamName: string): string | undefined {
  return GROUP_MAP[teamName] || GROUP_MAP[normalizeTeamName(teamName)];
}
