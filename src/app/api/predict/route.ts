import { NextResponse } from "next/server";
import { predict } from "@/agents/orchestrator";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const { matchId, homeTeam, awayTeam } = body;

  if (!matchId || !homeTeam || !awayTeam) {
    return NextResponse.json(
      { error: "matchId, homeTeam, and awayTeam are required" },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const result = await predict(matchId, homeTeam, awayTeam);
    clearTimeout(timeout);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "预测超时，请稍后重试" }, { status: 504 });
    }
    const message = error instanceof Error ? error.message : "Prediction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
