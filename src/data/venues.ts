export const venueNames: Record<string, string> = {
  "Estadio Azteca": "阿兹特克体育场",
  "Estadio Akron": "阿克隆体育场",
  "BMO Field": "BMO球场",
  "Levi's Stadium": "李维斯体育场",
  "MetLife Stadium": "大都会人寿体育场",
  "Gillette Stadium": "吉列体育场",
  "SoFi Stadium": "SoFi体育场",
  "BC Place": "BC体育馆",
  "NRG Stadium": "NRG体育场",
  "Lincoln Financial Field": "林肯金融球场",
  "AT&T Stadium": "AT&T体育场",
  "Estadio BBVA": "BBVA体育场",
  "Mercedes-Benz Stadium": "梅赛德斯-奔驰体育场",
  "Hard Rock Stadium": "硬石体育场",
  "Lumen Field": "流明球场",
  "GEHA Field at Arrowhead Stadium": "箭头体育场",
};

export const cityNames: Record<string, string> = {
  "Mexico City": "墨西哥城",
  "Guadalajara": "瓜达拉哈拉",
  "Toronto": "多伦多",
  "Santa Clara": "圣克拉拉",
  "East Rutherford": "东卢瑟福",
  "Foxborough": "福克斯堡",
  "Inglewood": "英格尔伍德",
  "Vancouver": "温哥华",
  "Houston": "休斯顿",
  "Philadelphia": "费城",
  "Arlington": "阿灵顿",
  "Monterrey": "蒙特雷",
  "Atlanta": "亚特兰大",
  "Miami Gardens": "迈阿密花园",
  "Seattle": "西雅图",
  "Kansas City": "堪萨斯城",
};

const cityCountry: Record<string, string> = {
  "Mexico City": "墨西哥",
  "Guadalajara": "墨西哥",
  "Monterrey": "墨西哥",
  "Toronto": "加拿大",
  "Vancouver": "加拿大",
  "Santa Clara": "美国",
  "East Rutherford": "美国",
  "Foxborough": "美国",
  "Inglewood": "美国",
  "Houston": "美国",
  "Philadelphia": "美国",
  "Arlington": "美国",
  "Atlanta": "美国",
  "Miami Gardens": "美国",
  "Seattle": "美国",
  "Kansas City": "美国",
};

export function getVenueDisplay(venue: string): string {
  return venueNames[venue] || venue;
}

export function getCityDisplay(city: string): string {
  // ESPN 实时数据的 city 可能带州/省，如 "Inglewood, California"；取逗号前的主体
  // 再查表，回退也用规整后的主体，避免英文州名外溢成「非中文」显示。
  const key = city.split(",")[0].trim();
  const name = cityNames[key] || key;
  const country = cityCountry[key];
  return country ? `${name}, ${country}` : name;
}
