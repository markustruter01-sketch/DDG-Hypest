/*
 * Hypest service worker (build plan 1.6). Hand-written, no build step.
 * - The app shell (index, scripts, styles, fonts, images) is cached so the app opens with no signal.
 * - Page loads: network first, the cached shell when offline.
 * - Built files (hashed names): cache first, filled as they load.
 * - The API is never cached: set logs made offline wait in the app's own queue (IndexedDB) instead.
 * Bump VERSION to drop old caches.
 */
const VERSION = "hypest-v1";
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/" or "/hypest/"
const SHELL = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icon-192.png`, `${SCOPE}icon-512.png`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${SCOPE}api/`)) return; // live data only

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(VERSION).then((c) => c.put(SCOPE, copy));
          return res;
        })
        .catch(() => caches.match(SCOPE).then((r) => r || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (res.type === "basic" || res.type === "default")) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
