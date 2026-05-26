import * as templates from "./templates";

const PROMPT_MAP: Record<string, string> = {
  "elo.system.md": templates.ELO_SYSTEM,
  "elo.user.md": templates.ELO_USER,
  "form.system.md": templates.FORM_SYSTEM,
  "form.user.md": templates.FORM_USER,
  "market.system.md": templates.MARKET_SYSTEM,
  "market.user.md": templates.MARKET_USER,
  "squad.system.md": templates.SQUAD_SYSTEM,
  "squad.user.md": templates.SQUAD_USER,
  "attribution.system.md": templates.ATTRIBUTION_SYSTEM,
  "attribution.user.md": templates.ATTRIBUTION_USER,
};

export function loadPrompt(
  name: string,
  vars: Record<string, string> = {}
): string {
  const raw = PROMPT_MAP[name];
  if (!raw) throw new Error(`Unknown prompt: ${name}`);
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    raw
  );
}
