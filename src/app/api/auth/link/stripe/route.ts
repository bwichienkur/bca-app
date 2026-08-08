import { NextRequest, NextResponse } from "next/server";
import {
  getAppUser,
  requireAppUserOrBridge,
  toPublicAuthUser,
} from "@/lib/app-auth";
import { readScoringSession } from "@/lib/scoring-auth";
import { isStripeConfigured } from "@/lib/stripe";
import {
  startStripeConnectOnboarding,
  syncStripeConnectAccount,
} from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

async function toUserResponse(userId: string) {
  const user = await getAppUser(userId);
  if (!user) throw new Error("Sign in required.");
  const scoring = await readScoringSession();
  const scoringReady = Boolean(
    scoring && user.fargo?.lmsId && scoring.lmsId === user.fargo.lmsId,
  );
  return toPublicAuthUser(user, scoringReady);
}

/** Start Stripe Connect onboarding (returns Account Link URL). */
export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured on this server. Set STRIPE_SECRET_KEY (and redeploy).",
        },
        { status: 503 },
      );
    }

    const appUser = await requireAppUserOrBridge();
    const result = await startStripeConnectOnboarding(appUser, request);
    const scoring = await readScoringSession();
    const scoringReady = Boolean(
      scoring &&
        result.user.fargo?.lmsId &&
        scoring.lmsId === result.user.fargo.lmsId,
    );
    return NextResponse.json({
      url: result.url,
      accountId: result.accountId,
      user: toPublicAuthUser(result.user, scoringReady),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start Stripe Connect.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured") || message.includes("APP_URL")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Refresh Connect account status after return from Stripe. */
export async function GET() {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured on this server. Set STRIPE_SECRET_KEY (and redeploy).",
        },
        { status: 503 },
      );
    }

    const appUser = await requireAppUserOrBridge();
    if (!appUser.stripe?.accountId) {
      return NextResponse.json({
        user: await toUserResponse(appUser.id),
        stripeLinked: false,
        stripeChargesEnabled: false,
      });
    }

    const updated = await syncStripeConnectAccount(appUser);
    const scoring = await readScoringSession();
    const scoringReady = Boolean(
      scoring &&
        updated.fargo?.lmsId &&
        scoring.lmsId === updated.fargo.lmsId,
    );
    return NextResponse.json({
      user: toPublicAuthUser(updated, scoringReady),
      stripeLinked: Boolean(updated.stripe?.accountId),
      stripeChargesEnabled: Boolean(updated.stripe?.chargesEnabled),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not refresh Stripe status.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
