import { and, eq, gt, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { db, membershipsTable } from "@workspace/db";

/**
 * Prices approved by Markus, 5 Nov 2026 (docs/TIERS-AND-BODY-SPEC.md §1, after the pricing audit). Single source: the
 * web app reads them via /config. US$ cents; `aud` = Australian prices in cents, GST included. One-off plans
 * (intro_plan, plan) are no longer sold; their prices stay for the credits members already hold.
 */
export const PRICES = {
  intro_plan_cents: 250,
  plan_cents: 499,
  tier1_cents: 499,
  tier2_cents: 1299,
  tier3_cents: 1999,
  tier1_yearly_cents: 3499,
  tier2_yearly_cents: 7999,
  tier3_yearly_cents: 11999,
  aud: {
    tier1_cents: 799,
    tier2_cents: 1999,
    tier3_cents: 2999,
    tier1_yearly_cents: 5499,
    tier2_yearly_cents: 11999,
    tier3_yearly_cents: 17999,
  },
} as const;

/** none = Free; plan = legacy one-off credit (Free's allowances); tier1 = Starter; tier2 = Coaching; tier3 = Pro. */
export type Level = "none" | "plan" | "tier1" | "tier2" | "tier3";
export const PAID_MONTHLY = ["tier1", "tier2", "tier3"] as const;

export type Access = {
  level: Level;
  /** The 50%-off first plan has never been used by this person. */
  intro_available: boolean;
  /** Unused one-off plans (intro or full price). */
  plan_credits: number;
  /** The membership row a new plan would use: a credit id, or null when covered by a subscription. */
  creditId: number | null;
};

export async function accessFor(userId: number, now = new Date()): Promise<Access> {
  const rows = await db
    .select()
    .from(membershipsTable)
    .where(
      and(
        eq(membershipsTable.userId, userId),
        eq(membershipsTable.status, "active"),
        or(isNull(membershipsTable.endsAt), gt(membershipsTable.endsAt, now)),
      ),
    );
  const [anyIntro] = await db
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.kind, "intro_plan")))
    .limit(1);

  const credits = rows.filter((r) => (r.kind === "intro_plan" || r.kind === "plan") && r.usedAt === null);
  const hasTier3 = rows.some((r) => r.kind === "tier3");
  const hasTier2 = rows.some((r) => r.kind === "tier2");
  const hasTier1 = rows.some((r) => r.kind === "tier1");
  const ownsPlan = rows.some((r) => r.kind === "intro_plan" || r.kind === "plan");
  const level: Level = hasTier3 ? "tier3" : hasTier2 ? "tier2" : hasTier1 ? "tier1" : ownsPlan ? "plan" : "none";

  return {
    level,
    intro_available: !anyIntro,
    plan_credits: credits.length,
    creditId: hasTier1 || hasTier2 || hasTier3 ? null : credits.at(0)?.id ?? null,
  };
}

/** A new block every 4 weeks: Starter, Coaching, Pro. */
export const canAutoNext = (a: Access) => a.level === "tier1" || a.level === "tier2" || a.level === "tier3";
/** Spec 3.1 §4.1: loads from the logs, "This hurts" swaps, the agent's swap and load tools, the lighter rough-morning day. */
export const canAdapt = (a: Access) => a.level === "tier2" || a.level === "tier3";

/**
 * Spec 3.1 §1/§4.1: is this whole block open to the member, or only week 1 (Free)? Computed, never stored: a block is
 * fully open while the member pays, and stays open after a lapse if they paid at any time during its life: a monthly
 * tier that overlapped it (upgrade mid-block included), or the one-off credit that built it (not refunded).
 */
export async function blockAccess(userId: number, plan: { createdAt: Date }, access: Access, now = new Date()): Promise<"full" | "week1"> {
  if (canAutoNext(access)) return "full";
  const built = plan.createdAt.getTime();
  const paid = await db
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(and(
      eq(membershipsTable.userId, userId),
      or(
        and(inArray(membershipsTable.kind, [...PAID_MONTHLY]), lte(membershipsTable.startsAt, now),
          or(isNull(membershipsTable.endsAt), gt(membershipsTable.endsAt, plan.createdAt))),
        and(inArray(membershipsTable.kind, ["intro_plan", "plan"]), ne(membershipsTable.status, "ended"),
          gte(membershipsTable.usedAt, new Date(built - 60_000)), lte(membershipsTable.usedAt, new Date(built + 60_000))),
      ),
    ))
    .limit(1);
  return paid.length ? "full" : "week1";
}
