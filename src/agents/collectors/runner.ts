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

/**
 * 每个采集器的确定性搜索查询（覆盖双方一次搜完）。
 * 过去由模型自己发 web_search 工具调用 → 需要两次 LLM 往返（先出工具调用、再消费结果出 JSON）。
 * 现在我们直接用固定 query 搜一次、把结果内联进 prompt，单次无工具补全即可，省掉一次往返 + 工具 schema 开销。
 * 查询模板沿用各 system prompt 此前建议的写法。
 */
const SEARCH_QUERY: Record<string, (home: string, away: string) => string> = {
  form: (h, a) => `${h} ${a} recent results form last 5 matches 2026`,
  squad: (h, a) => `${h} ${a} injuries suspensions squad news World Cup 2026`,
  elo: (h, a) => `${h} ${a} FIFA ranking Elo rating 2026`,
  market: (h, a) => `${h} vs ${a} betting odds World Cup 2026`,
};

function buildSearchQuery(agentId: string, home: string, away: string): string {
  const fn = SEARCH_QUERY[agentId];
  return fn ? fn(home, away) : `${home} vs ${away} World Cup 2026`;
}

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

  // 1) 先用确定性 query 调一次搜索。execute() 内部仍走查询级缓存 + 号池 + 失败容错，
  //    返回的文本（命中时含来源 URL，失败时含「降置信度」提示）直接内联给模型。
  const webSearch = createWebSearchTool({ bypassCache: opts?.forceRefresh });
  const query = buildSearchQuery(agentId, homeTeam, awayTeam);
  const searchResult = await webSearch.execute(`${agentId}-search`, { query });
  const searchText =
    searchResult.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";

  // 2) 把搜索结果接到用户消息末尾，单次无工具补全出 JSON（只一次 LLM 往返）。
  const augmentedPrompt =
    `${userPrompt}\n\n---\nWeb search results for "${query}":\n${searchText || "(no results)"}`;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      messages: [],
    },
    getApiKey: () => getApiKey(),
  });

  await agent.prompt(augmentedPrompt);
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
