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

export const webSearchTool: AgentTool<typeof WebSearchParams> = {
  name: "web_search",
  description:
    "Search the web for current information. Use this to find real-time data like team rankings, recent match results, betting odds, injury reports, and other up-to-date football information.",
  parameters: WebSearchParams,
  label: "Web Search",

  async execute(
    _toolCallId: string,
    params: WebSearchParamsType
  ): Promise<AgentToolResult<TavilyResponse>> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY not configured");
    }

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
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: ${response.status}`);
    }

    const data: TavilyResponse = await response.json();

    const text = formatResults(data);

    return {
      content: [{ type: "text", text }],
      details: data,
    };
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
