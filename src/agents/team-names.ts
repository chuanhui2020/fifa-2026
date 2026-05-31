/**
 * Team-name reconciliation shared across data sources (the-odds-api events,
 * eloratings.net codes) and our fixture data (src/data/matches.ts), which
 * differ in spelling, diacritics, and conventions.
 *
 * Strategy: normalize both sides (lowercase, strip diacritics & punctuation),
 * then apply explicit tables for cases normalization alone can't bridge
 * (e.g. "United States" -> "USA", "Congo DR" -> ISO "CD").
 */

// All Unicode marks (Mn/Mc/Me); after NFD, accented letters decompose to
// base + combining mark, so this strips diacritics. \p{M} keeps the source ASCII.
const COMBINING_MARKS = /\p{M}/gu;

/** Lowercase, strip diacritics and non-alphanumerics, collapse whitespace. */
export function normalizeTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Alias table keyed by the normalized form of names we might encounter.
 * Values are the normalized *canonical* form. Both our fixture names and
 * external source names are funneled through `canonicalTeam`, so an entry here
 * only needs to map any known variant to one shared canonical token.
 */
const ALIASES: Record<string, string> = {
  // our fixture name (normalized) -> canonical
  "united states": "usa",
  "south korea": "korea republic",
  turkiye: "turkey",
  "congo dr": "dr congo",
  "ivory coast": "cote divoire",
  czechia: "czech republic",
  "bosnia and herzegovina": "bosnia herzegovina",
  "cape verde": "cabo verde",

  // likely external-source variants (normalized) -> same canonical
  "korea republic": "korea republic",
  "republic of korea": "korea republic",
  turkey: "turkey",
  "dr congo": "dr congo",
  "democratic republic of congo": "dr congo",
  "cote d ivoire": "cote divoire",
  "cote divoire": "cote divoire",
  "czech republic": "czech republic",
  "bosnia herzegovina": "bosnia herzegovina",
  "cabo verde": "cabo verde",
};

/** Map any team name to a canonical, comparable token. */
export function canonicalTeam(name: string): string {
  const norm = normalizeTeam(name);
  return ALIASES[norm] ?? norm;
}

/** True when two team names refer to the same nation across naming conventions. */
export function teamsMatch(a: string, b: string): boolean {
  return canonicalTeam(a) === canonicalTeam(b);
}

/**
 * Fixture team name (any spelling) -> ISO 3166-1 alpha-2 code, as used by
 * eloratings.net's World.tsv (e.g. ES, AR, US, KR, EN for England). Keyed by
 * normalized name. Returns null for unknown names (e.g. knockout placeholders),
 * which signals callers to fall back. Covers all 48 World Cup 2026 fixture teams.
 */
const NAME_TO_ISO: Record<string, string> = {
  mexico: "MX",
  "south africa": "ZA",
  "south korea": "KR",
  czechia: "CZ",
  canada: "CA",
  "bosnia and herzegovina": "BA",
  qatar: "QA",
  switzerland: "CH",
  brazil: "BR",
  morocco: "MA",
  haiti: "HT",
  scotland: "SQ", // eloratings uses SQ for Scotland (non-ISO)
  "united states": "US",
  paraguay: "PY",
  australia: "AU",
  turkiye: "TR",
  germany: "DE",
  curacao: "CW",
  "ivory coast": "CI",
  ecuador: "EC",
  netherlands: "NL",
  japan: "JP",
  sweden: "SE",
  tunisia: "TN",
  spain: "ES",
  "cape verde": "CV",
  "saudi arabia": "SA",
  uruguay: "UY",
  belgium: "BE",
  egypt: "EG",
  iran: "IR",
  "new zealand": "NZ",
  france: "FR",
  senegal: "SN",
  iraq: "IQ",
  norway: "NO",
  argentina: "AR",
  algeria: "DZ",
  austria: "AT",
  jordan: "JO",
  portugal: "PT",
  "congo dr": "CD",
  ghana: "GH",
  panama: "PA",
  england: "EN", // eloratings uses EN for England (not GB)
  croatia: "HR",
  uzbekistan: "UZ",
  colombia: "CO",
};

export function teamToISO(name: string): string | null {
  return NAME_TO_ISO[normalizeTeam(name)] ?? null;
}
