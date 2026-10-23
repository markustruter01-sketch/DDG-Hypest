import { Router, type IRouter } from "express";
import { GetConfigResponse, HealthCheckResponse } from "@workspace/api-zod";
import { commissionRatesTable, db } from "@workspace/db";
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

// Fee rates come from the commission_rates table: the single source for 10% / 20%.
router.get("/config", async (_req, res) => {
  const rates = await db.select({ source: commissionRatesTable.source, bps: commissionRatesTable.commissionBps }).from(commissionRatesTable);
  const bps = (source: string) => {
    const rate = rates.find((r) => r.source === source);
    if (!rate) throw new Error(`commission rate missing for ${source}`);
    return rate.bps;
  };
  res.json(
    GetConfigResponse.parse({
      dev_tools: devToolsOn(),
      payments: paymentsMode(),
      ai: aiOn(),
      email: emailOn() && siteUrl() !== null,
      support_email: SUPPORT_EMAIL,
      creator_brought_bps: bps("creator_brought"),
      hypest_found_bps: bps("hypest_found"),
      prices: PRICES,
      screening: SCREENING,
    }),
  );
});

export default router;
