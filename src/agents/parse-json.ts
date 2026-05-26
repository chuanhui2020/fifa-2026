export function parseLLMJson<T = unknown>(raw: string): T {
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // continue
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  throw new Error(
    `Failed to parse LLM JSON output. Raw: ${raw.slice(0, 200)}`
  );
}
