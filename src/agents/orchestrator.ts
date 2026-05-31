import type { CollectorOutput, PredictionResult, MatchContext, PredictionLog } from "./types";
import type { CollectorAgent } from "./collectors/types";
import { eloAgent } from "./collectors/elo";
import { formAgent } from "./collectors/form";
import { marketAgent } from "./collectors/market";
import { squadAgent } from "./collectors/squad";
import { runAttribution } from "./attribution/agent";
import { getCached, setCache } from "./cache";
import { matches } from "../data/matches";
import { recordPrediction } from "./calibration";

const collectors: CollectorAgent[] = [eloAgent, formAgent, marketAgent, squadAgent];

const PREDICT_TIMEOUT_MS = 90_000;

export function lookupMatch(matchId: string): MatchContext & { homeTeam: string; awayTeam: string } | null {
  const match = matches.find((m) => String(m.id) === matchId);
  if (!match) return null;

  const hostCountries = ["United States", "Canada", "Mexico"];
  const isNeutralVenue = !hostCountries.includes(match.homeTeam) && !hostCountries.includes(match.awayTeam);

  return {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    date: match.date,
    time: match.time,
    venue: match.venue,
    city: match.city,
    stage: match.stage,
    group: match.group,
    isNeutralVenue,
  };
}

export async function predict(
  matchId: string,
  homeTeam: string,
  awayTeam: string
): Promise<PredictionResult> {
  const cached = await getCached(matchId);
  if (cached) return cached;

  const matchData = lookupMatch(matchId);
  if (matchData) {
    if (matchData.homeTeam !== homeTeam || matchData.awayTeam !== awayTeam) {
      throw new Error(
        `Team mismatch: matchId ${matchId} is ${matchData.homeTeam} vs ${matchData.awayTeam}, ` +
        `but received ${homeTeam} vs ${awayTeam}`
      );
    }
  }

  const context: MatchContext | undefined = matchData
    ? { date: matchData.date, time: matchData.time, venue: matchData.venue, city: matchData.city, stage: matchData.stage, group: matchData.group, isNeutralVenue: matchData.isNeutralVenue }
    : undefined;

  const startedAt = Date.now();

  const collectorLogs: PredictionLog["collectors"] = [];
  const validResults: CollectorOutput[] = [];
  const missingAgents: string[] = [];

  const results = await Promise.race([
    Promise.allSettled(
      collectors.map(async (agent) => {
        const agentStart = Date.now();
        try {
          const output = await agent.run(matchId, homeTeam, awayTeam, context);
          collectorLogs.push({
            agentId: agent.id,
            durationMs: Date.now() - agentStart,
            status: "success",
            factorsCount: output.factors.length,
            sourcesCount: output.sources.length,
          });
          return output;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          const isTimeout = error.includes("timed out");
          collectorLogs.push({
            agentId: agent.id,
            durationMs: Date.now() - agentStart,
            status: isTimeout ? "timeout" : "failed",
            factorsCount: 0,
            sourcesCount: 0,
            error,
          });
          throw e;
        }
      })
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Prediction timed out after ${PREDICT_TIMEOUT_MS / 1000}s`)), PREDICT_TIMEOUT_MS)
    ),
  ]);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      validResults.push(result.value);
    } else {
      missingAgents.push(collectors[i].id);
    }
  }

  if (validResults.length === 0) {
    const errors = collectorLogs.map((l) => `${l.agentId}: ${l.error || l.status}`).join("; ");
    throw new Error(`All collector agents failed: ${errors}`);
  }

  const attributionStart = Date.now();
  const prediction = await runAttribution(matchId, homeTeam, awayTeam, validResults, context);
  const attributionDurationMs = Date.now() - attributionStart;

  const allSources = validResults.flatMap((r) => r.sources);
  const uniqueSources = [...new Set(allSources)];

  const log: PredictionLog = {
    matchId,
    startedAt,
    completedAt: Date.now(),
    collectors: collectorLogs,
    attributionDurationMs,
    totalDurationMs: Date.now() - startedAt,
    validCollectorCount: validResults.length,
  };

  const finalResult: PredictionResult = {
    ...prediction,
    sources: uniqueSources,
    missingAgents,
    log,
  };

  await setCache(matchId, finalResult);
  await recordPrediction(finalResult);
  return finalResult;
}
