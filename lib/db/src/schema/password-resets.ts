import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/** Password reset links. Only the SHA-256 of the token is stored; a link works once, for one hour. */
export const passwordResetsTable = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("password_resets_user").on(table.userId, table.createdAt)],
);
