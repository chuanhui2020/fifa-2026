import type { CollectorOutput, PredictionResult } from "./types";
import type { CollectorAgent } from "./collectors/types";
import { eloAgent } from "./collectors/elo";
import { formAgent } from "./collectors/form";
import { marketAgent } from "./collectors/market";
import { squadAgent } from "./collectors/squad";
import { runAttribution } from "./attribution/agent";
import { getCached, setCache } from "./cache";

const collectors: CollectorAgent[] = [eloAgent, formAgent, marketAgent, squadAgent];

export async function predict(
  matchId: string,
  homeTeam: string,
  awayTeam: string
): Promise<PredictionResult> {
  const cached = await getCached(matchId);
  if (cached) return cached;

  const results = await Promise.allSettled(
    collectors.map((agent) => agent.run(matchId, homeTeam, awayTeam))
  );

  const validResults: CollectorOutput[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      validResults.push(result.value);
    }
  }

  if (validResults.length === 0) {
    throw new Error("All collector agents failed");
  }

  const prediction = await runAttribution(matchId, homeTeam, awayTeam, validResults);
  await setCache(matchId, prediction);
  return prediction;
}
