import { logger } from "./logger";

/**
 * Alerts to Markus's phone through the same Discord webhook Finance uses (Markus, 24 Oct 2026: one chat for
 * all alerts). Every message starts with [Hypest]. Off until DISCORD_WEBHOOK_URL is set in Replit Secrets.
 * Never include personal details (emails, names, messages): member ids only. Never throws.
 */
export type Level = "critical" | "warning" | "info";

const QUIET_MS = 10 * 60 * 1000; // the same alert at most once every 10 minutes
const lastSent = new Map<string, number>();

export function alertText(level: Level, title: string, detail?: string): string {
  const head = `**[Hypest] ${level.toUpperCase()}** ${title}`;
  return (detail ? `${head}\n${detail}` : head).slice(0, 1900);
}

export async function alert(level: Level, title: string, detail?: string): Promise<void> {
  const url = (process.env["DISCORD_WEBHOOK_URL"] ?? "").trim();
  if (!url) return;
  const now = Date.now();
  if ((lastSent.get(title) ?? 0) > now - QUIET_MS) return;
  lastSent.set(title, now);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: alertText(level, title, detail), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) logger.warn({ status: res.status }, "alert not delivered");
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "alert not delivered");
  }
}
