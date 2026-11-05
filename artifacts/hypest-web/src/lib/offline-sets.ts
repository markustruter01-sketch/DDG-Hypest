import { useEffect, useState, useSyncExternalStore } from "react";
import { getGetCurrentUserQueryKey, logSet, useGetCurrentUser } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { createQueue, indexedDbStore, memoryStore, outcomeOf, type QueuedSet, type QueueStore } from "@/lib/offline-queue";

/** The app's one offline queue for set logs (build plan 1.6). */
let store: QueueStore;
try {
  store = typeof indexedDB === "undefined" ? memoryStore() : indexedDbStore();
} catch {
  store = memoryStore();
}

const statusOf = (err: unknown): number | null => {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : null;
};

/** The logged-in member: only their queued sets are shown or sent (build plan 1.11). */
let owner: number | null = null;

const queue = createQueue(store, async (e: QueuedSet) => {
  try {
    await logSet(e.itemId, e.setNumber, e.body, request);
    return "sent";
  } catch (err) {
    return outcomeOf(statusOf(err));
  }
}, () => owner);

let waiting: string[] = [];
/** Queued sets the server refused while syncing (e.g. 402: a session past week 1 on Free). Shown once, then cleared. */
let dropped = 0;
const listeners = new Set<() => void>();
const publish = async () => {
  waiting = await queue.pending();
  listeners.forEach((l) => l());
};

export async function flushSets(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return publish();
  dropped += (await queue.flush()).dropped;
  await publish();
}

/** Spec 3.1 §1: say plainly when sets from the phone could not be saved. */
export function droppedSetsText(n: number): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? "set" : "sets"} couldn't be saved: your plan doesn't include this session.`;
}

/** The refused-set count since the member last dismissed it. */
export function useDroppedSets(): [number, () => void] {
  const n = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => dropped);
  return [n, () => { dropped = 0; listeners.forEach((l) => l()); }];
}

/** Try to send now; with no signal (or a network error) keep it on the phone. Returns where it ended up:
 *  "logged-out" is kept on the phone too, and goes up after the member logs in again. */
export async function saveSet(itemId: number, setNumber: number, body: QueuedSet["body"]): Promise<"synced" | "on-phone" | "logged-out" | "refused"> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await queue.add(itemId, setNumber, body);
    await publish();
    return "on-phone";
  }
  try {
    await logSet(itemId, setNumber, body, request);
    return "synced";
  } catch (err) {
    const status = statusOf(err);
    if (outcomeOf(status) === "drop") return "refused";
    await queue.add(itemId, setNumber, body);
    await publish();
    return status === 401 ? "logged-out" : "on-phone";
  }
}

/** Keys ("item:set") still on the phone; re-renders when the queue changes. Flushes on start, when the
 *  signal returns, and every 30 s while anything is waiting. */
export function useWaitingSets(): string[] {
  const keys = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => waiting);
  const [, tick] = useState(0);
  const me = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const userId = me.data?.id ?? null;
  useEffect(() => {
    owner = userId;
    void flushSets();
  }, [userId]);
  useEffect(() => {
    void flushSets().then(() => tick((t) => t + 1));
    const onOnline = () => void flushSets();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => { if (waiting.length) void flushSets(); }, 30_000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, []);
  return keys;
}
