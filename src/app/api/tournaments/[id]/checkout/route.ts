import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import {
  getStripe,
  isStripeConfigured,
  isStripePayMethod,
  requestOrigin,
} from "@/lib/stripe";
import {
  platformFeeCents,
  resolveOrganizerStripeAccount,
} from "@/lib/stripe-connect";
import { eventDeepLinkPath } from "@/lib/app-url";
import {
  attachStripeCheckoutSession,
  getRegistration,
  getTournament,
  tournamentStoreMode,
} from "@/lib/tournaments/store";
import { formatEntryFee } from "@/lib/tournaments/options";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireScoringSession();
    const { id: tournamentId } = await context.params;

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Online payments are not configured on this server." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { registrationId?: string };
    const registrationId = body.registrationId?.trim();
    if (!registrationId) {
      return NextResponse.json(
        { error: "registrationId is required." },
        { status: 400 },
      );
    }

    const tournament = await getTournament(tournamentId);
    if (!tournament) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!isStripePayMethod(tournament.payMethod)) {
      return NextResponse.json(
        { error: "This event does not collect entry fees online." },
        { status: 400 },
      );
    }
    if (tournament.entryFeeCents <= 0) {
      return NextResponse.json(
        { error: "This event has no entry fee." },
        { status: 400 },
      );
    }

    const registration = await getRegistration(tournamentId, registrationId);
    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found." },
        { status: 404 },
      );
    }
    if (registration.userId !== session.lmsId) {
      return NextResponse.json(
        { error: "Only the entry captain can pay online." },
        { status: 403 },
      );
    }
    if (
      registration.status === "withdrawn" ||
      registration.status === "rejected"
    ) {
      return NextResponse.json(
        { error: "This entry cannot be paid." },
        { status: 400 },
      );
    }
    if (registration.paid) {
      return NextResponse.json(
        { error: "This entry is already paid.", alreadyPaid: true },
        { status: 400 },
      );
    }

    const origin = requestOrigin(request);
    const deepLink = eventDeepLinkPath(tournamentId);
    const successUrl = `${origin}${deepLink}&pay=success`;
    const cancelUrl = `${origin}${deepLink}&pay=cancel`;

    const organizerStripe = await resolveOrganizerStripeAccount(
      tournament.organizerUserId,
    );
    const applicationFeeAmount = platformFeeCents(tournament.entryFeeCents);

    const entryLabel =
      registration.teamName?.trim() || registration.displayName.trim() || "Entry";
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: registration.email ?? session.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: tournament.entryFeeCents,
            product_data: {
              name: `${tournament.title} — entry fee`,
              description: `${entryLabel} · ${formatEntryFee(tournament.entryFeeCents)}`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: registration.id,
      payment_intent_data: {
        // Connected account is MoR for the entry fee (Accounts v2 merchant).
        on_behalf_of: organizerStripe.accountId,
        transfer_data: {
          destination: organizerStripe.accountId,
        },
        ...(applicationFeeAmount > 0
          ? { application_fee_amount: applicationFeeAmount }
          : {}),
        metadata: {
          tournamentId,
          registrationId: registration.id,
          organizerUserId: tournament.organizerUserId,
        },
      },
      metadata: {
        tournamentId,
        registrationId: registration.id,
        userId: session.lmsId,
        organizerUserId: tournament.organizerUserId,
        stripeAccountId: organizerStripe.accountId,
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    await attachStripeCheckoutSession(
      tournamentId,
      registration.id,
      checkoutSession.id,
    );

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start checkout.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : message.includes("organizer") || message.includes("Organizer")
          ? 400
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
