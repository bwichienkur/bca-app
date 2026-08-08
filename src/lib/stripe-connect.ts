import type { AppUser, LinkedStripeAccount } from "@/lib/app-auth";
import { getAppUserByLmsId, saveAppUser } from "@/lib/app-auth";
import { getStripe, requestOrigin } from "@/lib/stripe";

export function platformFeeCents(entryFeeCents: number): number {
  const raw = process.env.STRIPE_PLATFORM_FEE_BPS?.trim();
  if (!raw) return 0;
  const bps = Number(raw);
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  const fee = Math.floor((entryFeeCents * Math.min(bps, 10_000)) / 10_000);
  return Math.max(0, Math.min(entryFeeCents - 1, fee));
}

function linkFromAccount(
  account: {
    id: string;
    charges_enabled?: boolean | null;
    details_submitted?: boolean | null;
    payouts_enabled?: boolean | null;
  },
  previous: LinkedStripeAccount | null | undefined,
): LinkedStripeAccount {
  const now = new Date().toISOString();
  return {
    accountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
    linkedAt: previous?.linkedAt ?? now,
    updatedAt: now,
  };
}

function stripeErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const err = error as {
    message?: string;
    type?: string;
    raw?: { message?: string };
  };
  const message = (err.message || err.raw?.message || "").trim();
  if (!message) return fallback;

  // Avoid dumping the whole Stripe docs essay into the Settings UI.
  if (/Accounts v1/i.test(message) || /\/v2\/core\/accounts/i.test(message)) {
    return "Stripe requires Accounts v2 for new Connect platforms. Update/redeploy Tableside, complete Connect platform setup in the Stripe Dashboard, then try Connect again.";
  }
  if (/signed up for connect/i.test(message)) {
    return `${message} Finish Connect platform setup in your Stripe Dashboard, then try again.`;
  }
  return message;
}

/** Create or reuse a Connect account (Accounts v2) and return an onboarding URL. */
export async function startStripeConnectOnboarding(
  user: AppUser,
  request: Request,
): Promise<{ url: string; accountId: string; user: AppUser }> {
  const stripe = getStripe();
  const origin = requestOrigin(request);
  if (!origin || !/^https?:\/\//i.test(origin)) {
    throw new Error(
      "APP_URL is missing or invalid. Set APP_URL to your public site origin (e.g. https://your-app.vercel.app).",
    );
  }

  let accountId = user.stripe?.accountId?.trim() || "";
  let workingUser = user;

  if (!accountId) {
    try {
      const displayName =
        user.name?.trim() ||
        user.fargo?.name?.trim() ||
        user.email.split("@")[0] ||
        "Organizer";

      const account = await stripe.v2.core.accounts.create({
        contact_email: user.email || undefined,
        display_name: displayName,
        dashboard: "express",
        identity: {
          country: "us",
          entity_type: "individual",
        },
        configuration: {
          // Destination charges with on_behalf_of use the merchant config.
          merchant: {
            capabilities: {
              card_payments: { requested: true },
            },
          },
          // Allows receiving transfers into the connected Stripe balance.
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        defaults: {
          currency: "usd",
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "application",
          },
          locales: ["en-US"],
        },
        metadata: {
          tablesideUserId: user.id,
          lmsId: user.fargo?.lmsId ?? "",
        },
        include: [
          "configuration.merchant",
          "configuration.recipient",
          "identity",
          "requirements",
        ],
      });

      accountId = account.id;
      // v1 retrieve works for v2 account IDs and exposes charges/payouts flags.
      let chargesEnabled = false;
      let detailsSubmitted = false;
      let payoutsEnabled = false;
      try {
        const v1 = await stripe.accounts.retrieve(accountId);
        chargesEnabled = Boolean(v1.charges_enabled);
        detailsSubmitted = Boolean(v1.details_submitted);
        payoutsEnabled = Boolean(v1.payouts_enabled);
      } catch {
        /* brand-new accounts often aren't charge-ready yet */
      }

      workingUser = await saveAppUser({
        ...user,
        stripe: linkFromAccount(
          {
            id: accountId,
            charges_enabled: chargesEnabled,
            details_submitted: detailsSubmitted,
            payouts_enabled: payoutsEnabled,
          },
          null,
        ),
      });
    } catch (error) {
      throw new Error(
        stripeErrorMessage(error, "Could not create a Stripe Connect account."),
      );
    }
  }

  try {
    const accountLink = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "recipient"],
          collection_options: {
            fields: "eventually_due",
          },
          return_url: `${origin}/?stripe=return`,
          refresh_url: `${origin}/?stripe=refresh`,
        },
      },
    });

    if (!accountLink.url) {
      throw new Error("Stripe did not return an onboarding URL.");
    }

    return { url: accountLink.url, accountId, user: workingUser };
  } catch (error) {
    const message = stripeErrorMessage(
      error,
      "Could not start Stripe onboarding.",
    );
    if (
      workingUser.stripe?.accountId &&
      (/no such account/i.test(message) || /account.*invalid/i.test(message))
    ) {
      await saveAppUser({ ...workingUser, stripe: null });
      throw new Error(
        "Your saved Stripe connection is no longer valid. Click Connect again to start fresh.",
      );
    }
    throw new Error(message);
  }
}

/** Refresh Connect account flags from Stripe and persist on the user. */
export async function syncStripeConnectAccount(
  user: AppUser,
): Promise<AppUser> {
  const accountId = user.stripe?.accountId?.trim();
  if (!accountId) {
    return saveAppUser({ ...user, stripe: null });
  }

  const stripe = getStripe();
  // Interoperable: v1 retrieve accepts v2 account IDs.
  const account = await stripe.accounts.retrieve(accountId);
  return saveAppUser({
    ...user,
    stripe: linkFromAccount(account, user.stripe),
  });
}

/**
 * Resolve the organizer's Connect account for a tournament.
 * Throws a player-facing error when online pay is selected but payouts aren't ready.
 */
export async function resolveOrganizerStripeAccount(
  organizerLmsId: string,
): Promise<LinkedStripeAccount> {
  const organizer = await getAppUserByLmsId(organizerLmsId);
  const link = organizer?.stripe ?? null;
  if (!link?.accountId) {
    throw new Error(
      "The organizer has not connected Stripe yet. Online entry fees are unavailable.",
    );
  }
  if (!link.chargesEnabled) {
    throw new Error(
      "The organizer’s Stripe account is not finished setting up. Online entry fees are unavailable.",
    );
  }
  return link;
}
