import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { billingWebhook } from "./routes/billing";
import { logger } from "./lib/logger";
import { securityHeaders } from "./lib/security-headers";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders);
app.use(cookieParser());
// Stripe signs the raw body, so the webhook must be mounted before express.json.
app.post("/api/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), billingWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
