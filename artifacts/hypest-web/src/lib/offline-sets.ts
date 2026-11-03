import { useEffect, useState, useSyncExternalStore } from "react";
import { logSet } from "@workspace/api-client-react";
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

const queue = createQueue(store, async (e: QueuedSet) => {
  try {
    await logSet(e.itemId, e.setNumber, e.body, request);
    return "sent";
  } catch (err) {
    return outcomeOf(statusOf(err));
  }
});

let waiting: string[] = [];
const listeners = new Set<() => void>();
const publish = async () => {
  waiting = await queue.pending();
  listeners.forEach((l) => l());
};

export async function flushSets(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return publish();
  await queue.flush();
  await publish();
}

/** Try to send now; with no signal (or a network error) keep it on the phone. Returns where it ended up. */
export async function saveSet(itemId: number, setNumber: number, body: QueuedSet["body"]): Promise<"synced" | "on-phone" | "refused"> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await queue.add(itemId, setNumber, body);
    await publish();
    return "on-phone";
  }
  try {
    await logSet(itemId, setNumber, body, request);
    return "synced";
  } catch (err) {
    const outcome = outcomeOf(statusOf(err));
    if (outcome === "drop") return "refused";
    await queue.add(itemId, setNumber, body);
    await publish();
    return "on-phone";
  }
}

/** Keys ("item:set") still on the phone; re-renders when the queue changes. Flushes on start, when the
 *  signal returns, and every 30 s while anything is waiting. */
export function useWaitingSets(): string[] {
  const keys = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => waiting);
  const [, tick] = useState(0);
  useEffect(() => {
    void flushSets().then(() => tick((t) => t + 1));
    const onOnline = () => void flushSets();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => { if (waiting.length) void flushSets(); }, 30_000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, []);
  return keys;
}
