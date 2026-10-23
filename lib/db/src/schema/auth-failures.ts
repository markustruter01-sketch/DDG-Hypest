import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Failed logins, one row each. Kept in the database (not server memory) so the login limit survives
 * restarts and holds across servers. Rows older than the window are deleted as new failures arrive.
 */
export const authFailuresTable = pgTable(
  "auth_failures",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [index("auth_failures_email_at").on(table.email, table.at), index("auth_failures_at").on(table.at)],
);
