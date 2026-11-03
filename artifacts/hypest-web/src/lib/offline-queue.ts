/**
 * Set logs that couldn't reach the server (no signal in the gym), kept on the phone and sent when the signal
 * is back (build plan 1.6). The server's set log is an upsert per (item, set), so sending one twice is safe.
 *
 * The queue logic is pure and storage-agnostic (checked by offline-queue.check.ts); the app uses the
 * IndexedDB store below.
 */
/** userId: whose set this is. Only that member's login sends it (a shared phone never sends A's sets as B). Absent on
 *  entries queued before build plan 1.11; those go with whoever is logged in. */
export type QueuedSet = { key: string; userId?: number; itemId: number; setNumber: number; body: { reps: number | null; seconds: number | null; load_kg: number | null }; queuedAt: number };

export interface QueueStore {
  all(): Promise<QueuedSet[]>;
  put(entry: QueuedSet): Promise<void>;
  remove(key: string): Promise<void>;
}

/** What a send attempt says: sent, try again later (no signal, server down), or never (refused: drop it). */
export type SendOutcome = "sent" | "retry" | "drop";

export const queueKey = (itemId: number, setNumber: number) => `${itemId}:${setNumber}`;

const mine = (e: QueuedSet, owner: number | null) => owner !== null && (e.userId === undefined || e.userId === owner);

export function memoryStore(): QueueStore {
  const map = new Map<string, QueuedSet>();
  return {
    all: async () => [...map.values()].sort((a, b) => a.queuedAt - b.queuedAt),
    put: async (e) => void map.set(e.key, e),
    remove: async (k) => void map.delete(k),
  };
}

/** Keeps the latest numbers for a set (re-ticking replaces), sends oldest first, stops at the first "retry".
 *  owner() is the logged-in member (null: nobody); only their sets are counted or sent. */
export function createQueue(store: QueueStore, send: (e: QueuedSet) => Promise<SendOutcome>, owner: () => number | null = () => 0) {
  let flushing: Promise<{ sent: number; dropped: number; left: number }> | null = null;
  return {
    add: (itemId: number, setNumber: number, body: QueuedSet["body"], now = Date.now()) =>
      store.put({ key: queueKey(itemId, setNumber), userId: owner() ?? undefined, itemId, setNumber, body, queuedAt: now }),
    pending: async () => (await store.all()).filter((e) => mine(e, owner())).map((e) => e.key),
    flush(): Promise<{ sent: number; dropped: number; left: number }> {
      flushing ??= (async () => {
        let sent = 0, dropped = 0;
        try {
          const who = owner();
          for (const e of (await store.all()).filter((x) => mine(x, who))) {
            const outcome = await send(e);
            if (outcome === "retry") break;
            await store.remove(e.key);
            if (outcome === "sent") sent += 1; else dropped += 1;
          }
          return { sent, dropped, left: (await store.all()).filter((x) => mine(x, who)).length };
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },
  };
}

/** HTTP status → outcome. No status (network error), 401 (logged out: the sets wait for the next login), 5xx/408/429: retry.
 *  Any other 4xx: the server refused it. */
export function outcomeOf(status: number | null): SendOutcome {
  if (status === null || status >= 500 || status === 401 || status === 408 || status === 429) return "retry";
  if (status >= 200 && status < 300) return "sent";
  return "drop";
}

/** The phone's own store: IndexedDB, one object store keyed by "item:set". */
export function indexedDbStore(name = "hypest-offline"): QueueStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("sets", { keyPath: "key" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction("sets", mode).objectStore("sets"));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }).finally(() => db.close());
  };
  return {
    all: async () => ((await run("readonly", (s) => s.getAll())) as QueuedSet[]).sort((a, b) => a.queuedAt - b.queuedAt),
    put: async (e) => void (await run("readwrite", (s) => s.put(e))),
    remove: async (k) => void (await run("readwrite", (s) => s.delete(k))),
  };
}
