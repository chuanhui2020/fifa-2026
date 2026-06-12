export type MatchStatus = "upcoming" | "live" | "finished";
export type MatchStage = "group" | "round32" | "round16" | "quarter" | "semi" | "third" | "final";

export interface Match {
  id: number;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  group?: string;
  stage: MatchStage;
  venue: string;
  city: string;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
}

export const matches: Match[] = [
  // === MATCHDAY 1 (Jun 11-17) ===
  // Group A
  { id: 1, date: "2026-06-11", time: "15:00", homeTeam: "Mexico", awayTeam: "South Africa", group: "A", stage: "group", venue: "Estadio Azteca", city: "Mexico City", status: "upcoming" },
  { id: 2, date: "2026-06-11", time: "22:00", homeTeam: "South Korea", awayTeam: "Czechia", group: "A", stage: "group", venue: "Estadio Akron", city: "Guadalajara", status: "upcoming" },
  // Group B
  { id: 3, date: "2026-06-12", time: "15:00", homeTeam: "Canada", awayTeam: "Bosnia and Herzegovina", group: "B", stage: "group", venue: "BMO Field", city: "Toronto", status: "upcoming" },
  { id: 4, date: "2026-06-13", time: "15:00", homeTeam: "Qatar", awayTeam: "Switzerland", group: "B", stage: "group", venue: "Levi's Stadium", city: "Santa Clara", status: "upcoming" },
  // Group C
  { id: 5, date: "2026-06-13", time: "18:00", homeTeam: "Brazil", awayTeam: "Morocco", group: "C", stage: "group", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  { id: 6, date: "2026-06-13", time: "21:00", homeTeam: "Haiti", awayTeam: "Scotland", group: "C", stage: "group", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  // Group D
  { id: 7, date: "2026-06-12", time: "21:00", homeTeam: "United States", awayTeam: "Paraguay", group: "D", stage: "group", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  { id: 8, date: "2026-06-14", time: "00:00", homeTeam: "Australia", awayTeam: "Türkiye", group: "D", stage: "group", venue: "BC Place", city: "Vancouver", status: "upcoming" },
  // Group E
  { id: 9, date: "2026-06-14", time: "13:00", homeTeam: "Germany", awayTeam: "Curacao", group: "E", stage: "group", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 10, date: "2026-06-14", time: "19:00", homeTeam: "Ivory Coast", awayTeam: "Ecuador", group: "E", stage: "group", venue: "Lincoln Financial Field", city: "Philadelphia", status: "upcoming" },
  // Group F
  { id: 11, date: "2026-06-14", time: "16:00", homeTeam: "Netherlands", awayTeam: "Japan", group: "F", stage: "group", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 12, date: "2026-06-14", time: "22:00", homeTeam: "Sweden", awayTeam: "Tunisia", group: "F", stage: "group", venue: "Estadio BBVA", city: "Monterrey", status: "upcoming" },
  // Group G
  { id: 13, date: "2026-06-15", time: "12:00", homeTeam: "Spain", awayTeam: "Cape Verde", group: "G", stage: "group", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  { id: 14, date: "2026-06-15", time: "18:00", homeTeam: "Saudi Arabia", awayTeam: "Uruguay", group: "G", stage: "group", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },
  // Group H
  { id: 15, date: "2026-06-15", time: "15:00", homeTeam: "Belgium", awayTeam: "Egypt", group: "H", stage: "group", venue: "Lumen Field", city: "Seattle", status: "upcoming" },
  { id: 16, date: "2026-06-15", time: "21:00", homeTeam: "Iran", awayTeam: "New Zealand", group: "H", stage: "group", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  // Group I
  { id: 17, date: "2026-06-16", time: "15:00", homeTeam: "France", awayTeam: "Senegal", group: "I", stage: "group", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  { id: 18, date: "2026-06-16", time: "18:00", homeTeam: "Iraq", awayTeam: "Norway", group: "I", stage: "group", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  // Group J
  { id: 19, date: "2026-06-16", time: "21:00", homeTeam: "Argentina", awayTeam: "Algeria", group: "J", stage: "group", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City", status: "upcoming" },
  { id: 20, date: "2026-06-17", time: "00:00", homeTeam: "Austria", awayTeam: "Jordan", group: "J", stage: "group", venue: "Levi's Stadium", city: "Santa Clara", status: "upcoming" },
  // Group K
  { id: 21, date: "2026-06-17", time: "13:00", homeTeam: "Portugal", awayTeam: "Congo DR", group: "K", stage: "group", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 22, date: "2026-06-17", time: "19:00", homeTeam: "Ghana", awayTeam: "Panama", group: "K", stage: "group", venue: "BMO Field", city: "Toronto", status: "upcoming" },
  // Group L
  { id: 23, date: "2026-06-17", time: "16:00", homeTeam: "England", awayTeam: "Croatia", group: "L", stage: "group", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 24, date: "2026-06-17", time: "22:00", homeTeam: "Uzbekistan", awayTeam: "Colombia", group: "L", stage: "group", venue: "Estadio Azteca", city: "Mexico City", status: "upcoming" },
  // === MATCHDAY 2 (Jun 18-23) ===
  // Group A
  { id: 25, date: "2026-06-18", time: "12:00", homeTeam: "Czechia", awayTeam: "South Africa", group: "A", stage: "group", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  { id: 26, date: "2026-06-18", time: "21:00", homeTeam: "Mexico", awayTeam: "South Korea", group: "A", stage: "group", venue: "Estadio Akron", city: "Guadalajara", status: "upcoming" },
  // Group B
  { id: 27, date: "2026-06-18", time: "15:00", homeTeam: "Switzerland", awayTeam: "Bosnia and Herzegovina", group: "B", stage: "group", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  { id: 28, date: "2026-06-18", time: "18:00", homeTeam: "Canada", awayTeam: "Qatar", group: "B", stage: "group", venue: "BC Place", city: "Vancouver", status: "upcoming" },
  // Group C
  { id: 29, date: "2026-06-19", time: "18:00", homeTeam: "Scotland", awayTeam: "Morocco", group: "C", stage: "group", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  { id: 30, date: "2026-06-19", time: "20:30", homeTeam: "Brazil", awayTeam: "Haiti", group: "C", stage: "group", venue: "Lincoln Financial Field", city: "Philadelphia", status: "upcoming" },
  // Group D
  { id: 31, date: "2026-06-19", time: "15:00", homeTeam: "United States", awayTeam: "Australia", group: "D", stage: "group", venue: "Lumen Field", city: "Seattle", status: "upcoming" },
  { id: 32, date: "2026-06-19", time: "23:00", homeTeam: "Türkiye", awayTeam: "Paraguay", group: "D", stage: "group", venue: "Levi's Stadium", city: "Santa Clara", status: "upcoming" },
  // Group E
  { id: 33, date: "2026-06-20", time: "13:00", homeTeam: "Netherlands", awayTeam: "Sweden", group: "F", stage: "group", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 34, date: "2026-06-20", time: "16:00", homeTeam: "Germany", awayTeam: "Ivory Coast", group: "E", stage: "group", venue: "BMO Field", city: "Toronto", status: "upcoming" },
  { id: 35, date: "2026-06-20", time: "20:00", homeTeam: "Ecuador", awayTeam: "Curacao", group: "E", stage: "group", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City", status: "upcoming" },
  // Group F
  { id: 36, date: "2026-06-21", time: "00:00", homeTeam: "Tunisia", awayTeam: "Japan", group: "F", stage: "group", venue: "Estadio BBVA", city: "Monterrey", status: "upcoming" },
  // Group G
  { id: 37, date: "2026-06-21", time: "12:00", homeTeam: "Spain", awayTeam: "Saudi Arabia", group: "G", stage: "group", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  { id: 38, date: "2026-06-21", time: "18:00", homeTeam: "Uruguay", awayTeam: "Cape Verde", group: "G", stage: "group", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },
  // Group H
  { id: 39, date: "2026-06-21", time: "15:00", homeTeam: "Belgium", awayTeam: "Iran", group: "H", stage: "group", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  { id: 40, date: "2026-06-21", time: "21:00", homeTeam: "New Zealand", awayTeam: "Egypt", group: "H", stage: "group", venue: "BC Place", city: "Vancouver", status: "upcoming" },
  // Group I
  { id: 41, date: "2026-06-22", time: "17:00", homeTeam: "France", awayTeam: "Iraq", group: "I", stage: "group", venue: "Lincoln Financial Field", city: "Philadelphia", status: "upcoming" },
  { id: 42, date: "2026-06-22", time: "20:00", homeTeam: "Norway", awayTeam: "Senegal", group: "I", stage: "group", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  // Group J
  { id: 43, date: "2026-06-22", time: "13:00", homeTeam: "Argentina", awayTeam: "Austria", group: "J", stage: "group", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 44, date: "2026-06-22", time: "23:00", homeTeam: "Jordan", awayTeam: "Algeria", group: "J", stage: "group", venue: "Levi's Stadium", city: "Santa Clara", status: "upcoming" },
  // Group K
  { id: 45, date: "2026-06-23", time: "13:00", homeTeam: "Portugal", awayTeam: "Uzbekistan", group: "K", stage: "group", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 46, date: "2026-06-23", time: "16:00", homeTeam: "England", awayTeam: "Ghana", group: "L", stage: "group", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  // Group L
  { id: 47, date: "2026-06-23", time: "19:00", homeTeam: "Panama", awayTeam: "Croatia", group: "K", stage: "group", venue: "BMO Field", city: "Toronto", status: "upcoming" },
  { id: 48, date: "2026-06-23", time: "22:00", homeTeam: "Colombia", awayTeam: "Congo DR", group: "L", stage: "group", venue: "Estadio Akron", city: "Guadalajara", status: "upcoming" },
  // === MATCHDAY 3 (Jun 24-27) ===
  // Group A
  { id: 49, date: "2026-06-24", time: "21:00", homeTeam: "Czechia", awayTeam: "Mexico", group: "A", stage: "group", venue: "Estadio Azteca", city: "Mexico City", status: "upcoming" },
  { id: 50, date: "2026-06-24", time: "21:00", homeTeam: "South Africa", awayTeam: "South Korea", group: "A", stage: "group", venue: "Estadio BBVA", city: "Monterrey", status: "upcoming" },
  // Group B
  { id: 51, date: "2026-06-24", time: "15:00", homeTeam: "Bosnia and Herzegovina", awayTeam: "Qatar", group: "B", stage: "group", venue: "Lumen Field", city: "Seattle", status: "upcoming" },
  { id: 52, date: "2026-06-24", time: "15:00", homeTeam: "Switzerland", awayTeam: "Canada", group: "B", stage: "group", venue: "BC Place", city: "Vancouver", status: "upcoming" },
  // Group C
  { id: 53, date: "2026-06-24", time: "18:00", homeTeam: "Morocco", awayTeam: "Haiti", group: "C", stage: "group", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  { id: 54, date: "2026-06-24", time: "18:00", homeTeam: "Scotland", awayTeam: "Brazil", group: "C", stage: "group", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },
  // Group D
  { id: 55, date: "2026-06-25", time: "22:00", homeTeam: "Paraguay", awayTeam: "Australia", group: "D", stage: "group", venue: "Levi's Stadium", city: "Santa Clara", status: "upcoming" },
  { id: 56, date: "2026-06-25", time: "22:00", homeTeam: "Türkiye", awayTeam: "United States", group: "D", stage: "group", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  // Group E
  { id: 57, date: "2026-06-25", time: "16:00", homeTeam: "Curacao", awayTeam: "Ivory Coast", group: "E", stage: "group", venue: "Lincoln Financial Field", city: "Philadelphia", status: "upcoming" },
  { id: 58, date: "2026-06-25", time: "16:00", homeTeam: "Ecuador", awayTeam: "Germany", group: "E", stage: "group", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  // Group F
  { id: 59, date: "2026-06-25", time: "19:00", homeTeam: "Japan", awayTeam: "Sweden", group: "F", stage: "group", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 60, date: "2026-06-25", time: "19:00", homeTeam: "Tunisia", awayTeam: "Netherlands", group: "F", stage: "group", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City", status: "upcoming" },
  // Group G
  { id: 61, date: "2026-06-26", time: "20:00", homeTeam: "Cape Verde", awayTeam: "Saudi Arabia", group: "G", stage: "group", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 62, date: "2026-06-26", time: "20:00", homeTeam: "Uruguay", awayTeam: "Spain", group: "G", stage: "group", venue: "Estadio Akron", city: "Guadalajara", status: "upcoming" },
  // Group H
  { id: 63, date: "2026-06-26", time: "23:00", homeTeam: "Egypt", awayTeam: "Iran", group: "H", stage: "group", venue: "Lumen Field", city: "Seattle", status: "upcoming" },
  { id: 64, date: "2026-06-26", time: "23:00", homeTeam: "New Zealand", awayTeam: "Belgium", group: "H", stage: "group", venue: "BC Place", city: "Vancouver", status: "upcoming" },
  // Group I
  { id: 65, date: "2026-06-26", time: "15:00", homeTeam: "Norway", awayTeam: "France", group: "I", stage: "group", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  { id: 66, date: "2026-06-26", time: "15:00", homeTeam: "Senegal", awayTeam: "Iraq", group: "I", stage: "group", venue: "BMO Field", city: "Toronto", status: "upcoming" },
  // Group J
  { id: 67, date: "2026-06-27", time: "22:00", homeTeam: "Algeria", awayTeam: "Austria", group: "J", stage: "group", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City", status: "upcoming" },
  { id: 68, date: "2026-06-27", time: "22:00", homeTeam: "Jordan", awayTeam: "Argentina", group: "J", stage: "group", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  // Group K
  { id: 69, date: "2026-06-27", time: "17:00", homeTeam: "Croatia", awayTeam: "Ghana", group: "K", stage: "group", venue: "Lincoln Financial Field", city: "Philadelphia", status: "upcoming" },
  { id: 70, date: "2026-06-27", time: "17:00", homeTeam: "Panama", awayTeam: "England", group: "K", stage: "group", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  // Group L
  { id: 71, date: "2026-06-27", time: "19:30", homeTeam: "Colombia", awayTeam: "Portugal", group: "L", stage: "group", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },
  { id: 72, date: "2026-06-27", time: "19:30", homeTeam: "Congo DR", awayTeam: "Uzbekistan", group: "L", stage: "group", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  // === ROUND OF 32 (Jun 28 - Jul 3) ===
  { id: 73, date: "2026-06-28", time: "15:00", homeTeam: "Group A 2nd", awayTeam: "Group B 2nd", stage: "round32", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  { id: 74, date: "2026-06-29", time: "13:00", homeTeam: "Group C Winner", awayTeam: "Group F 2nd", stage: "round32", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 75, date: "2026-06-29", time: "16:30", homeTeam: "Group E Winner", awayTeam: "3rd Place A/B/C/D/F", stage: "round32", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  { id: 76, date: "2026-06-29", time: "21:00", homeTeam: "Group F Winner", awayTeam: "Group C 2nd", stage: "round32", venue: "Estadio BBVA", city: "Monterrey", status: "upcoming" },
  { id: 77, date: "2026-06-30", time: "13:00", homeTeam: "Group E 2nd", awayTeam: "Group I 2nd", stage: "round32", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 78, date: "2026-06-30", time: "17:00", homeTeam: "Group I Winner", awayTeam: "3rd Place C/D/F/G/H", stage: "round32", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  { id: 79, date: "2026-06-30", time: "21:00", homeTeam: "Group A Winner", awayTeam: "3rd Place C/E/F/H/I", stage: "round32", venue: "Estadio Azteca", city: "Mexico City", status: "upcoming" },
  { id: 80, date: "2026-07-01", time: "12:00", homeTeam: "Group L Winner", awayTeam: "3rd Place E/H/I/J/K", stage: "round32", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  { id: 81, date: "2026-07-01", time: "16:00", homeTeam: "Group G Winner", awayTeam: "3rd Place A/E/H/I/J", stage: "round32", venue: "Lumen Field", city: "Seattle", status: "upcoming" },
  { id: 82, date: "2026-07-01", time: "20:00", homeTeam: "Group D Winner", awayTeam: "3rd Place B/E/F/I/J", stage: "round32", venue: "Levi's Stadium", city: "Santa Clara", status: "upcoming" },
  { id: 83, date: "2026-07-02", time: "15:00", homeTeam: "Group H Winner", awayTeam: "Group J 2nd", stage: "round32", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  { id: 84, date: "2026-07-02", time: "19:00", homeTeam: "Group K 2nd", awayTeam: "Group L 2nd", stage: "round32", venue: "BMO Field", city: "Toronto", status: "upcoming" },
  { id: 85, date: "2026-07-02", time: "23:00", homeTeam: "Group B Winner", awayTeam: "3rd Place E/F/G/I/J", stage: "round32", venue: "BC Place", city: "Vancouver", status: "upcoming" },
  { id: 86, date: "2026-07-03", time: "14:00", homeTeam: "Group D 2nd", awayTeam: "Group G 2nd", stage: "round32", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 87, date: "2026-07-03", time: "18:00", homeTeam: "Group J Winner", awayTeam: "Group H 2nd", stage: "round32", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },
  { id: 88, date: "2026-07-03", time: "21:30", homeTeam: "Group K Winner", awayTeam: "3rd Place D/E/I/J/L", stage: "round32", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City", status: "upcoming" },

  // === ROUND OF 16 (Jul 4-7) ===
  { id: 89, date: "2026-07-04", time: "13:00", homeTeam: "R32-1 Winner", awayTeam: "R32-3 Winner", stage: "round16", venue: "NRG Stadium", city: "Houston", status: "upcoming" },
  { id: 90, date: "2026-07-04", time: "17:00", homeTeam: "R32-2 Winner", awayTeam: "R32-5 Winner", stage: "round16", venue: "Lincoln Financial Field", city: "Philadelphia", status: "upcoming" },
  { id: 91, date: "2026-07-05", time: "16:00", homeTeam: "R32-4 Winner", awayTeam: "R32-6 Winner", stage: "round16", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
  { id: 92, date: "2026-07-05", time: "20:00", homeTeam: "R32-7 Winner", awayTeam: "R32-8 Winner", stage: "round16", venue: "Estadio Azteca", city: "Mexico City", status: "upcoming" },
  { id: 93, date: "2026-07-06", time: "15:00", homeTeam: "R32-11 Winner", awayTeam: "R32-12 Winner", stage: "round16", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 94, date: "2026-07-06", time: "20:00", homeTeam: "R32-9 Winner", awayTeam: "R32-10 Winner", stage: "round16", venue: "Lumen Field", city: "Seattle", status: "upcoming" },
  { id: 95, date: "2026-07-07", time: "12:00", homeTeam: "R32-14 Winner", awayTeam: "R32-16 Winner", stage: "round16", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },
  { id: 96, date: "2026-07-07", time: "16:00", homeTeam: "R32-13 Winner", awayTeam: "R32-15 Winner", stage: "round16", venue: "BC Place", city: "Vancouver", status: "upcoming" },

  // === QUARTERFINALS (Jul 9-11) ===
  { id: 97, date: "2026-07-09", time: "16:00", homeTeam: "R16-1 Winner", awayTeam: "R16-2 Winner", stage: "quarter", venue: "Gillette Stadium", city: "Foxborough", status: "upcoming" },
  { id: 98, date: "2026-07-10", time: "15:00", homeTeam: "R16-5 Winner", awayTeam: "R16-6 Winner", stage: "quarter", venue: "SoFi Stadium", city: "Inglewood", status: "upcoming" },
  { id: 99, date: "2026-07-11", time: "17:00", homeTeam: "R16-3 Winner", awayTeam: "R16-4 Winner", stage: "quarter", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },
  { id: 100, date: "2026-07-11", time: "21:00", homeTeam: "R16-7 Winner", awayTeam: "R16-8 Winner", stage: "quarter", venue: "GEHA Field at Arrowhead Stadium", city: "Kansas City", status: "upcoming" },

  // === SEMIFINALS (Jul 14-15) ===
  { id: 101, date: "2026-07-14", time: "15:00", homeTeam: "QF-1 Winner", awayTeam: "QF-2 Winner", stage: "semi", venue: "AT&T Stadium", city: "Arlington", status: "upcoming" },
  { id: 102, date: "2026-07-15", time: "15:00", homeTeam: "QF-3 Winner", awayTeam: "QF-4 Winner", stage: "semi", venue: "Mercedes-Benz Stadium", city: "Atlanta", status: "upcoming" },

  // === THIRD PLACE (Jul 18) ===
  { id: 103, date: "2026-07-18", time: "17:00", homeTeam: "SF-1 Loser", awayTeam: "SF-2 Loser", stage: "third", venue: "Hard Rock Stadium", city: "Miami Gardens", status: "upcoming" },

  // === FINAL (Jul 19) ===
  { id: 104, date: "2026-07-19", time: "15:00", homeTeam: "SF-1 Winner", awayTeam: "SF-2 Winner", stage: "final", venue: "MetLife Stadium", city: "East Rutherford", status: "upcoming" },
];

export const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export const stages: { key: MatchStage; label: string }[] = [
  { key: "group", label: "小组赛" },
  { key: "round32", label: "32强" },
  { key: "round16", label: "16强" },
  { key: "quarter", label: "1/4决赛" },
  { key: "semi", label: "半决赛" },
  { key: "third", label: "三四名" },
  { key: "final", label: "决赛" },
];
