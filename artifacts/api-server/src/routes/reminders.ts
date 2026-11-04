import { Router, type IRouter, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { GetRemindersResponse, SetRemindersBody, TurnOffRemindersBody } from "@workspace/api-zod";
import { authUser, requireUser } from "../middleware/require-user";
import { remindersOn, sendDueReminders, setReminders, turnOffByToken } from "../coaching/reminders";
import { emailOn, siteUrl } from "../lib/email";
import { tidyExpired } from "../lib/tidy";
import { alert } from "../lib/alerts";
import { runCoachJobs } from "../coaching/coach-jobs";

const router: IRouter = Router();

const state = async (userId: number) => GetRemindersResponse.parse({ on: await remindersOn(userId), available: emailOn() && siteUrl() !== null });

router.get("/me/reminders", requireUser, async (_req, res) => {
  res.json(await state(authUser(res).id));
});

router.put("/me/reminders", requireUser, async (req, res) => {
  const body = SetRemindersBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: body.error.issues[0]?.message ?? "invalid request" });
  const user = authUser(res);
  await setReminders(user.id, body.data.on);
  res.json(await state(user.id));
});

router.post("/reminders/off", async (req, res) => {
  const body = TurnOffRemindersBody.strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ message: "This link isn't valid." });
  await turnOffByToken(body.data.token);
  res.status(204).end();
});

/** Bearer JOBS_TOKEN (Replit Secret, also a GitHub Actions secret). Unset or wrong = 404, so the route is invisible. */
function jobAllowed(req: Request): boolean {
  const want = (process.env["JOBS_TOKEN"] ?? "").trim();
  const got = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (want.length < 32 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Daily job, called once a day by .github/workflows/daily.yml (the published app can't run timers itself). */
router.post("/jobs/daily", async (req, res) => {
  if (!jobAllowed(req)) return void res.status(404).json({ message: "Not found" });
  await tidyExpired();
  const reminders = await sendDueReminders();
  if (reminders.due > reminders.sent) void alert("warning", "Some reminder emails were not sent", `${reminders.sent} of ${reminders.due} sent`);
  res.json({ reminders });
});

/** Hourly coach job (build plan 2.5), called by .github/workflows/coach.yml: due check-ins and Sunday reviews,
 *  a small batch per call; `more` = call again. */
router.post("/jobs/coach", async (req, res) => {
  if (!jobAllowed(req)) return void res.status(404).json({ message: "Not found" });
  res.json(await runCoachJobs());
});

export default router;
