import { readFileSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(process.cwd(), "src/agents/prompts");

export function loadPrompt(
  name: string,
  vars: Record<string, string> = {}
): string {
  const raw = readFileSync(join(PROMPTS_DIR, name), "utf-8");
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    raw
  );
}
