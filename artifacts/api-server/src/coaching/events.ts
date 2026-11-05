import { lt } from "drizzle-orm";
import { db, eventsTable } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Conversion events (docs/TIERS-AND-BODY-SPEC.md §4.3). No IP, no email: only the names and props keys below are ever
 * stored; anything else is dropped. Never throws: an event is never worth failing a request for.
 */
export const EVENT_NAMES = [
  "onboarding_done", "trial_started", "trial_finished", "signup", "plan_built", "week1_done", "checkout_started", "paid", "cancelled",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
export const EVENT_PROPS = ["coach_id", "goal", "from_trial", "kind", "tier"] as const;
export const EVENT_KEEP_DAYS = 400;

/** Pure: only the allowed keys, and only plain values. */
export function cleanProps(props: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of EVENT_PROPS) {
    const v = props?.[k];
    if (typeof v === "boolean" || typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 40);
  }
  return out;
}

export async function recordEvent(name: EventName, opts: { userId?: number | null; draftHash?: string | null; props?: Record<string, unknown> } = {}): Promise<void> {
  if (!EVENT_NAMES.includes(name)) return;
  try {
    await db.insert(eventsTable).values({ name, userId: opts.userId ?? null, draftHash: opts.draftHash ?? null, props: cleanProps(opts.props) });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), name }, "event not recorded");
  }
}

export async function expireEvents(now = new Date()): Promise<number> {
  const gone = await db.delete(eventsTable).where(lt(eventsTable.at, new Date(now.getTime() - EVENT_KEEP_DAYS * 86_400_000))).returning({ id: eventsTable.id });
  return gone.length;
}
