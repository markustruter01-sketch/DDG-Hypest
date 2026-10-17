import { Router, type IRouter } from "express";
import { countDistinct, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { GetHomeResponse } from "@workspace/api-zod";
import { db, programsTable, purchasesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();
const TOP_CREATORS = 6;

// Public Home showcase. Real numbers only: test purchases never count as sales or payouts.
router.get("/home", async (_req, res) => {
  const live = eq(programsTable.status, "published");
  const paid = eq(purchasesTable.status, "paid");

  const [totals] = await db
    .select({ creators: countDistinct(programsTable.creatorId), livePrograms: count() })
    .from(programsTable)
    .where(live);

  // What creators kept from real sales: price minus Hypest's fee frozen on each purchase.
  const [payout] = await db
    .select({
      cents: sql<string | null>`sum(${purchasesTable.priceCents} - round(${purchasesTable.priceCents} * ${purchasesTable.commissionBps} / 10000.0))`,
      sales: count(),
    })
    .from(purchasesTable)
    .where(paid);
  const paidOut = Number(payout?.cents ?? 0);
  const ranking = (payout?.sales ?? 0) > 0 ? "sales" : "new";

  const liveCount = sql<number>`count(distinct ${programsTable.id}) filter (where ${live})`.mapWith(Number);
  const salesCount = sql<number>`count(distinct ${purchasesTable.id}) filter (where ${paid})`.mapWith(Number);
  const rows = await db
    .select({
      handle: usersTable.handle,
      displayName: usersTable.displayName,
      livePrograms: liveCount,
      sales: salesCount,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(programsTable, eq(programsTable.creatorId, usersTable.id))
    .leftJoin(purchasesTable, eq(purchasesTable.programId, programsTable.id))
    .where(isNotNull(usersTable.handle))
    .groupBy(usersTable.id)
    .having(sql`count(distinct ${programsTable.id}) filter (where ${live}) > 0`)
    .orderBy(ranking === "sales" ? desc(salesCount) : desc(usersTable.createdAt), desc(usersTable.id))
    .limit(TOP_CREATORS);

  res.json(
    GetHomeResponse.parse({
      creators: Number(totals?.creators ?? 0),
      live_programs: Number(totals?.livePrograms ?? 0),
      paid_out_cents: paidOut > 0 ? paidOut : null,
      ranking,
      top_creators: rows.map((r) => ({
        handle: r.handle ?? "",
        display_name: r.displayName,
        live_programs: r.livePrograms,
        sales: r.sales,
      })),
    }),
  );
});

export default router;
