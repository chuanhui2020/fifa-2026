import { lookupMatch } from "../../src/agents/orchestrator";
import { setKVStore } from "../../src/agents/cache";
import { setCalibrationStore } from "../../src/agents/calibration";
import type { CollectorOutput, MatchContext, PredictionLog } from "../../src/agents/types";
import type { CollectorAgent } from "../../src/agents/collectors/types";
import { eloAgent } from "../../src/agents/collectors/elo";
import { formAgent } from "../../src/agents/collectors/form";
import { marketAgent } from "../../src/agents/collectors/market";
import { squadAgent } from "../../src/agents/collectors/squad";
import { runAttribution } from "../../src/agents/attribution/agent";
import { getCached, setCache } from "../../src/agents/cache";
import { isConfirmedFixture } from "../../src/data/teams";

interface Env {
  FIFA_MATCHES: KVNamespace;
  DEEPSEEK_API_KEY: string;
  TAVILY_MONTHLY_LIMIT?: string;
  TAVILY_SAFETY_MARGIN?: string;
  ODDS_API_KEY: string;
  ADMIN_PASSWORD: string;
  ADMIN_SECRET: string;
}

async function validateAdmin(request: Request, env: { ADMIN_PASSWORD: string; ADMIN_SECRET: string }): Promise<boolean> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(env.ADMIN_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(env.ADMIN_PASSWORD));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return token === expected;
}

const collectors: CollectorAgent[] = [eloAgent, formAgent, marketAgent, squadAgent];

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!await validateAdmin(context.request, context.env)) {
    return new Response(
      JSON.stringify({ error: "未授权访问" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  process.env.DEEPSEEK_API_KEY = context.env.DEEPSEEK_API_KEY;
  process.env.ODDS_API_KEY = context.env.ODDS_API_KEY;
  if (context.env.TAVILY_MONTHLY_LIMIT) process.env.TAVILY_MONTHLY_LIMIT = context.env.TAVILY_MONTHLY_LIMIT;
  if (context.env.TAVILY_SAFETY_MARGIN) process.env.TAVILY_SAFETY_MARGIN = context.env.TAVILY_SAFETY_MARGIN;
  setKVStore(context.env.FIFA_MATCHES);
  setCalibrationStore(context.env.FIFA_MATCHES);

  let body: { matchId?: string; homeTeam?: string; awayTeam?: string; forceRefresh?: boolean };
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { matchId, homeTeam, awayTeam, forceRefresh } = body;
  if (matchId && homeTeam && awayTeam && !isConfirmedFixture(homeTeam, awayTeam)) {
    return new Response(
      JSON.stringify({ error: "对阵未确定，暂不支持预测" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!matchId || !homeTeam || !awayTeam) {
    return new Response(
      JSON.stringify({ error: "matchId, homeTeam, and awayTeam are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const matchData = lookupMatch(matchId);
  // 仅当静态赛程对阵已是真实队名时才校验。淘汰赛占位符（"Group E 2nd"）确认后，
  // 传入的是真实队名，二者本就不等——此时跳过，与 orchestrator.predict 保持一致。
  if (
    matchData &&
    isConfirmedFixture(matchData.homeTeam, matchData.awayTeam) &&
    (matchData.homeTeam !== homeTeam || matchData.awayTeam !== awayTeam)
  ) {
    return new Response(
      JSON.stringify({ error: `Team mismatch for matchId ${matchId}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const cached = forceRefresh ? null : await getCached(matchId);
  if (cached) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "complete", data: cached })}\n\n`));
        controller.close();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const context_match: MatchContext | undefined = matchData
    ? { date: matchData.date, time: matchData.time, venue: matchData.venue, city: matchData.city, stage: matchData.stage, group: matchData.group, isNeutralVenue: matchData.isNeutralVenue }
    : undefined;

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  (async () => {
    try {
      const startedAt = Date.now();
      const collectorLogs: PredictionLog["collectors"] = [];
      const validResults: CollectorOutput[] = [];
      const missingAgents: string[] = [];

      await sendEvent({ type: "start", data: { matchId, agents: collectors.map((c) => c.id) } });

      const results = await Promise.allSettled(
        collectors.map(async (agent) => {
          const agentStart = Date.now();
          try {
            const output = await agent.run(matchId, homeTeam, awayTeam, context_match, { forceRefresh: !!forceRefresh });
            const log = {
              agentId: agent.id,
              durationMs: Date.now() - agentStart,
              status: "success" as const,
              factorsCount: output.factors.length,
              sourcesCount: output.sources.length,
            };
            collectorLogs.push(log);
            await sendEvent({ type: "collector_done", data: { agentId: agent.id, status: "success", durationMs: log.durationMs, factorsCount: log.factorsCount } });
            return output;
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            const isTimeout = error.includes("timed out");
            const log = {
              agentId: agent.id,
              durationMs: Date.now() - agentStart,
              status: (isTimeout ? "timeout" : "failed") as "timeout" | "failed",
              factorsCount: 0,
              sourcesCount: 0,
              error,
            };
            collectorLogs.push(log);
            await sendEvent({ type: "collector_done", data: { agentId: agent.id, status: log.status, error } });
            throw e;
          }
        })
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled") {
          validResults.push(result.value);
        } else {
          missingAgents.push(collectors[i].id);
        }
      }

      if (validResults.length === 0) {
        await sendEvent({ type: "error", data: { error: "All collector agents failed" } });
        await writer.close();
        return;
      }

      await sendEvent({ type: "attribution_start", data: { validCollectors: validResults.length } });

      const attributionStart = Date.now();
      const prediction = await runAttribution(matchId, homeTeam, awayTeam, validResults, context_match);
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

      const finalResult = {
        ...prediction,
        sources: uniqueSources,
        missingAgents,
        log,
      };

      await setCache(matchId, finalResult);
      await sendEvent({ type: "complete", data: finalResult });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Prediction failed";
      await sendEvent({ type: "error", data: { error } });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
