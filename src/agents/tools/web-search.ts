import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

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
}

let searchRecords: SearchRecord[] = [];

export function getSearchRecords(): SearchRecord[] {
  return searchRecords;
}

export function resetSearchRecords(): void {
  searchRecords = [];
}

const SEARCH_TIMEOUT_MS = 10_000;

export const webSearchTool: AgentTool<typeof WebSearchParams> = {
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

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: params.query,
          search_depth: params.search_depth || "basic",
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
