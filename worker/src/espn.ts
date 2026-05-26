export interface ESPNEvent {
  id: string;
  date: string;
  name: string;
  competitions: Array<{
    competitors: Array<{
      team: { displayName: string; abbreviation: string };
      homeAway: "home" | "away";
      score?: string;
      winner?: boolean;
    }>;
    venue?: {
      fullName: string;
      address?: { city: string; country?: string };
    };
    status: {
      type: {
        state: "pre" | "in" | "post";
        name: string;
        completed: boolean;
      };
      clock?: number;
      displayClock?: string;
    };
  }>;
  season?: {
    slug?: string;
  };
}

export async function fetchESPNScoreboard(date: string): Promise<ESPNEvent[]> {
  const dateParam = date.replace(/-/g, "");
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateParam}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "fifa-2026-worker/1.0" },
  });
  if (!resp.ok) {
    throw new Error(`ESPN API returned ${resp.status}`);
  }
  const data = await resp.json() as { events?: ESPNEvent[] };
  return data.events || [];
}

export async function fetchESPNMultipleDates(dates: string[]): Promise<ESPNEvent[]> {
  const results: ESPNEvent[] = [];
  for (const date of dates) {
    const events = await fetchESPNScoreboard(date);
    results.push(...events);
  }
  return results;
}
