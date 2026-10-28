import type Stripe from "stripe";
import { PRICES, type Access } from "../coaching/access";

export type Kind = "intro_plan" | "plan" | "tier1" | "tier2";

const ITEMS: Record<Kind, { name: string; cents: number; monthly: boolean }> = {
  intro_plan: { name: "Hypest first plan (4 weeks, 50% off)", cents: PRICES.intro_plan_cents, monthly: false },
  plan: { name: "Hypest plan (4 weeks)", cents: PRICES.plan_cents, monthly: false },
  tier1: { name: "Hypest Plans (a new plan every 4 weeks)", cents: PRICES.tier1_cents, monthly: true },
  tier2: { name: "Hypest Coaching (plans, logging, adaptive)", cents: PRICES.tier2_cents, monthly: true },
};

const isMonthly = (kind: Kind) => ITEMS[kind].monthly;

/**
 * Pure: why this member can't buy this now, or null. Plans -> Coaching is allowed (an upgrade: the webhook cancels
 * Plans once Coaching is paid); any other second membership is refused.
 */
export function checkoutBlocked(kind: Kind, access: Pick<Access, "level" | "intro_available">): string | null {
  if (kind === "intro_plan" && !access.intro_available) return "The intro offer is already used";
  const member = access.level === "tier1" || access.level === "tier2";
  const upgrade = kind === "tier2" && access.level === "tier1";
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
