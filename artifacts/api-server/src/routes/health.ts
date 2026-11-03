import { Router, type IRouter } from "express";
import { GetConfigResponse, HealthCheckResponse } from "@workspace/api-zod";
import { devToolsOn } from "../lib/dev-login";
import { PRICES } from "../coaching/access";
import { SCREENING } from "../coaching/screening";
import { paymentsMode } from "../lib/stripe";
import { aiOn } from "../lib/ai";
import { emailOn, siteUrl, SUPPORT_EMAIL } from "../lib/email";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/config", (_req, res) => {
  res.json(
    GetConfigResponse.parse({
      dev_tools: devToolsOn(),
      payments: paymentsMode(),
      ai: aiOn(),
      email: emailOn() && siteUrl() !== null,
      support_email: SUPPORT_EMAIL,
      prices: PRICES,
      screening: SCREENING,
    }),
  );
});

export default router;
