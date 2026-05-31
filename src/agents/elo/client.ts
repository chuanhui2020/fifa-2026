/**
 * eloratings.net client.
 *
 * `World.tsv` is a clean tab-separated table of national-team Elo ratings,
 * one row per team, with no API key required. Column layout:
 *   rank  prevRank  CODE  rating  ...        (rating at index 3)
 * CODE is eloratings.net's two-letter scheme (mostly ISO 3166-1 alpha-2, with
 * a few exceptions like EN=England, SQ=Scotland). We parse it into a
 * code -> rating map and cache the whole table (24h TTL) so all matches share
 * one fetch.
 */

import { getSnapshot, setSnapshot } from "../cache";

const TSV_URL = "https://www.eloratings.net/World.tsv";
const SNAPSHOT_NS = "elo";
const SNAPSHOT_KEY = "World";
const FETCH_TIMEOUT_MS = 10_000;
const ELO_TTL_MS = 24 * 60 * 60 * 1000;

/** Map of eloratings.net team code -> Elo rating. Stored as a plain object so it survives JSON cache round-trips. */
export type EloTable = Record<string, number>;

/** Parse the raw TSV body into a code -> rating table. Rows that don't yield a finite rating are skipped. */
export function parseEloTsv(tsv: string): EloTable {
  const table: EloTable = {};
  for (const line of tsv.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 4) continue;
    const code = cols[2]?.trim();
    const rating = Number(cols[3]);
    if (code && /^[A-Za-z]{2}$/.test(code) && isFinite(rating) && rating > 0) {
      table[code.toUpperCase()] = rating;
    }
  }
  return table;
}

/**
 * Return the cached Elo table, fetching from eloratings.net on a miss.
 * Returns null when the request fails or yields no usable rows — callers then
 * fall back to the LLM Elo agent.
 */
export async function fetchEloRatings(): Promise<EloTable | null> {
  const cached = await getSnapshot<EloTable>(SNAPSHOT_NS, SNAPSHOT_KEY);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(TSV_URL, { signal: controller.signal });
    if (!response.ok) return null;

    const tsv = await response.text();
    const table = parseEloTsv(tsv);
    if (Object.keys(table).length === 0) return null;

    await setSnapshot<EloTable>(SNAPSHOT_NS, SNAPSHOT_KEY, table, ELO_TTL_MS);
    return table;
  } catch {
    // timeout / network / parse error -> signal "no data", let caller fall back
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
