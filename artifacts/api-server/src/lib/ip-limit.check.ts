// Plan 1.7: fail-closed dev login and per-network limits. LOCAL DATABASE + LOCAL API ONLY.
// ACCOUNT_CHECK_API is an API started with NODE_ENV=development DEV_AUTO_LOGIN=1 (as check-all.sh does). Requests here
// carry X-Forwarded-For with test addresses, so they count like members behind the proxy (127.0.0.1 itself is exempt).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { devLoginProblem } from "./dev-login";

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n += 1; };

// ---------- the guard (no server needed) ----------
const dev = { NODE_ENV: "development", DEV_AUTO_LOGIN: "1" };
ok(devLoginProblem({ ...dev }) === null, "dev login on a plain local machine: allowed");
ok(devLoginProblem({ NODE_ENV: "production" }) === null, "no dev login: nothing to refuse");
ok(devLoginProblem({ NODE_ENV: "production", DEV_AUTO_LOGIN: "1" }) !== null, "dev login with NODE_ENV=production: refused");
for (const k of ["REPLIT_DEPLOYMENT", "REPL_ID", "REPLIT_DEV_DOMAIN", "REPLIT_DOMAINS"]) {
  ok(devLoginProblem({ ...dev, [k]: "x" })?.includes(k), `dev login on Replit (${k}): refused`);
}
ok(devLoginProblem({ ...dev, HOST: "0.0.0.0" }) !== null, "dev login bound to every interface: refused");
ok(devLoginProblem({ ...dev, HOST: "localhost" }) === null, "dev login on HOST=localhost: allowed");

// ---------- the built server really refuses to start ----------
let root = process.cwd();
while (!existsSync(path.join(root, "pnpm-workspace.yaml")) && path.dirname(root) !== root) root = path.dirname(root);
const dist = path.join(root, "artifacts/api-server/dist/index.mjs");
if (existsSync(dist)) {
  const run = spawnSync("node", [dist], {
    env: { ...process.env, NODE_ENV: "development", DEV_AUTO_LOGIN: "1", REPL_ID: "check", PORT: "8091" },
    encoding: "utf8",
    timeout: 20_000,
  });
  ok(run.status !== 0 && run.status !== null, "server with dev login on Replit exits");
  ok(`${run.stdout}${run.stderr}`.includes("Refusing to start"), "and says why");
} else {
  console.log("start-up refusal skipped: build the api first (dist/index.mjs missing)");
}

// ---------- per-network limits over HTTP ----------
const dbUrl = new URL(process.env["DATABASE_URL"] ?? "postgresql://missing");
const api = process.env["ACCOUNT_CHECK_API"] ?? "";
if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(api)) {
  console.log(`ip-limit: ${n} passed (HTTP part skipped: set a local DATABASE_URL and ACCOUNT_CHECK_API)`);
  process.exit(0);
}

const { db, authAttemptsTable, authFailuresTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

const run = `${Date.now() % 200}.${Math.floor(Math.random() * 200)}`;
const ipOf = (x: number) => `198.18.${x}.${run.split(".")[1]}`; // 198.18.0.0/15 is for testing
const call = async (ip: string, method: string, p: string, body?: unknown) => {
  const res = await fetch(`${api}${p}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await res.text();
  return res;
};

const email = `ip-check-${Date.now()}@example.test`;
const password = "correct horse battery";
const [A, B, C, D, E, F, G] = [1, 2, 3, 4, 5, 6, 7].map(ipOf) as [string, string, string, string, string, string, string];
for (const ip of [A, B, C, D, E, F, G]) await db.delete(authAttemptsTable).where(eq(authAttemptsTable.ip, ip));

ok((await call(A, "POST", "/auth/signup", { email, password, display_name: "Ip Check", adult_confirmed: true })).status === 201, "signup from network A");

// A stranger guesses the password from network B.
for (let i = 0; i < 10; i++) await call(B, "POST", "/auth/login", { email, password: "wrong" });
ok((await call(B, "POST", "/auth/login", { email, password })).status === 429, "the stranger's network is locked for that email");
const failures = await db.select().from(authFailuresTable).where(eq(authFailuresTable.email, email));
ok(failures.length === 10 && failures.every((f) => f.ip === B), "failures stored with the network they came from");
ok((await call(A, "POST", "/auth/login", { email, password })).status === 200, "the member on their own network still logs in");

// 30 logins per network per 15 minutes, whatever the email.
for (let i = 0; i < 30; i++) await call(C, "POST", "/auth/login", { email: `nobody-${i}@example.test`, password: "x" });
const blocked = await call(C, "POST", "/auth/login", { email, password });
ok(blocked.status === 429 && Number(blocked.headers.get("retry-after")) > 0, "31st login from one network: 429 with Retry-After");
ok((await call(D, "POST", "/auth/login", { email, password })).status === 200, "another network is unaffected");

// Signup: 30 per 15 minutes and 20 per day.
const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
await db.insert(authAttemptsTable).values(Array.from({ length: 19 }, () => ({ ip: E, kind: "signup", at: old })));
const signup = (ip: string, i: number) => call(ip, "POST", "/auth/signup", { email: `ip-check-${Date.now()}-${i}@example.test`, password, display_name: "Ip Check", adult_confirmed: true });
ok((await signup(E, 1)).status === 201, "20th signup today from one network: allowed");
ok((await signup(E, 2)).status === 429, "21st signup today: 429");
await db.insert(authAttemptsTable).values(Array.from({ length: 30 }, () => ({ ip: F, kind: "signup" })));
ok((await signup(F, 3)).status === 429, "31st signup in 15 minutes: 429");

// Password reset (asking for a link and using one share the limit).
for (let i = 0; i < 15; i++) await call(G, "POST", "/auth/password/forgot", { email });
for (let i = 0; i < 15; i++) await call(G, "POST", "/auth/password/reset", { token: "x".repeat(43), password });
ok((await call(G, "POST", "/auth/password/forgot", { email })).status === 429, "31st reset request from one network: 429");
ok((await call(A, "POST", "/auth/password/forgot", { email })).status !== 429, "another network can still ask for a link");

// Backstop (build plan 1.11): 100 failures for one email across many networks locks it for everyone, briefly.
{
  const { MAX_FAILURES_ALL_NETWORKS } = await import("./login-rate-limit");
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, email));
  await db.insert(authFailuresTable).values(Array.from({ length: MAX_FAILURES_ALL_NETWORKS - 1 }, (_, i) => ({ email, ip: `198.18.200.${i % 250}` })));
  ok((await call(D, "POST", "/auth/login", { email, password })).status === 200, "99 failures spread over many networks: the member still logs in");
  // (that success cleared the failures, as a real login does; the attack starts again)
  await db.insert(authFailuresTable).values(Array.from({ length: MAX_FAILURES_ALL_NETWORKS }, (_, i) => ({ email, ip: `198.18.201.${i % 250}` })));
  ok((await call(D, "POST", "/auth/login", { email, password })).status === 429, "100 failures: locked for every network, even with the right password");
  await db.delete(authFailuresTable).where(eq(authFailuresTable.email, email));
  ok((await call(D, "POST", "/auth/login", { email, password })).status === 200, "after the window: login works again");
}

// Local checks (127.0.0.1, dev tools on) are never limited.
const local = await fetch(`${api}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
ok(local.status === 200, "127.0.0.1 with dev tools on is exempt");

console.log(`ip-limit: ${n} passed`);
process.exit(0);
