import type { RequestHandler } from "express";

/**
 * Browser safety headers on every API response. The API only returns JSON, so it may never be
 * framed, sniffed as another type, or cached (responses can hold health and training data).
 * No CORS headers: the web app calls the API from the same site, so other sites can't read responses.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
  });
  if (process.env["NODE_ENV"] === "production") res.set("Strict-Transport-Security", "max-age=31536000");
  next();
};
