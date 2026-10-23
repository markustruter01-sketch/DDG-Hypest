// Reminder email checks. LOCAL DATABASE + LOCAL API ONLY. Pure checks always run. The HTTP part needs
// REMINDERS_CHECK_API (an API started with email on, APP_BASE_URL and JOBS_TOKEN=REMINDERS_CHECK_TOKEN) and
// serves a fake mail server on REMINDERS_CHECK_SMTP_PORT.
import assert from "node:assert/strict";
import net from "node:net";
import { isDue, reminderEmail, REMIND_AFTER_DAYS } from "./reminders";
import { SCREENING } from "./screening";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };
const DAY = 86_400_000;
const now = new Date("2026-11-10T00:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

// ---------- pure ----------
ok(!isDue(ago(REMIND_AFTER_DAYS - 0.5), null, now), "active recently: not due");
ok(isDue(ago(REMIND_AFTER_DAYS), null, now), "inactive 3 days, never emailed: due");
ok(!isDue(ago(5), ago(1), now), "already emailed during this break: not due");
ok(isDue(ago(5), ago(9), now), "emailed during an earlier break: due again");
const mail = reminderEmail({ name: "Sam", coachName: "Rex", days: 4, week: 2, day: 1, title: "Upper", sessionUrl: "https://x/session/9", offUrl: "https://x/reminders/off?token=t" });
ok(mail.text.includes("https://x/session/9") && mail.text.includes("https://x/reminders/off?token=t") && mail.text.includes("Rex here"), "email: session link, off link, coach");
ok(!/\d+ ?(kg|lb|reps?|sets?)\b/i.test(mail.text), "email: no training numbers");

// ---------- HTTP ----------
const api = process.env["REMINDERS_CHECK_API"];
const token = process.env["REMINDERS_CHECK_TOKEN"];
const smtpPort = Number(process.env["REMINDERS_CHECK_SMTP_PORT"] ?? 0);
if (api && token && smtpPort) {
  const { db, usersTable, remindersTable, planSessionsTable, plansTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const mails: { to: string; body: string }[] = [];
  const smtp = net.createServer((sock) => {
    let to = "", data = false, body = "", buf = "";
    sock.write("220 fake\r\n");
    sock.on("data", (c) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === ".") { data = false; mails.push({ to, body }); body = ""; sock.write("250 ok\r\n"); } else body += line + "\n"; continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "RCPT") to = line.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, "$1");
        if (cmd === "DATA") { data = true; sock.write("354 go\r\n"); } else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); } else sock.write("250 ok\r\n");
      }
    });
  }).listen(smtpPort);
  const plain = (b: string) => b.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
  // Signup also sends a welcome email: count reminder emails only.
  const sentTo = (to: string) => mails.filter((m) => m.to === to && plain(m.body).includes("Your next one is ready"));
  const job = (auth?: string) => call("POST", "/jobs/daily", undefined, auth === undefined ? {} : { authorization: `Bearer ${auth}` });

  ok((await job()).status === 404 && (await job("x".repeat(token.length))).status === 404, "daily job hidden without the right token");

  const email = `remind-check-${Date.now()}@example.test`;
  await call("POST", "/auth/signup", { email, password: "correct horse battery", display_name: "Remind Me", adult_confirmed: true });
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  ok((await call("GET", "/me/reminders")).json.on === false, "reminders off by default");
  await call("PUT", "/me/training/profile", { coach_id: "rex", goal: "muscle", experience: "beginner", days_per_week: 3, minutes: 45, equipment: [], avoid_areas: [], health_accepted: true, screening: { answers: SCREENING.questions.map(() => false), cleared: false } });
  await call("POST", "/dev/unlock", { kind: "intro_plan" });
  const plan = await call("POST", "/me/plans");
  ok(plan.status === 201, "plan built");
  ok((await call("PUT", "/me/reminders", { on: true })).json.on === true, "reminders on");

  // Fresh plan: not due yet.
  const first = await job(token);
  ok(first.status === 200 && sentTo(email).length === 0, "active member: no email");
  // Four days without a session (plan backdated).
  await db.update(plansTable).set({ createdAt: new Date(Date.now() - 4 * DAY) }).where(eq(plansTable.id, plan.json.id));
  await job(token);
  for (let i = 0; i < 40 && sentTo(email).length === 0; i++) await new Promise((r) => setTimeout(r, 100));
  const sent = sentTo(email)[0];
  ok(sent && plain(sent.body).includes(`/session/${plan.json.sessions[0].id}`), "due member: one email with the next session link");
  ok(sent && /reminders\/off\?token=[A-Za-z0-9_-]{43}/.test(plain(sent.body)), "email carries a turn-off link");
  await job(token);
  await new Promise((r) => setTimeout(r, 300));
  ok(sentTo(email).length === 1, "one email per break");

  // Paused plan (safety stop): never emailed.
  await db.update(remindersTable).set({ lastSentAt: null }).where(eq(remindersTable.userId, u!.id));
  await db.update(plansTable).set({ status: "paused" }).where(eq(plansTable.id, plan.json.id));
  await job(token);
  await new Promise((r) => setTimeout(r, 300));
  ok(sentTo(email).length === 1, "paused plan: no email");
  await db.update(plansTable).set({ status: "active" }).where(eq(plansTable.id, plan.json.id));

  // Turn-off link works without logging in; unknown tokens get the same answer.
  const off = /reminders\/off\?token=([A-Za-z0-9_-]{43})/.exec(plain(sent!.body))![1]!;
  const anon = async (body: unknown) => (await fetch(`${api}/reminders/off`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status;
  ok((await anon({ token: "y".repeat(43) })) === 204, "unknown token: same answer");
  ok((await anon({ token: off })) === 204 && (await call("GET", "/me/reminders")).json.on === false, "turn-off link turns reminders off");

  // A session done after the email starts a new break later.
  await call("PUT", "/me/reminders", { on: true });
  await db.update(planSessionsTable).set({ completedAt: new Date(Date.now() - 5 * DAY) }).where(eq(planSessionsTable.id, plan.json.sessions[0].id));
  await job(token);
  for (let i = 0; i < 40 && sentTo(email).length < 2; i++) await new Promise((r) => setTimeout(r, 100));
  const second = sentTo(email)[1];
  ok(second && plain(second.body).includes(`/session/${plan.json.sessions[1].id}`), "next break: email points at the next session");

  ok((await call("GET", "/me/export")).json.reminder_emails?.on === true, "export shows reminder emails on");

  // Deleting the account removes the reminder setting.
  ok((await call("DELETE", "/auth/me", { password: "correct horse battery" })).status === 204, "account deleted");
  ok((await db.select().from(remindersTable).where(eq(remindersTable.userId, u!.id))).length === 0, "reminder setting deleted with the account");
  smtp.close();
} else {
  console.log("(HTTP part skipped: set REMINDERS_CHECK_API, REMINDERS_CHECK_TOKEN and REMINDERS_CHECK_SMTP_PORT)");
}
console.log(`reminders checks passed: ${n}`);
process.exit(0);
