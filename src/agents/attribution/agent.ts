import { Agent } from "@earendil-works/pi-agent-core";
import type { CollectorOutput, PredictionResult } from "../types";
import { getProModel, getApiKey } from "../llm";
import { loadPrompt } from "../prompts/loader";

export async function runAttribution(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  collectorResults: CollectorOutput[]
): Promise<PredictionResult> {
  const model = getProModel();
  const systemPrompt = loadPrompt("attribution.system.md");
  const userPrompt = loadPrompt("attribution.user.md", {
    homeTeam,
    awayTeam,
    matchId,
    collectorData: JSON.stringify(collectorResults, null, 2),
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

  const textContent = lastMessage.content.find((c: any) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("AttributionAgent: empty response");
  }

  const parsed = JSON.parse(textContent.text);

  return {
    matchId,
    prediction: parsed.prediction,
    attribution: parsed.attribution ?? [],
    summary: parsed.summary ?? "",
    confidence: parsed.confidence ?? 0.5,
    generatedAt: Date.now(),
  };
}
