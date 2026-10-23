import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { usersTable } from "./users";

/**
 * Email reminders, opt-in. A row means "on"; turning them off deletes it. token = the random secret in each
 * email's "turn these off" link (only able to turn reminders off). lastSentAt keeps it to one email per break.
 */
export const remindersTable = pgTable("reminders", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id),
  token: text("token").notNull().unique(),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
