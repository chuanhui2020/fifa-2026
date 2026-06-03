export const teamNames: Record<string, { cn: string; code: string }> = {
  "Mexico": { cn: "墨西哥", code: "mx" },
  "South Africa": { cn: "南非", code: "za" },
  "South Korea": { cn: "韩国", code: "kr" },
  "Czechia": { cn: "捷克", code: "cz" },
  "Canada": { cn: "加拿大", code: "ca" },
  "Bosnia and Herzegovina": { cn: "波黑", code: "ba" },
  "Qatar": { cn: "卡塔尔", code: "qa" },
  "Switzerland": { cn: "瑞士", code: "ch" },
  "Brazil": { cn: "巴西", code: "br" },
  "Morocco": { cn: "摩洛哥", code: "ma" },
  "Haiti": { cn: "海地", code: "ht" },
  "Scotland": { cn: "苏格兰", code: "gb-sct" },
  "United States": { cn: "美国", code: "us" },
  "Paraguay": { cn: "巴拉圭", code: "py" },
  "Australia": { cn: "澳大利亚", code: "au" },
  "Türkiye": { cn: "土耳其", code: "tr" },
  "Germany": { cn: "德国", code: "de" },
  "Curacao": { cn: "库拉索", code: "cw" },
  "Ivory Coast": { cn: "科特迪瓦", code: "ci" },
  "Ecuador": { cn: "厄瓜多尔", code: "ec" },
  "Netherlands": { cn: "荷兰", code: "nl" },
  "Japan": { cn: "日本", code: "jp" },
  "Sweden": { cn: "瑞典", code: "se" },
  "Tunisia": { cn: "突尼斯", code: "tn" },
  "Spain": { cn: "西班牙", code: "es" },
  "Cape Verde": { cn: "佛得角", code: "cv" },
  "Saudi Arabia": { cn: "沙特", code: "sa" },
  "Uruguay": { cn: "乌拉圭", code: "uy" },
  "Belgium": { cn: "比利时", code: "be" },
  "Egypt": { cn: "埃及", code: "eg" },
  "Iran": { cn: "伊朗", code: "ir" },
  "New Zealand": { cn: "新西兰", code: "nz" },
  "France": { cn: "法国", code: "fr" },
  "Senegal": { cn: "塞内加尔", code: "sn" },
  "Iraq": { cn: "伊拉克", code: "iq" },
  "Norway": { cn: "挪威", code: "no" },
  "Argentina": { cn: "阿根廷", code: "ar" },
  "Algeria": { cn: "阿尔及利亚", code: "dz" },
  "Austria": { cn: "奥地利", code: "at" },
  "Jordan": { cn: "约旦", code: "jo" },
  "Portugal": { cn: "葡萄牙", code: "pt" },
  "Congo DR": { cn: "刚果(金)", code: "cd" },
  "Ghana": { cn: "加纳", code: "gh" },
  "Panama": { cn: "巴拿马", code: "pa" },
  "England": { cn: "英格兰", code: "gb-eng" },
  "Croatia": { cn: "克罗地亚", code: "hr" },
  "Uzbekistan": { cn: "乌兹别克斯坦", code: "uz" },
  "Colombia": { cn: "哥伦比亚", code: "co" },
};

export function getTeamDisplay(name: string): { cn: string; code: string } {
  return teamNames[name] || { cn: name, code: "" };
}

/**
 * 是否为一支已确认的真实球队。teamNames 是 48 支参赛队的集合;淘汰赛占位名
 * （"Group A 2nd"、"R32-1 Winner"、"3rd Place A/B/C/D/F" 等）不在其中。
 */
export function isRealTeam(name: string): boolean {
  return name in teamNames;
}

/** 对阵双方是否都已确定（非占位符）。用于放行/屏蔽预测。 */
export function isConfirmedFixture(homeTeam: string, awayTeam: string): boolean {
  return isRealTeam(homeTeam) && isRealTeam(awayTeam);
}
