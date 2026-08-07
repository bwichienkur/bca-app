import { NextResponse } from "next/server";
import { isOperatorConfigured } from "./lms-operator";
import { requireScoringSession } from "./scoring-auth";

export async function requireOperatorApi() {
  await requireScoringSession();
  if (!isOperatorConfigured()) {
    const error = new Error(
      "League operator is not configured. Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD.",
    );
    (error as Error & { status: number }).status = 503;
    throw error;
  }
}

export function operatorErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Operator request failed.";
  const status =
    (error as { status?: number }).status ??
    (message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : 502);
  return NextResponse.json({ error: message }, { status });
}
