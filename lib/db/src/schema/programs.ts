import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { usersTable } from "./users";

export const programsTable = pgTable(
  "programs",
  {
    id: serial("id").primaryKey(),
    creatorId: integer("creator_id")
      .notNull()
      .references(() => usersTable.id),
    title: text("title").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "programs_title_length",
      sql`char_length(${table.title}) between 1 and 120`,
    ),
    check(
      "programs_description_length",
      sql`${table.description} is null or char_length(${table.description}) <= 2000`,
    ),
    check("programs_price_cents_min", sql`${table.priceCents} >= 500`),
    check(
      "programs_status_check",
      sql`${table.status} in ('draft', 'published')`,
    ),
  ],
);
