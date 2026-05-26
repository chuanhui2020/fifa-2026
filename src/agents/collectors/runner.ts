import { Agent } from "@earendil-works/pi-agent-core";
import type { CollectorOutput } from "../types";
import { getFlashModel, getApiKey } from "../llm";
import { loadPrompt } from "../prompts/loader";
import { webSearchTool } from "../tools/web-search";

export async function runCollectorAgent(
  agentId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  userPromptFile: string,
  defaultConfidence: number
): Promise<CollectorOutput> {
  const model = getFlashModel();
  const systemPrompt = loadPrompt(`${agentId}.system.md`);
  const userPrompt = loadPrompt(userPromptFile, { homeTeam, awayTeam });

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      messages: [],
      tools: [webSearchTool],
    },
    getApiKey: () => getApiKey(),
  });

  await agent.prompt(userPrompt);
  await agent.waitForIdle();

  const lastMessage = agent.state.messages[agent.state.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "assistant") {
    throw new Error(`${agentId}Agent: no assistant response`);
  }

  const textContent = lastMessage.content.find((c: any) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error(`${agentId}Agent: empty response`);
  }

  const parsed = JSON.parse(textContent.text);

  return {
    agentId,
    matchId,
    timestamp: Date.now(),
    confidence: parsed.confidence ?? defaultConfidence,
    factors: parsed.factors ?? [],
    sources: parsed.sources ?? [],
  };
}
