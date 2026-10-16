import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { programsTable } from "./programs";
import { usersTable } from "./users";

/**
 * One row per buyer per program. A row is what grants access to the lessons.
 * The commission source and rate are frozen at the moment of sale.
 * status 'test' = dev-only test purchase (no money moved).
 */
export const purchasesTable = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
    programId: integer("program_id").notNull().references(() => programsTable.id),
    priceCents: integer("price_cents").notNull(),
    commissionSource: text("commission_source").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("purchases_buyer_program_unique").on(table.buyerId, table.programId),
    check("purchases_source_check", sql`${table.commissionSource} in ('creator_brought', 'hypest_found')`),
    check("purchases_bps_check", sql`${table.commissionBps} between 0 and 10000`),
    check("purchases_status_check", sql`${table.status} in ('paid', 'test')`),
    check("purchases_price_check", sql`${table.priceCents} >= 0`),
  ],
);
