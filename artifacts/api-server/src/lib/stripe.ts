import Stripe from "stripe";

/**
 * Payments are ON only when BOTH Stripe secrets are set (Replit Secrets):
 *   STRIPE_SECRET_KEY      sk_test_... (test mode)
 *   STRIPE_WEBHOOK_SECRET  whsec_...   (the webhook endpoint's signing secret)
 * A live key (sk_live_/rk_live_) is refused unless STRIPE_LIVE_APPROVED=yes, which Markus sets only
 * after the pre-launch checklist (old leaked keys rotated, legal docs, physiologist review).
 */
export type PaymentsMode = "off" | "test" | "live";

function secret(): string {
  return (process.env["STRIPE_SECRET_KEY"] ?? "").trim();
}

export function paymentsMode(): PaymentsMode {
  const key = secret();
  if (!key || !(process.env["STRIPE_WEBHOOK_SECRET"] ?? "").trim()) return "off";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if ((key.startsWith("sk_live_") || key.startsWith("rk_live_")) && process.env["STRIPE_LIVE_APPROVED"] === "yes") return "live";
  return "off";
}

let client: Stripe | null = null;

/** The Stripe client, or null when payments are off. */
export function stripeClient(): Stripe | null {
  if (paymentsMode() === "off") return null;
  client ??= new Stripe(secret(), { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

export function webhookSecret(): string {
  return (process.env["STRIPE_WEBHOOK_SECRET"] ?? "").trim();
}
