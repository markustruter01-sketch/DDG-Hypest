import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Every Stripe webhook event applied, by Stripe's event id. Inserted in the same transaction as
 * the changes the event makes, so a retried or duplicated event is applied exactly once.
 */
export const billingEventsTable = pgTable("billing_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  livemode: boolean("livemode").notNull(),
  outcome: text("outcome").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});
