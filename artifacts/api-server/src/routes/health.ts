import { Router, type IRouter } from "express";
import { GetConfigResponse, HealthCheckResponse } from "@workspace/api-zod";
import { devToolsOn } from "../lib/dev-login";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/config", (_req, res) => {
  res.json(GetConfigResponse.parse({ dev_tools: devToolsOn() }));
});

export default router;
