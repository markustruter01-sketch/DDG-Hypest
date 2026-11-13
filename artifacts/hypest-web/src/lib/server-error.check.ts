// No-signal wording checks. Pure. Run from repo root:
// pnpm --filter @workspace/scripts exec tsx ../artifacts/hypest-web/src/lib/server-error.check.ts
import assert from "node:assert/strict";
import { isNoSignal, NO_SIGNAL_TEXT, serverErrorText } from "./server-error";

let n = 0;
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); n += 1; };

eq(isNoSignal(new TypeError("Failed to fetch")), true, "Chrome network failure");
eq(isNoSignal(new TypeError("Load failed")), true, "Safari network failure");
eq(serverErrorText(new TypeError("Failed to fetch")), NO_SIGNAL_TEXT, "plain words, not 'Failed to fetch'");
eq(isNoSignal(new TypeError("customFetch: GET requests cannot have a body.")), false, "a coding error is not no signal");
eq(isNoSignal(Object.assign(new Error("HTTP 500"), { status: 500 })), false, "the server answered");
eq(serverErrorText({ status: 402, data: { message: "Upgrade to log this week." } }), "Upgrade to log this week.", "server message kept");
console.log(`server error: ${n} checks passed`);
