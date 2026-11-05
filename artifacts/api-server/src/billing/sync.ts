import type Stripe from "stripe";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { billingEventsTable, db, membershipsTable, usersTable } from "@workspace/db";
import { recordEvent } from "../coaching/events";

/**
 * Stripe webhook → memberships. The ONLY code that grants paid access (Stripe is the source of truth).
 * Every event is applied at most once: its id goes into billing_events in the same transaction as the change.
 * Subscriptions are always re-read from Stripe (latest state), so events arriving out of order are harmless.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Deps = {
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  /** Cancels a subscription now, crediting unused time. Must succeed or throw (Stripe then retries the event). */
  cancelSubscription: (id: string) => Promise<void>;
};

/**
 * Upgrade Plans -> Coaching: once a Coaching subscription is active, the member's other monthly Stripe
 * subscriptions (their Plans membership) are cancelled, so nobody pays for both.
 */
export async function subscriptionsToReplace(sub: Stripe.Subscription): Promise<string[]> {
  const userId = Number(sub.metadata["user_id"]);
  const kind = sub.metadata["kind"];
  const lower = kind === "tier3" ? ["tier1", "tier2"] : kind === "tier2" ? ["tier1"] : [];
  if (!lower.length || !Number.isInteger(userId) || subscriptionAccess(sub).status !== "active") return [];
  const rows = await db
    .select({ ref: membershipsTable.stripeRef })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), inArray(membershipsTable.kind, lower), eq(membershipsTable.status, "active")));
  return rows.map((r) => r.ref).filter((r): r is string => Boolean(r?.startsWith("sub_")) && r !== sub.id);
}

/** Unpaid renewal: access continues this many days into the unpaid period while Stripe retries the card. */
export const PAST_DUE_GRACE_DAYS = 3;
/** Paid period: access runs this long past the period end, so a slow renewal webhook never locks a payer out. */
export const RENEWAL_BUFFER_HOURS = 24;

const ONE_OFF = new Set(["intro_plan", "plan"]);
const MONTHLY = new Set(["tier1", "tier2", "tier3"]);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);
const at = (unixSeconds: number) => new Date(unixSeconds * 1000);

/** The subscription an event is about, or null. */
export function subscriptionIdOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return event.data.object.mode === "subscription" ? idOf(event.data.object.subscription) : null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "invoice.paid":
      return idOf(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

/** Pure: what a subscription's state means for access. */
export function subscriptionAccess(sub: Stripe.Subscription, now = new Date()): { status: "active" | "ended"; endsAt: Date } {
  const item = sub.items.data[0];
  if (item && (sub.status === "active" || sub.status === "trialing")) {
    return { status: "active", endsAt: new Date(at(item.current_period_end).getTime() + RENEWAL_BUFFER_HOURS * 3_600_000) };
  }
  if (item && sub.status === "past_due") {
    const endsAt = new Date(at(item.current_period_start).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000);
    return endsAt > now ? { status: "active", endsAt } : { status: "ended", endsAt };
  }
  return { status: "ended", endsAt: sub.ended_at ? at(sub.ended_at) : now };
}

async function userExists(tx: Tx, userId: number): Promise<boolean> {
  const [row] = await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return Boolean(row);
}

async function rememberCustomer(tx: Tx, userId: number, customer: string | null) {
  if (!customer) return;
  await tx
    .update(usersTable)
    .set({ stripeCustomerId: customer })
    .where(and(eq(usersTable.id, userId), isNull(usersTable.stripeCustomerId)));
}

async function applySubscription(tx: Tx, sub: Stripe.Subscription, test: boolean): Promise<string> {
  const userId = Number(sub.metadata["user_id"]);
  const kind = sub.metadata["kind"] ?? "";
  if (!Number.isInteger(userId) || !MONTHLY.has(kind) || !(await userExists(tx, userId))) return "skipped: subscription without a known user/kind";
  const { status, endsAt } = subscriptionAccess(sub);
  const [before] = await tx.select({ status: membershipsTable.status }).from(membershipsTable).where(eq(membershipsTable.stripeRef, sub.id));
  await tx
    .insert(membershipsTable)
    .values({ userId, kind, status, test, endsAt, stripeRef: sub.id })
    .onConflictDoUpdate({ target: membershipsTable.stripeRef, set: { status, endsAt } });
  // Conversion events (spec 3.1 §4.3): the first time it is active, and when it ends.
  if (status === "active" && before?.status !== "active") void recordEvent("paid", { userId, props: { kind, tier: kind } });
  if (status === "ended" && before?.status === "active") void recordEvent("cancelled", { userId, props: { kind, tier: kind } });
  await rememberCustomer(tx, userId, idOf(sub.customer));
  return `subscription ${status}`;
}

async function applyOneOff(tx: Tx, session: Stripe.Checkout.Session, test: boolean): Promise<string> {
  if (session.payment_status !== "paid") return "waiting: payment not settled";
  const userId = Number(session.metadata?.["user_id"]);
  const kind = session.metadata?.["kind"] ?? "";
  if (!Number.isInteger(userId) || !ONE_OFF.has(kind) || !(await userExists(tx, userId))) return "skipped: payment without a known user/kind";
  await tx
    .insert(membershipsTable)
    .values({ userId, kind, status: "active", test, stripeRef: session.id, stripePaymentIntent: idOf(session.payment_intent) })
    .onConflictDoNothing({ target: membershipsTable.stripeRef });
  await rememberCustomer(tx, userId, idOf(session.customer));
  return "plan granted";
}

async function applyRefund(tx: Tx, charge: Stripe.Charge): Promise<string> {
  const intent = idOf(charge.payment_intent);
  if (!charge.refunded || !intent) return "ignored: partial refund";
  const ended = await tx
    .update(membershipsTable)
    .set({ status: "ended", endsAt: new Date() })
    .where(eq(membershipsTable.stripePaymentIntent, intent))
    .returning({ id: membershipsTable.id });
  return ended.length ? "plan ended: refunded" : "ignored: refund not for a plan";
}

/** One purchase into memberships: a subscription (latest state from Stripe) or a paid one-off Checkout Session. */
async function applyPurchase(tx: Tx, sub: Stripe.Subscription | null, session: Stripe.Checkout.Session | null, test: boolean, replaced: string[]): Promise<string> {
  if (!sub) return session ? applyOneOff(tx, session, test) : "ignored: nothing to apply";
  let outcome = await applySubscription(tx, sub, test);
  if (replaced.length) {
    await tx.update(membershipsTable).set({ status: "ended", endsAt: new Date() }).where(inArray(membershipsTable.stripeRef, replaced));
    outcome += `; replaced ${replaced.length} Plans membership`;
  }
  return outcome;
}

/**
 * The member is back from Checkout: apply their session at once instead of waiting for the webhook.
 * The session is read from Stripe by the server (never taken from the browser) and must be this member's.
 * Same writes as the webhook; when the webhook lands later it finds the row already there (stripe_ref is unique).
 */
export async function confirmCheckout(session: Stripe.Checkout.Session, userId: number, deps: Deps): Promise<string> {
  if (Number(session.metadata?.["user_id"]) !== userId) return "not yours";
  const subId = session.mode === "subscription" ? idOf(session.subscription) : null;
  const sub = subId ? await deps.retrieveSubscription(subId) : null;
  const replaced = sub ? await subscriptionsToReplace(sub) : [];
  for (const id of replaced) await deps.cancelSubscription(id);
  return db.transaction((tx) => applyPurchase(tx, sub, sub ? null : session, !session.livemode, replaced));
}

/**
 * Applies one verified event. Returns the outcome stored in billing_events, or "duplicate".
 * Throws on failure, so the caller answers 500 and Stripe retries.
 */
export async function handleEvent(event: Stripe.Event, deps: Deps): Promise<string> {
  const subId = subscriptionIdOf(event);
  // Network read outside the transaction; the write below is atomic.
  const sub = subId ? await deps.retrieveSubscription(subId) : null;
  const test = !event.livemode;
  // Network calls before the transaction: if a cancel fails this throws, nothing is recorded, Stripe retries.
  const replaced = sub ? await subscriptionsToReplace(sub) : [];
  for (const id of replaced) await deps.cancelSubscription(id);

  return db.transaction(async (tx) => {
    // Claim the event first: a second delivery (even a concurrent one) waits here, then finds it taken.
    const claimed = await tx
      .insert(billingEventsTable)
      .values({ id: event.id, type: event.type, livemode: event.livemode, outcome: "applying" })
      .onConflictDoNothing()
      .returning({ id: billingEventsTable.id });
    if (!claimed.length) return "duplicate";

    let outcome = "ignored: event type not used";
    if (sub) outcome = await applyPurchase(tx, sub, null, test, replaced);
    else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      outcome = await applyPurchase(tx, null, event.data.object, test, replaced);
    } else if (event.type === "charge.refunded") outcome = await applyRefund(tx, event.data.object);

    await tx.update(billingEventsTable).set({ outcome }).where(eq(billingEventsTable.id, event.id));
    return outcome;
  });
}
