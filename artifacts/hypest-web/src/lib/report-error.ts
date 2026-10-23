import { reportClientError } from "@workspace/api-client-react";

/**
 * Tells the server the app crashed, so a broken release alerts Markus. Production builds only, at most
 * MAX_PER_PAGE reports per page load, each message once. Never throws and never blocks the page.
 * Sends only the error message and the page path (the server blanks emails and long numbers too).
 */
const MAX_PER_PAGE = 5;
const sent = new Set<string>();

export function reportError(kind: "crash" | "unhandled", err: unknown): void {
  if (!import.meta.env.PROD) return;
  const message = (err instanceof Error ? err.message : String(err ?? "unknown")).slice(0, 500) || "unknown";
  if (sent.size >= MAX_PER_PAGE || sent.has(message)) return;
  sent.add(message);
  try {
    void reportClientError({ kind, message, path: window.location.pathname.slice(0, 200) }, { credentials: "omit", keepalive: true }).catch(() => {});
  } catch {
    /* reporting must never break the page */
  }
}

/** Errors outside React (event handlers, promises). */
export function reportUncaughtErrors(): void {
  window.addEventListener("error", (e) => reportError("unhandled", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("unhandled", e.reason));
}
