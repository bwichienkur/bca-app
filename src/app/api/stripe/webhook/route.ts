import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  findRegistrationByCheckoutSession,
  markRegistrationPaidFromStripe,
} from "@/lib/tournaments/store";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const dynamic = "force-dynamic";

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") return;

  const tournamentId =
    session.metadata?.tournamentId?.trim() ||
    (await findRegistrationByCheckoutSession(session.id))?.tournamentId ||
    "";
  const registrationId =
    session.metadata?.registrationId?.trim() ||
    session.client_reference_id?.trim() ||
    "";

  if (!tournamentId || !registrationId) {
    console.warn(
      "[stripe webhook] checkout.session missing tournament/registration metadata",
      session.id,
    );
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  await markRegistrationPaidFromStripe({
    tournamentId,
    registrationId,
    checkoutSessionId: session.id,
    paymentIntentId,
  });
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Stripe signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await fulfillCheckoutSession(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe webhook] handler failed", error);
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
