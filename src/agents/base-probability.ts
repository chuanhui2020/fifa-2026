import type { CollectorOutput, Factor } from "./types";

interface BaseProbability {
  homeWin: number;
  draw: number;
  awayWin: number;
  source: "market" | "elo" | "uniform";
}

export function computeBaseProbability(collectorResults: CollectorOutput[]): BaseProbability {
  const marketResult = collectorResults.find((r) => r.agentId === "market");
  if (marketResult && marketResult.confidence >= 0.5) {
    const impliedProb = extractImpliedProbability(marketResult.factors);
    if (impliedProb) return { ...impliedProb, source: "market" };
  }

  const eloResult = collectorResults.find((r) => r.agentId === "elo");
  if (eloResult && eloResult.confidence >= 0.4) {
    const eloBased = estimateFromElo(eloResult.factors);
    if (eloBased) return { ...eloBased, source: "elo" };
  }

  return { homeWin: 0.35, draw: 0.30, awayWin: 0.35, source: "uniform" };
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
