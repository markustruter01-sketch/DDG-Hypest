/*
 * Hypest service worker (build plan 1.6). Hand-written, no build step.
 * - The app shell (index, scripts, styles, fonts, images) is cached so the app opens with no signal.
 * - Page loads: network first, the cached shell when offline.
 * - Built files (hashed names): cache first, filled as they load.
 * - The API is live only, except the few read-only answers Today and a session need (OFFLINE_API): network
 *   first, the last good answer when there is no signal, so a member can reopen their workout in the gym.
 *   Those answers are the member's own, so they are wiped before any login, signup or logout and on any 401.
 * - Set logs made offline wait in the app's own queue (IndexedDB), never here.
 * Bump VERSION to drop old caches.
 */
const VERSION = "hypest-v2";
const API_CACHE = "hypest-api-v1";
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/" or "/hypest/"
const SHELL = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icon-192.png`, `${SCOPE}icon-512.png`];
const OFFLINE_API = new Set(["auth/me", "me/training", "coaches", "config"].map((p) => `${SCOPE}api/${p}`));
// Bumped on every wipe: an answer that left before a wipe is never stored after it.
let epoch = 0;
const forgetMember = () => { epoch += 1; return caches.delete(API_CACHE); };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== API_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${SCOPE}api/`)) {
    // Login, signup, logout (and other account changes): wipe the last member's answers before it goes.
    if (req.method === "POST" && url.pathname.startsWith(`${SCOPE}api/auth/`)) {
      event.respondWith(forgetMember().then(() => fetch(req)));
      return;
    }
    if (req.method !== "GET" || url.search || !OFFLINE_API.has(url.pathname)) return; // live data only
    const sent = epoch;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && sent === epoch) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => (sent === epoch ? c.put(req, copy) : undefined)).catch(() => undefined);
          } else if (res.status === 401) {
            forgetMember();
          }
          return res;
        })
        .catch(() => caches.open(API_CACHE).then((c) => c.match(req, { ignoreVary: true })).then((r) => r || Response.error())),
    );
    return;
  }
  if (req.method !== "GET") return;

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
