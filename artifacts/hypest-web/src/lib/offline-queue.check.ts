// Offline set-log queue checks (build plan 1.6). Pure. Run from repo root:
// pnpm --filter @workspace/scripts exec tsx ../artifacts/hypest-web/src/lib/offline-queue.check.ts
import assert from "node:assert/strict";
import { createQueue, memoryStore, outcomeOf, type QueuedSet, type SendOutcome } from "./offline-queue";

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n += 1; };
const body = (reps: number) => ({ reps, seconds: null, load_kg: 40 });

const run = async () => {
  // No signal: everything stays; signal back: sent oldest first.
  let online = false;
  const sent: string[] = [];
  const q = createQueue(memoryStore(), async (e: QueuedSet): Promise<SendOutcome> => { if (!online) return "retry"; sent.push(`${e.key}=${e.body.reps}`); return "sent"; });
  await q.add(1, 1, body(8), 1);
  await q.add(1, 2, body(8), 2);
  await q.add(1, 1, body(10), 3); // member corrected set 1: the newest numbers win, one entry
  ok((await q.pending()).length === 2, "re-ticking a set replaces its entry");
  ok((await q.flush()).left === 2 && sent.length === 0, "offline: nothing lost, nothing sent");
  online = true;
  const r = await q.flush();
  ok(r.sent === 2 && r.left === 0, "online: all sent");
  ok(sent[0] === "1:2=8" && sent[1] === "1:1=10", "oldest first, latest numbers");

  // A refused set (e.g. 402 after the membership ended) is dropped, not retried forever; a retry stops the run.
  const outcomes: SendOutcome[] = ["drop", "retry"];
  const q2 = createQueue(memoryStore(), async () => outcomes.shift() ?? "sent");
  await q2.add(2, 1, body(5), 1); await q2.add(2, 2, body(5), 2); await q2.add(2, 3, body(5), 3);
  const r2 = await q2.flush();
  ok(r2.dropped === 1 && r2.sent === 0 && r2.left === 2, "refused dropped; retry stops the run, rest kept in order");

  // Two flushes at once (online event + timer) send each set once.
  let calls = 0;
  const q3 = createQueue(memoryStore(), async () => { calls += 1; await new Promise((res) => setTimeout(res, 5)); return "sent"; });
  await q3.add(3, 1, body(5), 1);
  await Promise.all([q3.flush(), q3.flush()]);
  ok(calls === 1, "concurrent flushes don't double-send");

  // Build plan 1.11: a shared phone. A's sets wait for A; B's login never sends (or loses) them.
  {
    let who: number | null = 1;
    const sentBy: string[] = [];
    const q4 = createQueue(memoryStore(), async (e) => { sentBy.push(`${who}:${e.key}`); return who === e.userId ? "sent" : "drop"; }, () => who);
    await q4.add(4, 1, body(5), 1); // A, logged in, no signal
    who = null; // A logs out
    ok((await q4.pending()).length === 0 && (await q4.flush()).sent === 0 && sentBy.length === 0, "logged out: nothing shown, nothing sent");
    who = 2; // B logs in on the same phone
    await q4.add(5, 1, body(6), 2);
    ok((await q4.pending()).join() === "5:1", "B sees only B's waiting set");
    const r4 = await q4.flush();
    ok(r4.sent === 1 && r4.dropped === 0 && sentBy.join() === "2:5:1", "B's flush sends only B's set; A's is never sent as B");
    who = 1; // A again
    const r5 = await q4.flush();
    ok(r5.sent === 1 && sentBy.at(-1) === "1:4:1", "A's set goes up when A logs in again");
    const legacy = memoryStore();
    await legacy.put({ key: "6:1", itemId: 6, setNumber: 1, body: body(1), queuedAt: 1 }); // queued before owners existed
    ok((await createQueue(legacy, async () => "sent", () => 7).flush()).sent === 1, "entries from before 1.11 go with whoever is logged in");
  }

  ok(outcomeOf(null) === "retry" && outcomeOf(503) === "retry" && outcomeOf(429) === "retry", "no signal / server busy: retry");
  ok(outcomeOf(401) === "retry", "logged out while sets wait: kept for the next login, never dropped");
  ok(outcomeOf(200) === "sent" && outcomeOf(402) === "drop" && outcomeOf(404) === "drop", "success sent; refused dropped");
  console.log(`offline queue: ${n} checks passed`);
};
void run();
