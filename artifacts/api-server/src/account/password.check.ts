// Password change / reset checks. LOCAL DATABASE + LOCAL APIs ONLY. Serves a fake mail server (SMTP) on
// PASSWORD_CHECK_SMTP_PORT; PASSWORD_CHECK_API is an API started with EMAIL_SMTP_URL=smtp://localhost:<that port>,
// EMAIL_FROM and APP_BASE_URL set. ACCOUNT_CHECK_API (email off) is used for the "not set up" answer.
import assert from "node:assert/strict";
import net from "node:net";

const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) throw new Error(`refusing: DATABASE_URL is not a local database (${dbUrl.hostname})`);
const api = process.env["PASSWORD_CHECK_API"];
const smtpPort = Number(process.env["PASSWORD_CHECK_SMTP_PORT"] ?? 0);
const offApi = process.env["ACCOUNT_CHECK_API"];
if (!api || !smtpPort || !offApi) {
  console.log("password checks skipped: set PASSWORD_CHECK_API, PASSWORD_CHECK_SMTP_PORT and ACCOUNT_CHECK_API");
  process.exit(0);
}

const { db, usersTable, passwordResetsTable, coachMessagesTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- a minimal mail server that keeps every message ----------
const mail: { to: string; body: string }[] = [];
const smtp = net.createServer((sock) => {
  let to = "", data = false, body = "";
  sock.write("220 fake ESMTP\r\n");
  let buf = "";
  sock.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") { data = false; mail.push({ to, body }); body = ""; sock.write("250 queued\r\n"); } else body += line + "\n";
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO" || cmd === "HELO") sock.write("250 fake\r\n");
      else if (cmd === "MAIL") sock.write("250 ok\r\n");
      else if (cmd === "RCPT") { to = line.replace(/^RCPT TO:\s*<?([^>]*)>?.*$/i, "$1"); sock.write("250 ok\r\n"); }
      else if (cmd === "DATA") { data = true; sock.write("354 go\r\n"); }
      else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
      else sock.write("250 ok\r\n");
    }
  });
}).listen(smtpPort);

function browser(base: string) {
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(";")[0]!.split("="); if (v) jar.set(k!, v); else jar.delete(k!); }
    const t = await r.text();
    return { status: r.status, json: t ? JSON.parse(t) : null };
  };
}
const waitForMail = async (count: number) => { for (let i = 0; i < 40 && resets().length < count; i++) await new Promise((r) => setTimeout(r, 100)); };
const resets = () => mail.filter((m) => plain(m.body).includes("reset?token="));
/** Undo quoted-printable (how mail clients wrap long lines) so the link can be read. */
const plain = (body: string) => body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
const tokenIn = (body: string) => /reset\?token=([A-Za-z0-9_-]{43})/.exec(plain(body))?.[1] ?? null;

const email = `pw-check-${Date.now()}@example.test`;
const first = "first password 123";
const second = "second password 456";
const third = "third password 789";
const A = browser(api);
ok((await A("POST", "/auth/signup", { email, password: first, display_name: "PW Check", adult_confirmed: true })).status === 201, "signup");
ok((await A("GET", "/config")).json.email === true, "config: email on");
for (let i = 0; i < 40 && !mail.some((m) => m.to === email); i++) await new Promise((r) => setTimeout(r, 100));
ok(mail.some((m) => m.to === email && plain(m.body).includes("Your account is ready")), "welcome email on signup");
ok((await browser(offApi)("GET", "/config")).json.email === false, "config: email off without settings");

// ---------- change password ----------
const B = browser(api);
ok((await B("POST", "/auth/login", { email, password: first })).status === 200, "second device logged in");
ok((await A("PUT", "/auth/password", { current_password: "wrong", new_password: second })).status === 403, "wrong current password refused");
ok((await A("PUT", "/auth/password", { current_password: first, new_password: "short" })).status === 400, "short new password refused");
ok((await A("PUT", "/auth/password", { current_password: first, new_password: second })).status === 204, "password changed");
ok((await A("GET", "/auth/me")).json?.email === email, "this device stays logged in");
ok((await B("GET", "/auth/me")).json?.email !== email, "other device logged out");
ok((await browser(api)("POST", "/auth/login", { email, password: second })).status === 200, "new password works");

// ---------- forgot / reset ----------
ok((await browser(offApi)("POST", "/auth/password/forgot", { email })).status === 503, "email off: says how to get help");
const unknown = await browser(api)("POST", "/auth/password/forgot", { email: `nobody-${Date.now()}@example.test` });
await new Promise((r) => setTimeout(r, 300));
ok(unknown.status === 202 && resets().length === 0, "unknown email: same answer, no email sent");
const asked = await browser(api)("POST", "/auth/password/forgot", { email });
await waitForMail(1);
ok(asked.status === 202 && asked.json.message === unknown.json.message, "known email: same answer");
ok(resets().length === 1 && resets()[0]!.to === email, "reset email sent to the account");
const token = tokenIn(resets()[0]!.body);
ok(token !== null && plain(resets()[0]!.body).includes("http://localhost:5199/reset?token="), "link uses the site's own address");
const [stored] = await db.select().from(passwordResetsTable).where(eq(passwordResetsTable.tokenHash, token!));
ok(stored === undefined, "only a hash of the token is stored");

const C = browser(api);
const reset = await C("POST", "/auth/password/reset", { token, password: third });
ok(reset.status === 200 && reset.json.email === email, "reset works and logs in");
ok((await A("GET", "/auth/me")).json?.email !== email, "every old session logged out");
ok((await C("POST", "/auth/password/reset", { token, password: "another password 1" })).status === 400, "link works once");
ok((await browser(api)("POST", "/auth/login", { email, password: second })).status === 401, "old password no longer works");
ok((await browser(api)("POST", "/auth/login", { email, password: third })).status === 200, "new password works");
ok((await C("POST", "/auth/password/reset", { token: "x".repeat(43), password: "another password 1" })).status === 400, "made-up token refused");

// Expired link
await browser(api)("POST", "/auth/password/forgot", { email });
await waitForMail(2);
const late = tokenIn(resets()[1]!.body);
const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
await db.update(passwordResetsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(passwordResetsTable.userId, u!.id));
ok((await browser(api)("POST", "/auth/password/reset", { token: late, password: "another password 1" })).status === 400, "expired link refused");

// Limit: 3 links an hour per account (2 sent so far)
await browser(api)("POST", "/auth/password/forgot", { email });
await waitForMail(3);
await browser(api)("POST", "/auth/password/forgot", { email });
await new Promise((r) => setTimeout(r, 500));
ok(resets().length === 3, "4th request in an hour sends nothing");

// ---------- delete account also removes chat and reset links ----------
await db.insert(coachMessagesTable).values({ userId: u!.id, coachId: "rex", role: "member", text: "hello" });
const D = browser(api);
await D("POST", "/auth/login", { email, password: third });
ok((await D("DELETE", "/auth/me", { password: third })).status === 204, "account deleted");
ok((await db.select().from(coachMessagesTable).where(eq(coachMessagesTable.userId, u!.id))).length === 0, "chat deleted");
ok((await db.select().from(passwordResetsTable).where(eq(passwordResetsTable.userId, u!.id))).length === 0, "reset links deleted");

smtp.close();
console.log(`password checks passed: ${n}`);
process.exit(0);
