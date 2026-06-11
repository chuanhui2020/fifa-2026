import { Agent } from "@earendil-works/pi-agent-core";
import type { CollectorOutput, PredictionResult, MatchContext } from "../types";
import { isTextContent, isKnockoutStage } from "../types";
import { getProModel, getApiKey } from "../llm";
import { loadPrompt } from "../prompts/loader";
import { parseLLMJson } from "../parse-json";
import { validatePredictionResult, ValidationError } from "../validate";
import { computeBaseProbability } from "../base-probability";

const ATTRIBUTION_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

export async function runAttribution(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  collectorResults: CollectorOutput[],
  context?: MatchContext
): Promise<PredictionResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await runWithTimeout(matchId, homeTeam, awayTeam, collectorResults, context);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!(e instanceof ValidationError) || attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  throw lastError || new Error("Attribution: unknown failure");
}

async function runWithTimeout(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  collectorResults: CollectorOutput[],
  context?: MatchContext
): Promise<PredictionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTRIBUTION_TIMEOUT_MS);

  try {
    return await Promise.race([
      executeAttribution(matchId, homeTeam, awayTeam, collectorResults, context),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`Attribution: timed out after ${ATTRIBUTION_TIMEOUT_MS / 1000}s`))
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function executeAttribution(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  collectorResults: CollectorOutput[],
  context?: MatchContext
): Promise<PredictionResult> {
  const model = getProModel();
  const systemPrompt = loadPrompt("attribution.system.md");

  const contextInfo = context
    ? `\nMatch Context:\n- Date: ${context.date} ${context.time} ET\n- Venue: ${context.venue}, ${context.city}\n- Stage: ${context.stage}${context.group ? ` (Group ${context.group})` : ""}\n- Neutral venue: ${context.isNeutralVenue ? "Yes (World Cup hosted in US/Canada/Mexico)" : "No (host nation playing)"}\n`
    : "";

  const isKnockout = context?.stage ? isKnockoutStage(context.stage) : false;

  const baseProbability = computeBaseProbability(collectorResults, context?.stage);
  const baseInfo = isKnockout
    ? `\nBase Probability (from ${baseProbability.source} data, knockout stage — no draw):\n- Home advances: ${(baseProbability.homeWin * 100).toFixed(1)}%\n- Away advances: ${(baseProbability.awayWin * 100).toFixed(1)}%\n\nThis is a knockout match — extra time and penalties decide the winner if needed. Set draw to exactly 0. You may adjust each outcome by at most ±15 percentage points. Deviations beyond this band will be clamped.\n`
    : `\nBase Probability (from ${baseProbability.source} data):\n- Home win: ${(baseProbability.homeWin * 100).toFixed(1)}%\n- Draw: ${(baseProbability.draw * 100).toFixed(1)}%\n- Away win: ${(baseProbability.awayWin * 100).toFixed(1)}%\n\nUse this as your starting point. You may adjust each outcome by at most ±15 percentage points (e.g. a 40% base allows 25%–55%) based on factors not captured in the base probability. Deviations beyond this band will be clamped, so keep within it and explain any significant adjustment.\n`;

  // 只把归因真正需要的字段喂给（最贵的）Pro 模型：每个采集器的来源、置信度、因子。
  // 剔除 matchId/timestamp（已在 prompt 头部）、sources（URL 在 orchestrator 单独汇总，归因推理用不到）、
  // impliedProbability（已通过上面的 baseInfo 提供）。再用紧凑序列化去掉缩进空白，显著省输入 token。
  const slimData = collectorResults.map((r) => ({
    agent: r.agentId,
    confidence: r.confidence,
    factors: r.factors,
  }));

  const userPrompt = loadPrompt("attribution.user.md", {
    homeTeam,
    awayTeam,
    matchId,
    collectorData: JSON.stringify(slimData),
    contextInfo: contextInfo + baseInfo,
  });

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      messages: [],
    },
    getApiKey: () => getApiKey(),
  });

  await agent.prompt(userPrompt);
  await agent.waitForIdle();

  const lastMessage = agent.state.messages[agent.state.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "assistant") {
    throw new Error("AttributionAgent: no assistant response");
  }

  const textContent = lastMessage.content.find(isTextContent);
  if (!textContent) {
    throw new Error("AttributionAgent: empty response");
  }

  const parsed = parseLLMJson(textContent.text);
  return validatePredictionResult(parsed, matchId, baseProbability);
}
