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
  if (/signed up for connect/i.test(message) || /connect/i.test(message)) {
    return `${message} Enable Connect (Express) in your Stripe Dashboard, then try again.`;
  }
  return message;
}

/** Create or reuse a Connect Express account and return an onboarding Account Link URL. */
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
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          tablesideUserId: user.id,
          lmsId: user.fargo?.lmsId ?? "",
        },
      });
      accountId = account.id;
      workingUser = await saveAppUser({
        ...user,
        stripe: linkFromAccount(account, null),
      });
    } catch (error) {
      throw new Error(
        stripeErrorMessage(error, "Could not create a Stripe Connect account."),
      );
    }
  }

  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/?stripe=refresh`,
      return_url: `${origin}/?stripe=return`,
      type: "account_onboarding",
    });

    if (!accountLink.url) {
      throw new Error("Stripe did not return an onboarding URL.");
    }

    return { url: accountLink.url, accountId, user: workingUser };
  } catch (error) {
    // Stale/deleted Connect account id — clear and ask the user to retry once.
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
