// DDG Control summary checks. LOCAL DATABASE + LOCAL API ONLY. Needs DDG_CHECK_API (an API started with
// DDG_STATS_KEY=DDG_CHECK_KEY). Adds one real and one test membership, then checks only the real one counts.
import assert from "node:assert/strict";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };
const api = process.env["DDG_CHECK_API"];
const key = process.env["DDG_CHECK_KEY"];

if (api && key) {
  const get = (k?: string) => fetch(`${api}/ddg/summary`, { headers: k ? { "x-ddg-key": k } : {} });
  ok((await get()).status === 404, "no key: invisible (404)");
  ok((await get(key.replace(/.$/, "x"))).status === 404, "wrong key: invisible (404)");

  const read = async () => (await (await get(key)).json()) as Record<string, unknown>;
  const before = await read();
  ok(JSON.stringify(Object.keys(before).sort()) === JSON.stringify(["activeSubscribers", "currency", "generatedAt", "monthlyRecurringCents", "planPurchases"]),
    "summary has exactly the agreed fields");
  ok(before["currency"] === "usd", "prices are US$");

  const { db, usersTable, membershipsTable } = await import("@workspace/db");
  const { PRICES } = await import("../coaching/access");
  const [u] = await db.insert(usersTable).values({ email: `ddg-check-${Date.now()}@example.test`, passwordHash: "x", displayName: "DDG check", adultConfirmedAt: new Date() }).returning();
  await db.insert(membershipsTable).values([
    { userId: u!.id, kind: "tier2", status: "active", test: false },
    { userId: u!.id, kind: "tier1", status: "active", test: true },
    { userId: u!.id, kind: "plan", status: "active", test: false },
  ]);
  const after = await read();
  ok((after["activeSubscribers"] as number) - (before["activeSubscribers"] as number) === 1, "one real subscriber added; test-mode one ignored");
  ok((after["planPurchases"] as number) - (before["planPurchases"] as number) === 1, "one real plan purchase added");
  ok((after["monthlyRecurringCents"] as number) - (before["monthlyRecurringCents"] as number) === PRICES.tier2_cents, "Coaching adds its monthly price");
} else {
  console.log("(HTTP part skipped: set DDG_CHECK_API and DDG_CHECK_KEY)");
}
console.log(`ddg summary checks passed: ${n}`);
process.exit(0);
