import { Router, type IRouter, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import { db, membershipsTable } from "@workspace/db";
import { PRICES } from "../coaching/access";

/**
 * Read-only numbers for the DDG Control panel. Real money only (test-mode and dev unlocks are left out).
 * Key: DDG_STATS_KEY (Replit Secret here and in DDG Control), sent as "x-ddg-key". Unset or wrong = 404.
 */
const router: IRouter = Router();

function allowed(req: Request): boolean {
  const want = (process.env["DDG_STATS_KEY"] ?? "").trim();
  const got = (req.get("x-ddg-key") ?? "").trim();
  if (want.length < 32 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

router.get("/ddg/summary", async (req, res) => {
  if (!allowed(req)) return void res.status(404).end();
  const real = eq(membershipsTable.test, false);
  const [[oneOff], subs] = await Promise.all([
    db.select({ total: count() }).from(membershipsTable).where(and(real, inArray(membershipsTable.kind, ["intro_plan", "plan"]))),
    db.select({ kind: membershipsTable.kind, total: count() }).from(membershipsTable)
      .where(and(real, eq(membershipsTable.status, "active"), inArray(membershipsTable.kind, ["tier1", "tier2"])))
      .groupBy(membershipsTable.kind),
  ]);
  const tier1 = subs.find((s) => s.kind === "tier1")?.total ?? 0;
  const tier2 = subs.find((s) => s.kind === "tier2")?.total ?? 0;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    generatedAt: new Date().toISOString(),
    currency: "usd",
    planPurchases: oneOff?.total ?? 0,
    activeSubscribers: tier1 + tier2,
    // What the active subscriptions bring in each month at today's prices.
    monthlyRecurringCents: tier1 * PRICES.tier1_cents + tier2 * PRICES.tier2_cents,
  });
});

export default router;
