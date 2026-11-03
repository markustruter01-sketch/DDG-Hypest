import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Failed logins, one row each. Kept in the database (not server memory) so the login limit survives
 * restarts and holds across servers. Rows older than the window are deleted as new failures arrive.
 * `ip` is where the failure came from: the email lockout only counts failures from the same network,
 * so a stranger cannot lock a member out of their own account.
 */
export const authFailuresTable = pgTable(
  "auth_failures",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    ip: text("ip"),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [index("auth_failures_email_at").on(table.email, table.at), index("auth_failures_at").on(table.at)],
);

/** Every login, signup and password-reset request, by network address, for the per-network limits. Kept one day. */
export const authAttemptsTable = pgTable(
  "auth_attempts",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    kind: text("kind").notNull(),
    at: timestamp("at").notNull().defaultNow(),
  },
  (table) => [index("auth_attempts_ip_kind_at").on(table.ip, table.kind, table.at), index("auth_attempts_at").on(table.at)],
);
