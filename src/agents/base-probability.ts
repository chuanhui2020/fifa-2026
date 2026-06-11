import type { CollectorOutput, Factor } from "./types";
import { isKnockoutStage } from "./types";

export interface BaseProbability {
  homeWin: number;
  draw: number;
  awayWin: number;
  source: "market" | "elo" | "uniform";
  /** True when the anchor is a hard data source (devigged odds / Elo table)
   *  rather than an LLM-derived fallback or the uniform prior. Drives how
   *  tightly the attribution model is clamped to it. */
  deterministic: boolean;
}

export function computeBaseProbability(collectorResults: CollectorOutput[], stage?: string): BaseProbability {
  const marketResult = collectorResults.find((r) => r.agentId === "market");
  if (marketResult && marketResult.confidence >= 0.5) {
    // Prefer the deterministic structured probability (devigged odds) when present;
    // it avoids brittle string-matching of factor names. impliedProbability is
    // only attached on the deterministic devig path, so it implies deterministic.
    const structured = marketResult.impliedProbability;
    if (structured) {
      const sum = structured.homeWin + structured.draw + structured.awayWin;
      if (sum > 0) {
        return applyKnockout({
          homeWin: structured.homeWin / sum,
          draw: structured.draw / sum,
          awayWin: structured.awayWin / sum,
          source: "market",
          deterministic: true,
        }, stage);
      }
    }

    // LLM market fallback: probabilities parsed from factor names — not deterministic.
    const impliedProb = extractImpliedProbability(marketResult.factors);
    if (impliedProb) return applyKnockout({ ...impliedProb, source: "market", deterministic: false }, stage);
  }

  const eloResult = collectorResults.find((r) => r.agentId === "elo");
  if (eloResult && eloResult.confidence >= 0.4) {
    const eloBased = estimateFromElo(eloResult.factors);
    if (eloBased) return applyKnockout({ ...eloBased, source: "elo", deterministic: !!eloResult.deterministic }, stage);
  }

  return applyKnockout({ homeWin: 0.35, draw: 0.30, awayWin: 0.35, source: "uniform", deterministic: false }, stage);
}

/**
 * In knockout stages (round32+), draw is not a valid final outcome — the match
 * goes to extra time / penalties. Redistribute draw probability to home/away
 * proportionally so the prediction is two-way.
 */
function applyKnockout(base: BaseProbability, stage?: string): BaseProbability {
  if (!stage || !isKnockoutStage(stage)) return base;
  const total = base.homeWin + base.awayWin;
  if (total <= 0) return { ...base, homeWin: 0.5, draw: 0, awayWin: 0.5 };
  return {
    ...base,
    homeWin: (base.homeWin + base.draw * (base.homeWin / total)),
    draw: 0,
    awayWin: (base.awayWin + base.draw * (base.awayWin / total)),
  };
}

function extractImpliedProbability(factors: Factor[]): { homeWin: number; draw: number; awayWin: number } | null {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (const factor of factors) {
    const name = factor.name.toLowerCase();
    if (name.includes("implied") || name.includes("odds") || name.includes("probability")) {
      if (factor.direction === "home" && factor.value > 0 && factor.value < 1) {
        homeWin = factor.value;
      } else if (factor.direction === "away" && factor.value > 0 && factor.value < 1) {
        awayWin = factor.value;
      } else if (factor.direction === "neutral" && factor.value > 0 && factor.value < 1) {
        draw = factor.value;
      }
    }
  }

  if (homeWin > 0 && awayWin > 0) {
    if (draw === 0) draw = Math.max(0.1, 1 - homeWin - awayWin);
    const sum = homeWin + draw + awayWin;
    if (sum > 0) {
      return { homeWin: homeWin / sum, draw: draw / sum, awayWin: awayWin / sum };
    }
  }

  return null;
}

function estimateFromElo(factors: Factor[]): { homeWin: number; draw: number; awayWin: number } | null {
  let eloDiff = 0;
  let found = false;

  for (const factor of factors) {
    const name = factor.name.toLowerCase();
    if (name.includes("elo") || name.includes("rating")) {
      if (factor.direction === "home") {
        eloDiff += factor.value;
        found = true;
      } else if (factor.direction === "away") {
        eloDiff -= factor.value;
        found = true;
      }
    }
  }

  if (!found) return null;

  // Elo expected score formula: E = 1 / (1 + 10^(-diff/400))
  // Adjusted for three-way (home/draw/away) with draw probability
  const expectedHome = 1 / (1 + Math.pow(10, -eloDiff / 400));
  const drawProb = 0.25 * (1 - Math.abs(expectedHome - 0.5) * 2);
  const homeWin = expectedHome * (1 - drawProb);
  const awayWin = (1 - expectedHome) * (1 - drawProb);

  const sum = homeWin + drawProb + awayWin;
  return {
    homeWin: homeWin / sum,
    draw: drawProb / sum,
    awayWin: awayWin / sum,
  };
}
