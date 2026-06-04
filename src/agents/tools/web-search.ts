import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { getSnapshot, setSnapshot, TAVILY_CACHE_TTL } from "../cache";
import {
  acquireKey,
  poolSize,
  reportSuccess,
  reportExhausted,
  reportTransient,
  isMonthlyExhaustion,
} from "./tavily-pool";

const WebSearchParams = Type.Object({
  query: Type.String({ description: "The search query to find relevant information" }),
  search_depth: Type.Optional(
    Type.Union([Type.Literal("basic"), Type.Literal("advanced")], {
      description: "Search depth: 'basic' for quick results, 'advanced' for detailed content",
    })
  ),
  max_results: Type.Optional(
    Type.Number({ description: "Maximum number of results to return (1-10)", minimum: 1, maximum: 10 })
  ),
});

type WebSearchParamsType = Static<typeof WebSearchParams>;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export interface SearchRecord {
  query: string;
  resultCount: number;
  sourceUrls: string[];
  success: boolean;
  /** True when the result was served from the query-level cache (no Tavily call). */
  cached?: boolean;
}

let searchRecords: SearchRecord[] = [];

export function getSearchRecords(): SearchRecord[] {
  return searchRecords;
}

export function resetSearchRecords(): void {
  searchRecords = [];
}

const SEARCH_TIMEOUT_MS = 10_000;

export interface WebSearchOptions {
  /** When true, skip the query-cache read (still writes fresh results). Used by admin force-refresh. */
  bypassCache?: boolean;
}

/** Normalize a query into a stable cache key: lowercase, trimmed, whitespace-collapsed, plus depth. */
function queryCacheKey(query: string, depth: string): string {
  const norm = query.toLowerCase().trim().replace(/\s+/g, " ");
  return `${depth}:${norm}`;
}

/**
 * Build a web_search tool. The result is cached at the query level (KV-backed via
 * the shared snapshot cache) so the same query — e.g. a team's recent form, reused
 * across every match that team plays and across re-predictions — only hits Tavily
 * once per TTL window. `opts.bypassCache` skips the read for admin force-refresh
 * while still refreshing the cache for subsequent normal predictions.
 */
export function createWebSearchTool(
  opts: WebSearchOptions = {}
): AgentTool<typeof WebSearchParams> {
  return {
    name: "web_search",
    description:
      "Search the web for current information. Use this to find real-time data like team rankings, recent match results, betting odds, injury reports, and other up-to-date football information. If search fails or returns no results, you MUST report lower confidence and note the data gap in your response.",
    parameters: WebSearchParams,
    label: "Web Search",

    async execute(
      _toolCallId: string,
      params: WebSearchParamsType
    ): Promise<AgentToolResult<TavilyResponse>> {
      const depth = params.search_depth || "basic";
      const cacheKey = queryCacheKey(params.query, depth);

      // 1) 查询级缓存优先(命中不消耗任何账号)。
      if (!opts.bypassCache) {
        const hit = await getSnapshot<TavilyResponse>("tvly", cacheKey);
        if (hit && hit.results.length > 0) {
          searchRecords.push({
            query: params.query,
            resultCount: hit.results.length,
            sourceUrls: hit.results.map((r) => r.url),
            success: true,
            cached: true,
          });
          return { content: [{ type: "text", text: formatResults(hit) }], details: hit };
        }
      }

      // 2) 号池为空 → 报数据缺口。
      const size = await poolSize();
      if (size === 0) {
        searchRecords.push({ query: params.query, resultCount: 0, sourceUrls: [], success: false });
        return {
          content: [{ type: "text", text: "Web search unavailable (no API key). You MUST set confidence to 0.2 or lower and clearly state that no real-time data was available. Do NOT invent or hallucinate data." }],
          details: { results: [] },
        };
      }

      // 3) 跨账号失败转移:逐号尝试,瞬时失败/限流换号,月度耗尽剔除后换号。
      const maxAttempts = Math.min(size, 3);
      const tried = new Set<string>();
      let acquiredAny = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const acq = await acquireKey(tried);
        if (!acq) break;
        acquiredAny = true;
        tried.add(acq.keyId);
        const { keyId, apiKey } = acq;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

          const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: apiKey,
              query: params.query,
              search_depth: depth,
              max_results: params.max_results || 5,
              include_answer: true,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            // 429 + 额度关键字 → 月度耗尽,剔除该号;其余(含瞬时限流)只记失败。两种都换号重试。
            if (response.status === 429 && isMonthlyExhaustion(bodyText)) {
              await reportExhausted(keyId, "HTTP 429 额度耗尽");
            } else {
              await reportTransient(keyId, `HTTP ${response.status}`);
            }
            continue;
          }

          const data: TavilyResponse = await response.json();

          // 调用成功即消耗一次额度(即便 0 结果)。
          await reportSuccess(keyId);

          searchRecords.push({
            query: params.query,
            resultCount: data.results.length,
            sourceUrls: data.results.map((r) => r.url),
            success: data.results.length > 0,
          });

          if (data.results.length === 0) {
            return {
              content: [{ type: "text", text: `Search for "${params.query}" returned no results. You MUST set confidence to 0.3 or lower and note this data gap.` }],
              details: data,
            };
          }

          // 仅成功且非空才写查询缓存。
          await setSnapshot("tvly", cacheKey, data, TAVILY_CACHE_TTL);
          return { content: [{ type: "text", text: formatResults(data) }], details: data };
        } catch (e) {
          const isTimeout = e instanceof Error && e.name === "AbortError";
          await reportTransient(keyId, isTimeout ? "timeout" : "network error");
          continue;
        }
      }

      // 4) 全部尝试失败。
      searchRecords.push({ query: params.query, resultCount: 0, sourceUrls: [], success: false });
      return {
        content: [{
          type: "text",
          text: !acquiredAny
            ? "所有 Tavily 账号本月额度已用尽，暂时无法搜索。You MUST set confidence to 0.2 or lower and clearly state no real-time data was available. Do NOT invent data."
            : "Web search failed after retrying across accounts. You MUST set confidence to 0.3 or lower and note this data gap. Do NOT invent data.",
        }],
        details: { results: [] },
      };
    },
  };
}

/** Default shared instance (cache-enabled). Per-run instances use createWebSearchTool. */
export const webSearchTool: AgentTool<typeof WebSearchParams> = createWebSearchTool();

function formatResults(data: TavilyResponse): string {
  let output = "";

  if (data.answer) {
    output += `Summary: ${data.answer}\n\n`;
  }

  output += "Sources:\n";
  for (const result of data.results) {
    output += `\n[${result.title}](${result.url})\n${result.content}\n`;
  }

  return output;
}
