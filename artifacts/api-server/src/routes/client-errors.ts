import { Router, type IRouter } from "express";
import { ReportClientErrorBody } from "@workspace/api-zod";
import { alert } from "../lib/alerts";

/**
 * Crashes in members' browsers, so a broken release is noticed (the published app has no other way to see them).
 * No login needed and no personal details kept: emails and long numbers are blanked. At most MAX_PER_MINUTE per
 * server instance; alerts are also de-duplicated per page for 10 minutes by lib/alerts.ts.
 */
const MAX_PER_MINUTE = 30;
let windowStart = 0;
let count = 0;

export function scrub(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+/g, "[email]").replace(/\d{5,}/g, "[number]").slice(0, 300);
}

const router: IRouter = Router();

router.post("/client-errors", (req, res) => {
  const body = ReportClientErrorBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: "invalid report" });
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; count = 0; }
  count += 1;
  if (count <= MAX_PER_MINUTE) {
    const path = scrub(body.data.path).replace(/\/\d+(?=\/|$)/g, "/:id");
    const message = scrub(body.data.message);
    req.log.warn({ kind: body.data.kind, path, message }, "client error");
    void alert("warning", `App error on ${path}`, `${body.data.kind}: ${message}`);
  }
  res.status(204).end();
});

export default router;
