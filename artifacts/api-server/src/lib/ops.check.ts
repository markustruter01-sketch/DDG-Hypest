// Alerts + admin checks. LOCAL DATABASE + LOCAL API ONLY. Serves a fake Discord webhook on OPS_CHECK_HOOK_PORT;
// OPS_CHECK_API is an API started with DISCORD_WEBHOOK_URL=http://localhost:<that port>/hook and
// ADMIN_EMAILS=<OPS_CHECK_ADMIN>.
import assert from "node:assert/strict";
import http from "node:http";
import { alertText } from "./alerts";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

ok(alertText("critical", "Server error: GET /x", "boom").startsWith("**[Hypest] CRITICAL** Server error"), "alerts are labelled Hypest");
ok(alertText("info", "t", "x".repeat(5000)).length === 1900, "long alerts are cut to fit Discord");

const api = process.env["OPS_CHECK_API"];
const hookPort = Number(process.env["OPS_CHECK_HOOK_PORT"] ?? 0);
const admin = process.env["OPS_CHECK_ADMIN"];
if (api && hookPort && admin) {
  const posts: string[] = [];
  const hook = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { posts.push((JSON.parse(raw) as { content: string }).content); res.writeHead(204); res.end(); });
  }).listen(hookPort);
  const settle = () => new Promise((r) => setTimeout(r, 400));

  function browser() {
    const jar = new Map<string, string>();
    return async (method: string, path: string, body?: unknown, rawBody?: string) => {
      const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
      for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
      const t = await r.text();
      let json: any = null; try { json = t ? JSON.parse(t) : null; } catch { json = { raw: t }; }
      return { status: r.status, json, type: r.headers.get("content-type") ?? "" };
    };
  }
  const answers = { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: ["dumbbells"], avoid_areas: [], health_accepted: true };

  // Member: safety stop sends one alert, with no personal details
  const M = browser();
  const memberEmail = `ops-member-${Date.now()}@example.test`;
  const signed = await M("POST", "/auth/signup", { email: memberEmail, password: "correct horse battery", display_name: "Ops Member", adult_confirmed: true });
  ok(signed.status === 201, "member signup");
  await M("PUT", "/me/training/profile", answers);
  await M("POST", "/dev/unlock", { kind: "intro_plan" });
  const plan = await M("POST", "/me/plans");
  const itemId = plan.json.sessions[0].items[0].id as number;
  ok((await M("POST", `/me/items/${itemId}/hurts`, { text: "sharp pain" })).json.stopped === true, "safety stop");
  await M("POST", "/me/plans/resume");
  await M("POST", `/me/items/${itemId}/hurts`, { text: "sharp pain again" });
  await settle();
  const stops = posts.filter((p) => p.includes(`Safety stop: member #${signed.json.id}`));
  ok(stops.length === 1, "one alert per member per 10 minutes");
  ok(stops[0]!.startsWith("**[Hypest] INFO**") && !stops[0]!.includes(memberEmail) && !stops[0]!.includes("Ops Member"), "alert labelled, no email or name");

  // Bad JSON: 400 as JSON, no stack, no alert
  const before = posts.length;
  const badJson = await M("POST", "/me/training/units", undefined, "{not json");
  await settle();
  ok(badJson.status === 400 && badJson.type.includes("application/json") && typeof badJson.json?.message === "string" && !/node_modules|\n\s+at /.test(JSON.stringify(badJson.json)), "bad JSON: clean 400");
  ok(posts.length === before, "4xx sends no alert");
  const lost = await M("GET", "/no-such-route");
  ok(lost.status === 404 && lost.type.includes("application/json") && lost.json?.message === "Not found", "unknown API route: JSON 404");

  // Admin: hidden from members, visible to ADMIN_EMAILS
  ok((await M("GET", "/admin/summary")).status === 404, "admin hidden from members (404)");
  ok((await browser()("GET", "/admin/summary")).status === 401 || (await browser()("GET", "/admin/summary")).status === 404, "admin hidden when logged out / dev user");
  const A = browser();
  await A("POST", "/auth/signup", { email: admin, password: "correct horse battery", display_name: "Owner", adult_confirmed: true });
  const s = await A("GET", "/admin/summary");
  ok(s.status === 200 && s.json.members.total >= 2 && s.json.switches.alerts === true, "admin summary for the owner");
  ok(s.json.paused_plans.some((p: { member_id: number }) => p.member_id === signed.json.id), "paused plan listed");
  ok(s.json.memberships.find((m: { kind: string }) => m.kind === "intro_plan").test >= 1, "test memberships counted separately");
  ok(!JSON.stringify(s.json).includes(memberEmail), "no member emails in the summary");
  hook.close();
} else {
  console.log("(HTTP part skipped: set OPS_CHECK_API, OPS_CHECK_HOOK_PORT and OPS_CHECK_ADMIN)");
}
// Startup tidy: expired logins and reset links go, live ones stay. LOCAL DATABASE ONLY.
{
  const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
  if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);
  const { db, usersTable, sessionsTable, passwordResetsTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { tidyExpired } = await import("./tidy");
  const [u] = await db.insert(usersTable).values({ email: `tidy-${Date.now()}@example.test`, passwordHash: "x", displayName: "Tidy", adultConfirmedAt: new Date() }).returning({ id: usersTable.id });
  const past = new Date(Date.now() - 60_000), future = new Date(Date.now() + 3_600_000), tag = `${Date.now()}`;
  await db.insert(sessionsTable).values([{ userId: u!.id, tokenHash: `old-${tag}`, expiresAt: past }, { userId: u!.id, tokenHash: `live-${tag}`, expiresAt: future }]);
  await db.insert(passwordResetsTable).values([{ userId: u!.id, tokenHash: `old-${tag}`, expiresAt: past }, { userId: u!.id, tokenHash: `live-${tag}`, expiresAt: future }]);
  await tidyExpired();
  const s = await db.select({ t: sessionsTable.tokenHash }).from(sessionsTable).where(eq(sessionsTable.userId, u!.id));
  const r = await db.select({ t: passwordResetsTable.tokenHash }).from(passwordResetsTable).where(eq(passwordResetsTable.userId, u!.id));
  ok(s.length === 1 && s[0]!.t === `live-${tag}` && r.length === 1 && r[0]!.t === `live-${tag}`, "tidy: expired logins and reset links deleted, live ones kept");
}
console.log(`ops checks passed: ${n}`);
process.exit(0);
