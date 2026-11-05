import type Stripe from "stripe";
import { PRICES, type Access } from "../coaching/access";

export type Kind = "intro_plan" | "plan" | "tier1" | "tier2" | "tier3";

const ITEMS: Record<Kind, { name: string; cents: number; monthly: boolean }> = {
  intro_plan: { name: "Hypest first plan (4 weeks, 50% off)", cents: PRICES.intro_plan_cents, monthly: false },
  plan: { name: "Hypest plan (4 weeks)", cents: PRICES.plan_cents, monthly: false },
  tier1: { name: "Hypest Starter (a new plan every 4 weeks)", cents: PRICES.tier1_cents, monthly: true },
  tier2: { name: "Hypest Coaching (adaptive plans, coach, food)", cents: PRICES.tier2_cents, monthly: true },
  tier3: { name: "Hypest Pro (the most coaching, reports)", cents: PRICES.tier3_cents, monthly: true },
};

const isMonthly = (kind: Kind) => ITEMS[kind].monthly;

/** Higher = more. Upgrades only go up; a move down is done in the billing portal. */
const RANK: Record<string, number> = { tier1: 1, tier2: 2, tier3: 3 };

/**
 * Pure: why this member can't buy this now, or null. Moving up (Starter -> Coaching -> Pro) is allowed: the webhook
 * cancels the lower membership once the higher one is paid. Any other second membership is refused. One-off plans are
 * no longer sold (docs/TIERS-AND-BODY-SPEC.md §1); credits already bought keep working.
 */
export function checkoutBlocked(kind: Kind, access: Pick<Access, "level" | "intro_available">): string | null {
  if (kind === "intro_plan" || kind === "plan") return "One-off plans are no longer sold. Starter is $4.99 a month.";
  const member = (RANK[access.level] ?? 0) > 0;
  const upgrade = (RANK[kind] ?? 0) > (RANK[access.level] ?? 0);
  if (isMonthly(kind) && member && !upgrade) return "You already have a membership. Manage or cancel it first.";
  return null;
}

/**
 * The return page must be on the site the request came from (no open redirect). Returns the
 * cleaned URL or null.
 */
export function safeReturnUrl(returnUrl: string, allowedOrigin: string | undefined): string | null {
  if (!allowedOrigin) return null;
  try {
    const url = new URL(returnUrl);
    const origin = new URL(allowedOrigin).origin;
    if (url.origin !== origin || (url.protocol !== "https:" && url.hostname !== "localhost")) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Pure: the Checkout Session for one purchase. Prices come only from PRICES (one source). */
export function checkoutParams(args: {
  kind: Kind;
  userId: number;
  email: string;
  customerId: string | null;
  returnUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const item = ITEMS[args.kind];
  const metadata = { user_id: String(args.userId), kind: args.kind };
  const sep = args.returnUrl.includes("?") ? "&" : "?";
  const base: Stripe.Checkout.SessionCreateParams = {
    client_reference_id: String(args.userId),
    metadata,
    // {CHECKOUT_SESSION_ID} is filled in by Stripe, so the app can confirm this exact session on return.
    success_url: `${args.returnUrl}${sep}checkout=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${args.returnUrl}${sep}checkout=cancelled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: item.cents,
          product_data: { name: item.name },
          ...(item.monthly ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    ...(args.customerId ? { customer: args.customerId } : { customer_email: args.email }),
  };
  return item.monthly
    ? { ...base, mode: "subscription", subscription_data: { metadata } }
    : { ...base, mode: "payment", payment_intent_data: { metadata }, ...(args.customerId ? {} : { customer_creation: "always" as const }) };
}
