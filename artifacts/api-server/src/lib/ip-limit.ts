import type { Request, Response } from "express";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { authAttemptsTable, db } from "@workspace/db";
import { devToolsOn } from "./dev-login";

/**
 * Per-network limits on the account doors. Counted in the database so they hold across restarts and servers.
 * A blocked request is not counted, so waiting out the window always works.
 */
export type IpKind = "login" | "signup" | "reset" | "draft";

const MIN = 60 * 1000;
export const IP_LIMITS: Record<IpKind, { max: number; windowMs: number }[]> = {
  login: [{ max: 30, windowMs: 15 * MIN }],
  signup: [{ max: 30, windowMs: 15 * MIN }, { max: 20, windowMs: 24 * 60 * MIN }],
  reset: [{ max: 30, windowMs: 15 * MIN }],
  // Onboarding answers before signup: unauthenticated writes, one small row each (build plan 1.11).
  draft: [{ max: 60, windowMs: 15 * MIN }],
};
const KEEP_MS = 24 * 60 * MIN;

/**
 * The caller's network. app.ts sets "trust proxy" so this is the member's address behind Replit's proxy, not the proxy's.
 * IPv6 counts by /64 (one household or phone gets a whole /64, so each address in it is not a separate network).
 */
export function clientIp(req: Request): string {
  return networkOf(req.ip ?? req.socket.remoteAddress ?? "unknown");
}

/** IPv4 (and IPv4-mapped IPv6) as is; IPv6 → its first four groups, e.g. "2001:db8:1:2::/64". Pure. */
export function networkOf(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("%")[0]!.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

const LOOPBACK = new Set(["127.0.0.1", "0:0:0:0::/64"]); // ::1 is 0:0:0:0::/64 after networkOf

/** Local checks (dev tools on, so the server only listens on this machine) create hundreds of accounts from 127.0.0.1. */
function exempt(ip: string): boolean {
  return devToolsOn() && LOOPBACK.has(ip);
}

/** Records one attempt and returns true, or answers 429 and returns false. */
export async function allowIp(req: Request, res: Response, kind: IpKind): Promise<boolean> {
  const ip = clientIp(req);
  if (exempt(ip)) return true;
  const now = Date.now();
  for (const limit of IP_LIMITS[kind]) {
    const [row] = await db
      .select({ n: count() })
      .from(authAttemptsTable)
      .where(and(eq(authAttemptsTable.ip, ip), eq(authAttemptsTable.kind, kind), gt(authAttemptsTable.at, new Date(now - limit.windowMs))));
    if ((row?.n ?? 0) >= limit.max) {
      res.setHeader("Retry-After", String(Math.ceil(limit.windowMs / 1000)));
      res.status(429).json({ message: "Too many tries from this network. Wait a while and try again." });
      return false;
    }
  }
  await db.insert(authAttemptsTable).values({ ip, kind });
  await db.delete(authAttemptsTable).where(lt(authAttemptsTable.at, new Date(now - KEEP_MS)));
  return true;
}
