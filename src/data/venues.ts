export const venueNames: Record<string, string> = {
  "Estadio Azteca": "阿兹特克球场",
  "Estadio Akron": "阿克隆球场",
  "BMO Field": "BMO球场",
  "Levi's Stadium": "李维斯球场",
  "MetLife Stadium": "大都会人寿球场",
  "Gillette Stadium": "吉列球场",
  "SoFi Stadium": "SoFi球场",
  "BC Place": "BC体育馆",
  "NRG Stadium": "NRG球场",
  "Lincoln Financial Field": "林肯金融球场",
  "AT&T Stadium": "AT&T球场",
  "Estadio BBVA": "BBVA球场",
  "Mercedes-Benz Stadium": "梅赛德斯-奔驰球场",
  "Hard Rock Stadium": "硬石球场",
  "Lumen Field": "流明球场",
  "GEHA Field at Arrowhead Stadium": "箭头球场",
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

export function getVenueDisplay(venue: string): string {
  return venueNames[venue] || venue;
}

export function getCityDisplay(city: string): string {
  return cityNames[city] || city;
}
