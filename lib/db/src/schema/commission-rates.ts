import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const commissionRatesTable = pgTable(
  "commission_rates",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull().unique(),
    commissionBps: integer("commission_bps").notNull(),
  },
  (table) => [
    check(
      "commission_rates_source_check",
      sql`${table.source} in ('creator_brought', 'hypest_found')`,
    ),
    check(
      "commission_rates_bps_check",
      sql`${table.commissionBps} between 0 and 10000`,
    ),
  ],
);
