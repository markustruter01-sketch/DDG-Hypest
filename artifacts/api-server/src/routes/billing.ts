import { Router, type IRouter, type Request, type RequestHandler, type Response } from "express";
import { eq } from "drizzle-orm";
import { ConfirmCheckoutBody, ConfirmCheckoutResponse, CreateBillingPortalBody, CreateBillingPortalResponse, CreateCheckoutBody, CreateCheckoutResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { authUser, requireUser } from "../middleware/require-user";
import { paymentsMode, stripeClient, webhookSecret } from "../lib/stripe";
import { accessFor } from "../coaching/access";
import { checkoutBlocked, checkoutParams, safeReturnUrl } from "../billing/checkout";
import { confirmCheckout, handleEvent } from "../billing/sync";
import { alert } from "../lib/alerts";
import { recordEvent } from "../coaching/events";

const router: IRouter = Router();

/** The site a return URL may point at: APP_BASE_URL if set, else the requesting page's origin. */
const allowedOrigin = (req: Request) => (process.env["APP_BASE_URL"] ?? "").trim() || req.get("origin");

function paymentsOff(res: Response) {
  res.status(503).json({ message: "Payments are off" });
}

/** A Stripe call failed (network, bad key, Stripe down): log it, tell the member plainly. Nothing was charged. */
function stripeFailed(req: Request, res: Response, err: unknown) {
  req.log.error({ err }, "stripe call failed");
  void alert("critical", "Stripe call failed (checkout or portal)", err instanceof Error ? err.message : String(err));
  res.status(502).json({ message: "Payments are unavailable right now. You weren't charged. Try again in a minute." });
}

router.post("/billing/checkout", requireUser, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return paymentsOff(res);
  const body = CreateCheckoutBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  const returnUrl = safeReturnUrl(body.data.return_url, allowedOrigin(req));
  if (!returnUrl) return void res.status(400).json({ message: "return_url must be a page on this site" });

  const user = authUser(res);
  const { kind } = body.data;
  const access = await accessFor(user.id);
  const blocked = checkoutBlocked(kind, access);
  if (blocked) return void res.status(409).json({ message: blocked });
  const [row] = await db.select({ email: usersTable.email, customer: usersTable.stripeCustomerId }).from(usersTable).where(eq(usersTable.id, user.id));
  if (!row) return void res.status(401).json({ message: "unauthorized" });

  try {
    const session = await stripe.checkout.sessions.create(
      checkoutParams({ kind, userId: user.id, email: row.email, customerId: row.customer, returnUrl }),
    );
    if (!session.url) throw new Error("Stripe returned a Checkout Session without a url");
    void recordEvent("checkout_started", { userId: user.id, props: { kind } });
    res.json(CreateCheckoutResponse.parse({ url: session.url }));
  } catch (err) {
    stripeFailed(req, res, err);
  }
});

router.post("/billing/portal", requireUser, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return paymentsOff(res);
  const body = CreateBillingPortalBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  const returnUrl = safeReturnUrl(body.data.return_url, allowedOrigin(req));
  if (!returnUrl) return void res.status(400).json({ message: "return_url must be a page on this site" });

  const user = authUser(res);
  const [row] = await db.select({ customer: usersTable.stripeCustomerId }).from(usersTable).where(eq(usersTable.id, user.id));
  if (!row?.customer) return void res.status(409).json({ message: "No billing account yet" });
  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: row.customer, return_url: returnUrl });
    res.json(CreateBillingPortalResponse.parse({ url: portal.url }));
  } catch (err) {
    stripeFailed(req, res, err);
  }
});

/** Back from Checkout: unlock at once from the session Stripe holds (see billing/sync.ts confirmCheckout). */
router.post("/billing/confirm", requireUser, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return paymentsOff(res);
  const body = ConfirmCheckoutBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: "invalid checkout" });
  const user = authUser(res);
  try {
    const session = await stripe.checkout.sessions.retrieve(body.data.session_id);
    if (session.livemode !== (paymentsMode() === "live")) return void res.status(404).json({ message: "checkout not found" });
    const outcome = await confirmCheckout(session, user.id, billingDeps(stripe));
    if (outcome === "not yours") return void res.status(404).json({ message: "checkout not found" });
    req.log.info({ session: session.id, outcome }, "checkout confirmed");
    const access = await accessFor(user.id);
    res.json(ConfirmCheckoutResponse.parse({ outcome, access: { level: access.level, intro_available: access.intro_available, plan_credits: access.plan_credits } }));
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return void res.status(404).json({ message: "checkout not found" });
    stripeFailed(req, res, err);
  }
});

/** What sync.ts needs from Stripe. One place for both the webhook and the return-from-checkout path. */
function billingDeps(stripe: NonNullable<ReturnType<typeof stripeClient>>) {
  return {
    retrieveSubscription: (id: string) => stripe.subscriptions.retrieve(id),
    cancelSubscription: async (id: string) => {
      // Already cancelled (e.g. a retried event) counts as done; any error throws so Stripe retries the event.
      if ((await stripe.subscriptions.retrieve(id)).status === "canceled") return;
      await stripe.subscriptions.cancel(id, { prorate: true, invoice_now: true });
    },
  };
}

/**
 * POST /api/billing/webhook. Mounted in app.ts BEFORE express.json (the signature is over the raw body).
 * 400 = bad signature (never retried usefully); 500 = our failure (Stripe retries for up to 3 days).
 */
export const billingWebhook: RequestHandler = async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return void res.status(503).json({ message: "Payments are off" });
  const signature = req.get("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) return void res.status(400).json({ message: "missing signature" });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret());
  } catch {
    req.log.warn("stripe webhook: bad signature");
    void alert("warning", "Stripe webhook with a bad signature", "Check STRIPE_WEBHOOK_SECRET matches the endpoint in Stripe.");
    return void res.status(400).json({ message: "bad signature" });
  }
  if (event.livemode !== (paymentsMode() === "live")) {
    req.log.warn({ type: event.type, livemode: event.livemode }, "stripe webhook: mode mismatch, ignored");
    return void res.json({ received: true, outcome: "ignored: mode mismatch" });
  }
  try {
    const outcome = await handleEvent(event, billingDeps(stripe));
    req.log.info({ event: event.id, type: event.type, outcome }, "stripe webhook");
    res.json({ received: true, outcome });
  } catch (err) {
    req.log.error({ err, event: event.id, type: event.type }, "stripe webhook failed");
    void alert("critical", "Stripe webhook failed: access may be out of date", `${event.type} ${event.id}. Stripe retries; see the API log.`);
    res.status(500).json({ message: "webhook failed" });
  }
};

export default router;
