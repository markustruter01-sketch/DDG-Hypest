import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, membershipsTable } from "@workspace/db";

/** Prices approved by Markus, 18 Oct 2026 (US$). Single source: the web app reads them via /config. */
export const PRICES = {
  intro_plan_cents: 250,
  plan_cents: 499,
  tier1_cents: 399,
  tier2_cents: 999,
} as const;

export type Level = "none" | "plan" | "tier1" | "tier2";

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
  const hasTier2 = rows.some((r) => r.kind === "tier2");
  const hasTier1 = rows.some((r) => r.kind === "tier1");
  const ownsPlan = rows.some((r) => r.kind === "intro_plan" || r.kind === "plan");
  const level: Level = hasTier2 ? "tier2" : hasTier1 ? "tier1" : ownsPlan ? "plan" : "none";

  return {
    level,
    intro_available: !anyIntro,
    plan_credits: credits.length,
    creditId: hasTier1 || hasTier2 ? null : credits.at(0)?.id ?? null,
  };
}

export const canLog = (a: Access) => a.level === "tier2";
export const canAutoNext = (a: Access) => a.level === "tier1" || a.level === "tier2";
