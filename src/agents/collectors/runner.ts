import { Agent } from "@earendil-works/pi-agent-core";
import type { CollectorOutput } from "../types";
import { isTextContent } from "../types";
import { getFlashModel, getApiKey } from "../llm";
import { loadPrompt } from "../prompts/loader";
import { createWebSearchTool } from "../tools/web-search";
import { parseLLMJson } from "../parse-json";
import { validateCollectorOutput, ValidationError } from "../validate";
import type { MatchContext } from "../types";
import type { CollectorRunOptions } from "./types";

const COLLECTOR_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 1;

// Hard cap on web_search calls per agent run. The query cache makes repeat
// searches cheap, but a cap guarantees a single Tavily hit per agent.
const MAX_SEARCHES_PER_RUN = 1;

export async function runCollectorAgent(
  agentId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  userPromptFile: string,
  defaultConfidence: number,
  context?: MatchContext,
  opts?: CollectorRunOptions
): Promise<CollectorOutput> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await runWithTimeout(
        agentId, matchId, homeTeam, awayTeam, userPromptFile, defaultConfidence, context, opts
      );
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!(e instanceof ValidationError) || attempt >= MAX_RETRIES) {
        break;
      }
    }
  }

  throw lastError || new Error(`${agentId}Agent: unknown failure`);
}

async function runWithTimeout(
  agentId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  userPromptFile: string,
  defaultConfidence: number,
  context?: MatchContext,
  opts?: CollectorRunOptions
): Promise<CollectorOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COLLECTOR_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      executeAgent(agentId, matchId, homeTeam, awayTeam, userPromptFile, defaultConfidence, context, opts),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error(`${agentId}Agent: timed out after ${COLLECTOR_TIMEOUT_MS / 1000}s`))
        );
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeAgent(
  agentId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  userPromptFile: string,
  defaultConfidence: number,
  context?: MatchContext,
  opts?: CollectorRunOptions
): Promise<CollectorOutput> {
  const model = getFlashModel();
  const systemPrompt = loadPrompt(`${agentId}.system.md`);

  const promptVars: Record<string, string> = { homeTeam, awayTeam };
  if (context) {
    promptVars.date = context.date;
    promptVars.time = context.time;
    promptVars.venue = context.venue;
    promptVars.city = context.city;
    promptVars.stage = context.stage;
    promptVars.group = context.group || "";
    promptVars.isNeutralVenue = context.isNeutralVenue ? "true" : "false";
  }

  const userPrompt = loadPrompt(userPromptFile, promptVars);

  const webSearch = createWebSearchTool({ bypassCache: opts?.forceRefresh });

  // Cap web_search to MAX_SEARCHES_PER_RUN per agent. Once exhausted, block further
  // calls and tell the model to answer from what it already gathered.
  let searchCount = 0;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      messages: [],
      tools: [webSearch],
    },
    getApiKey: () => getApiKey(),
    beforeToolCall: async ({ toolCall }) => {
      if (toolCall.name !== "web_search") return undefined;
      if (searchCount >= MAX_SEARCHES_PER_RUN) {
        return {
          block: true,
          reason: `Search limit reached (${MAX_SEARCHES_PER_RUN} per analysis). Produce your JSON answer now from the data already gathered; do not request another search.`,
        };
      }
      searchCount++;
      return undefined;
    },
  });

  await agent.prompt(userPrompt);
  await agent.waitForIdle();

  const lastMessage = agent.state.messages[agent.state.messages.length - 1];
  if (!lastMessage || lastMessage.role !== "assistant") {
    throw new Error(`${agentId}Agent: no assistant response`);
  }

  const textContent = lastMessage.content.find(isTextContent);
  if (!textContent) {
    throw new Error(`${agentId}Agent: empty response`);
  }

  const parsed = parseLLMJson(textContent.text);
  return validateCollectorOutput(parsed, agentId, matchId, defaultConfidence);
}
