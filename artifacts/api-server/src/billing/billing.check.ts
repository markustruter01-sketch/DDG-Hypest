// Billing checks. LOCAL DATABASE ONLY (refuses anything else). Run from repo root:
//   DATABASE_URL=postgresql://...@127.0.0.1:5432/hypest_dev pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/billing/billing.check.ts
// Optional HTTP part: also set BILLING_CHECK_API=http://localhost:8099/api and BILLING_CHECK_WHSEC=<the server's STRIPE_WEBHOOK_SECRET>
// (server started with a dummy sk_test_ key; no request reaches Stripe).
import assert from "node:assert/strict";
import Stripe from "stripe";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

const { db, membershipsTable, usersTable, billingEventsTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { checkoutBlocked, checkoutParams, safeReturnUrl } = await import("./checkout");
const { confirmCheckout, handleEvent, subscriptionAccess, subscriptionIdOf, PAST_DUE_GRACE_DAYS, RENEWAL_BUFFER_HOURS } = await import("./sync");
const { accessFor, PRICES } = await import("../coaching/access");

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };
const now = Math.floor(Date.now() / 1000);
let seq = 0;
const evId = () => `evt_check_${Date.now()}_${++seq}`;
const event = (type: string, object: object, livemode = false) => ({ id: evId(), type, livemode, data: { object } }) as unknown as Stripe.Event;

// ---------- pure: checkout params ----------
{
  const pay = checkoutParams({ kind: "intro_plan", userId: 7, email: "a@b.co", customerId: null, returnUrl: "https://hypest.app/" });
  ok(pay.mode === "payment" && pay.customer_email === "a@b.co" && pay.customer_creation === "always", "one-off: payment mode, new customer");
  ok(pay.line_items?.[0]?.price_data?.unit_amount === PRICES.intro_plan_cents, "intro price from PRICES");
  ok(pay.metadata?.["user_id"] === "7" && pay.payment_intent_data?.metadata?.["kind"] === "intro_plan", "metadata on session and payment");
  ok(pay.success_url === "https://hypest.app/?checkout=done&session_id={CHECKOUT_SESSION_ID}" && pay.cancel_url === "https://hypest.app/?checkout=cancelled", "return urls (success carries the session id)");
  const sub = checkoutParams({ kind: "tier2", userId: 7, email: "a@b.co", customerId: "cus_1", returnUrl: "https://hypest.app/profile" });
  ok(sub.mode === "subscription" && sub.customer === "cus_1" && !("customer_email" in sub), "subscription reuses the customer");
  ok(sub.line_items?.[0]?.price_data?.recurring?.interval === "month" && sub.line_items?.[0]?.price_data?.unit_amount === PRICES.tier2_cents, "monthly tier2 price");
  ok(sub.subscription_data?.metadata?.["kind"] === "tier2", "kind on the subscription");
}
// ---------- pure: who can buy what ----------
{
  const as = (level: string, intro_available = true) => ({ level, intro_available }) as Parameters<typeof checkoutBlocked>[1];
  ok(checkoutBlocked("tier1", as("none")) === null && checkoutBlocked("tier2", as("plan")) === null, "non-members can join");
  ok(checkoutBlocked("tier2", as("tier1")) === null, "Plans -> Coaching: upgrade allowed");
  ok(checkoutBlocked("tier1", as("tier1")) !== null && checkoutBlocked("tier2", as("tier2")) !== null, "same membership twice: refused");
  ok(checkoutBlocked("tier1", as("tier2")) !== null, "Coaching -> Plans: refused (manage in the portal)");
  ok(checkoutBlocked("intro_plan", as("none", false)) !== null && checkoutBlocked("plan", as("tier2")) === null, "intro once; extra plans always OK");
}
// ---------- pure: return url ----------
ok(safeReturnUrl("https://hypest.app/profile?x=1#y", "https://hypest.app") === "https://hypest.app/profile", "same site, query stripped");
ok(safeReturnUrl("https://evil.example/", "https://hypest.app") === null, "other site refused");
ok(safeReturnUrl("http://hypest.app/", "http://hypest.app") === null, "plain http refused");
ok(safeReturnUrl("http://localhost:5173/", "http://localhost:5173") !== null, "localhost allowed");
ok(safeReturnUrl("https://hypest.app/", undefined) === null, "no origin, refused");
ok(safeReturnUrl("not a url", "https://hypest.app") === null, "garbage refused");

// ---------- pure: subscription state ----------
const subObj = (status: string, start: number, end: number, extra: object = {}) =>
  ({ id: `sub_check_${Date.now()}_${++seq}`, status, customer: "cus_check", ended_at: null, metadata: {}, items: { data: [{ current_period_start: start, current_period_end: end }] }, ...extra }) as unknown as Stripe.Subscription;
{
  const a = subscriptionAccess(subObj("active", now - 86_400, now + 29 * 86_400));
  ok(a.status === "active" && a.endsAt.getTime() === (now + 29 * 86_400) * 1000 + RENEWAL_BUFFER_HOURS * 3_600_000, "active: period end + buffer");
  const late = subscriptionAccess(subObj("past_due", now - 86_400, now + 29 * 86_400));
  ok(late.status === "active" && late.endsAt.getTime() === (now - 86_400) * 1000 + PAST_DUE_GRACE_DAYS * 86_400_000, "past_due: grace from period start");
  ok(subscriptionAccess(subObj("past_due", now - 10 * 86_400, now + 20 * 86_400)).status === "ended", "past_due beyond grace: ended");
  ok(subscriptionAccess(subObj("canceled", now - 86_400, now + 86_400)).status === "ended", "canceled: ended");
  ok(subscriptionAccess(subObj("incomplete", now, now + 86_400)).status === "ended", "incomplete: no access");
  ok(subscriptionIdOf(event("invoice.paid", { parent: { subscription_details: { subscription: "sub_9" } } })) === "sub_9", "invoice → subscription id");
  ok(subscriptionIdOf(event("checkout.session.completed", { mode: "payment", subscription: null })) === null, "one-off has no subscription");
}

// ---------- database: webhook → memberships ----------
async function newUser(): Promise<number> {
  const [u] = await db.insert(usersTable).values({ email: `billing-check-${Date.now()}-${++seq}@example.test`, passwordHash: "x", displayName: "Billing check", adultConfirmedAt: new Date() }).returning({ id: usersTable.id });
  return u!.id;
}
const rowsOf = (userId: number) => db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
const noCancel = async (): Promise<void> => { throw new Error("should not cancel"); };
const noRetrieve = { retrieveSubscription: async (): Promise<Stripe.Subscription> => { throw new Error("should not retrieve"); }, cancelSubscription: noCancel };

{
  const userId = await newUser();
  const session = (paid: boolean) => ({ id: `cs_check_${userId}`, mode: "payment", payment_status: paid ? "paid" : "unpaid", payment_intent: `pi_check_${userId}`, customer: `cus_check_${userId}`, metadata: { user_id: String(userId), kind: "intro_plan" } });
  ok((await handleEvent(event("checkout.session.completed", session(false)), noRetrieve)).startsWith("waiting"), "unpaid: waits");
  ok((await rowsOf(userId)).length === 0, "unpaid: no access");
  const paid = event("checkout.session.async_payment_succeeded", session(true));
  ok((await handleEvent(paid, noRetrieve)) === "plan granted", "paid: plan granted");
  ok((await handleEvent(paid, noRetrieve)) === "duplicate", "same event twice: duplicate");
  ok((await handleEvent(event("checkout.session.completed", session(true)), noRetrieve)) === "plan granted" && (await rowsOf(userId)).length === 1, "same session, new event: still one plan");
  const [row] = await rowsOf(userId);
  ok(row!.kind === "intro_plan" && row!.test === true && row!.status === "active", "test intro plan row");
  const access = await accessFor(userId);
  ok(access.level === "plan" && access.plan_credits === 1 && !access.intro_available, "access: one plan, intro used");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  ok(user!.stripeCustomerId === `cus_check_${userId}`, "customer remembered");
  ok((await handleEvent(event("charge.refunded", { refunded: false, payment_intent: `pi_check_${userId}` }), noRetrieve)).startsWith("ignored"), "partial refund ignored");
  ok((await handleEvent(event("charge.refunded", { refunded: true, payment_intent: `pi_check_${userId}` }), noRetrieve)) === "plan ended: refunded", "full refund ends the plan");
  ok((await accessFor(userId)).level === "none", "refunded: no access");
}
{
  const userId = await newUser();
  let current = subObj("active", now, now + 30 * 86_400, { metadata: { user_id: String(userId), kind: "tier2" }, customer: `cus_sub_${userId}` });
  const deps = { retrieveSubscription: async (id: string) => { assert.equal(id, current.id); return current; }, cancelSubscription: noCancel };
  ok((await handleEvent(event("checkout.session.completed", { mode: "subscription", subscription: current.id }), deps)) === "subscription active", "subscription checkout: active");
  ok((await accessFor(userId)).level === "tier2", "access: tier2");
  current = { ...current, status: "past_due", items: { data: [{ current_period_start: now - 10 * 86_400, current_period_end: now + 20 * 86_400 }] } } as unknown as Stripe.Subscription;
  ok((await handleEvent(event("customer.subscription.updated", current), deps)) === "subscription ended", "past_due beyond grace: ended");
  ok((await accessFor(userId)).level === "none", "past_due: no access");
  current = { ...current, status: "active", items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86_400 }] } } as unknown as Stripe.Subscription;
  ok((await handleEvent(event("invoice.paid", { parent: { subscription_details: { subscription: current.id } } }), deps)) === "subscription active", "paid again: active");
  ok((await rowsOf(userId)).length === 1, "one row per subscription");
  current = { ...current, status: "canceled", ended_at: now } as unknown as Stripe.Subscription;
  ok((await handleEvent(event("customer.subscription.deleted", current), deps)) === "subscription ended", "cancelled: ended");
  ok((await accessFor(userId)).level === "none", "cancelled: no access");
}
{
  const ghost = subObj("active", now, now + 86_400, { metadata: { user_id: "999999999", kind: "tier1" } });
  ok((await handleEvent(event("customer.subscription.created", ghost), { retrieveSubscription: async () => ghost, cancelSubscription: noCancel })).startsWith("skipped"), "unknown user skipped");
  const e = event("customer.created", { id: "cus_x" });
  ok((await handleEvent(e, noRetrieve)).startsWith("ignored"), "unused type ignored");
  const [logged] = await db.select().from(billingEventsTable).where(eq(billingEventsTable.id, e.id));
  ok(logged?.outcome.startsWith("ignored") && logged.livemode === false, "every event logged once");
}

// ---------- upgrade: Plans -> Coaching cancels the Plans subscription ----------
{
  const userId = await newUser();
  const meta = (kind: string) => ({ metadata: { user_id: String(userId), kind }, customer: `cus_up_${userId}` });
  const plans = subObj("active", now, now + 30 * 86_400, meta("tier1"));
  const plansDeps = { retrieveSubscription: async () => plans, cancelSubscription: noCancel };
  ok((await handleEvent(event("customer.subscription.created", plans), plansDeps)) === "subscription active", "Plans membership active");
  ok((await accessFor(userId)).level === "tier1", "access: tier1");

  const coaching = subObj("active", now, now + 30 * 86_400, meta("tier2"));
  const cancelled: string[] = [];
  let failCancel = true;
  const upDeps = {
    retrieveSubscription: async () => coaching,
    cancelSubscription: async (id: string) => { if (failCancel) throw new Error("stripe down"); cancelled.push(id); },
  };
  const up = event("checkout.session.completed", { mode: "subscription", subscription: coaching.id });
  await assert.rejects(handleEvent(up, upDeps), /stripe down/);
  ok((await db.select().from(billingEventsTable).where(eq(billingEventsTable.id, up.id))).length === 0, "cancel failed: event not recorded (Stripe retries)");
  ok((await accessFor(userId)).level === "tier1", "cancel failed: still on Plans, nothing half-done");
  failCancel = false;
  ok((await handleEvent(up, upDeps)).endsWith("replaced 1 Plans membership"), "retry: Coaching active, Plans replaced");
  ok(cancelled.length === 1 && cancelled[0] === plans.id, "the Plans subscription was cancelled at Stripe");
  ok((await accessFor(userId)).level === "tier2", "access: tier2");
  const rows = await rowsOf(userId);
  ok(rows.find((r) => r.stripeRef === plans.id)?.status === "ended" && rows.find((r) => r.stripeRef === coaching.id)?.status === "active", "rows: Plans ended, Coaching active");
  ok((await handleEvent(event("invoice.paid", { parent: { subscription_details: { subscription: coaching.id } } }), upDeps)) === "subscription active" && cancelled.length === 1, "later Coaching events cancel nothing more");

  // A Plans subscription's own events never cancel anything; an inactive Coaching subscription doesn't either.
  const other = await newUser();
  const p2 = subObj("active", now, now + 30 * 86_400, { metadata: { user_id: String(other), kind: "tier1" } });
  await handleEvent(event("customer.subscription.created", p2), { retrieveSubscription: async () => p2, cancelSubscription: noCancel });
  const pending = subObj("incomplete", now, now + 30 * 86_400, { metadata: { user_id: String(other), kind: "tier2" } });
  ok((await handleEvent(event("customer.subscription.created", pending), { retrieveSubscription: async () => pending, cancelSubscription: noCancel })) === "subscription ended", "unpaid Coaching: Plans kept");
  ok((await accessFor(other)).level === "tier1", "still on Plans");
}

// ---------- back from Checkout: unlock at once; the webhook arriving later changes nothing ----------
{
  const userId = await newUser();
  const stranger = await newUser();
  const session = { id: `cs_conf_${userId}`, object: "checkout.session", mode: "payment", livemode: false, payment_status: "paid", payment_intent: `pi_conf_${userId}`, customer: `cus_conf_${userId}`, metadata: { user_id: String(userId), kind: "intro_plan" } } as unknown as Stripe.Checkout.Session;
  ok((await confirmCheckout(session, stranger, noRetrieve)) === "not yours" && (await rowsOf(stranger)).length === 0 && (await rowsOf(userId)).length === 0, "someone else's checkout: nothing unlocked");
  ok((await confirmCheckout(session, userId, noRetrieve)) === "plan granted" && (await accessFor(userId)).plan_credits === 1, "own paid checkout: plan unlocked at once");
  ok((await confirmCheckout(session, userId, noRetrieve)) === "plan granted" && (await rowsOf(userId)).length === 1, "confirming twice: still one plan");
  ok((await handleEvent(event("checkout.session.completed", session), noRetrieve)) === "plan granted" && (await rowsOf(userId)).length === 1, "webhook after the confirm: still one plan");
  const unpaid = { ...session, id: `cs_conf_unpaid_${userId}`, payment_status: "unpaid" } as unknown as Stripe.Checkout.Session;
  ok((await confirmCheckout(unpaid, userId, noRetrieve)).startsWith("waiting") && (await rowsOf(userId)).length === 1, "unpaid checkout: nothing unlocked");

  const sub = subObj("active", now, now + 30 * 86_400, { metadata: { user_id: String(userId), kind: "tier1" } });
  const subSession = { id: `cs_conf_sub_${userId}`, object: "checkout.session", mode: "subscription", livemode: false, subscription: sub.id, metadata: { user_id: String(userId), kind: "tier1" } } as unknown as Stripe.Checkout.Session;
  const subDeps = { retrieveSubscription: async () => sub, cancelSubscription: noCancel };
  ok((await confirmCheckout(subSession, userId, subDeps)) === "subscription active" && (await accessFor(userId)).level === "tier1", "membership checkout: Plans unlocked at once");
  ok((await handleEvent(event("customer.subscription.created", sub), subDeps)) === "subscription active" && (await rowsOf(userId)).filter((r) => r.stripeRef === sub.id).length === 1, "webhook after: one membership row");
}

// ---------- HTTP: signature check on the running server (optional) ----------
const api = process.env["BILLING_CHECK_API"];
const whsec = process.env["BILLING_CHECK_WHSEC"];
if (api && whsec) {
  const stripe = new Stripe("sk_test_unused");
  const post = (body: string, headers: Record<string, string>) => fetch(`${api}/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  const userId = await newUser();
  const payload = JSON.stringify({ id: evId(), object: "event", type: "checkout.session.completed", livemode: false, data: { object: { id: `cs_http_${userId}`, mode: "payment", payment_status: "paid", payment_intent: `pi_http_${userId}`, customer: null, metadata: { user_id: String(userId), kind: "plan" } } } });
  ok((await post(payload, {})).status === 400, "no signature: 400");
  ok((await post(payload, { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" }) })).status === 400, "wrong secret: 400");
  const good = await post(payload, { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: whsec }) });
  const body = (await good.json()) as { outcome?: string };
  ok(good.status === 200 && body.outcome === "plan granted", "signed event: plan granted");
  ok((await accessFor(userId)).plan_credits === 1, "http: access granted");
  const live = JSON.stringify({ ...JSON.parse(payload), id: evId(), livemode: true });
  const liveRes = (await (await post(live, { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: live, secret: whsec }) })).json()) as { outcome?: string };
  ok(liveRes.outcome === "ignored: mode mismatch", "live event on a test server: ignored");
  // (this check server logs in a dev user automatically, so only input checking is tested here)
  const conf = await fetch(`${api}/billing/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: "not-a-session" }) });
  ok(conf.status === 400, "confirm refuses anything that isn't a Checkout Session id");
  const config = (await (await fetch(`${api}/config`)).json()) as { payments?: string };
  ok(config.payments === "test", "config says test mode");
} else {
  console.log("(HTTP part skipped: set BILLING_CHECK_API and BILLING_CHECK_WHSEC)");
}

console.log(`billing checks passed: ${n}`);
process.exit(0);
