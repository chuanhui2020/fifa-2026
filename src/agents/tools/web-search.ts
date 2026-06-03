import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { getSnapshot, setSnapshot, TAVILY_CACHE_TTL } from "../cache";

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
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        searchRecords.push({
          query: params.query,
          resultCount: 0,
          sourceUrls: [],
          success: false,
        });
        return {
          content: [{ type: "text", text: "Web search unavailable (no API key). You MUST set confidence to 0.2 or lower and clearly state that no real-time data was available. Do NOT invent or hallucinate data." }],
          details: { results: [] },
        };
      }

      const depth = params.search_depth || "basic";
      const cacheKey = queryCacheKey(params.query, depth);

      // Serve from the query cache when present (unless force-refresh bypasses it).
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
          searchRecords.push({
            query: params.query,
            resultCount: 0,
            sourceUrls: [],
            success: false,
          });
          return {
            content: [{ type: "text", text: `Web search failed (HTTP ${response.status}). You MUST set confidence to 0.3 or lower and note this data gap. Do NOT invent data.` }],
            details: { results: [] },
          };
        }

        const data: TavilyResponse = await response.json();
        const sourceUrls = data.results.map((r) => r.url);

        searchRecords.push({
          query: params.query,
          resultCount: data.results.length,
          sourceUrls,
          success: data.results.length > 0,
        });

        if (data.results.length === 0) {
          return {
            content: [{ type: "text", text: `Search for "${params.query}" returned no results. You MUST set confidence to 0.3 or lower and note this data gap.` }],
            details: data,
          };
        }

        // Cache only successful, non-empty responses so errors/timeouts retry next time.
        await setSnapshot("tvly", cacheKey, data, TAVILY_CACHE_TTL);

        const text = formatResults(data);
        return {
          content: [{ type: "text", text }],
          details: data,
        };
      } catch (e) {
        const isTimeout = e instanceof Error && e.name === "AbortError";
        searchRecords.push({
          query: params.query,
          resultCount: 0,
          sourceUrls: [],
          success: false,
        });
        return {
          content: [{ type: "text", text: `Web search failed (${isTimeout ? "timeout" : "network error"}). You MUST set confidence to 0.3 or lower and note this data gap. Do NOT invent data.` }],
          details: { results: [] },
        };
      }
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
