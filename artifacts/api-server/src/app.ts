import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { billingWebhook } from "./routes/billing";
import { logger } from "./lib/logger";
import { securityHeaders } from "./lib/security-headers";
import { alert } from "./lib/alerts";

const app: Express = express();
app.disable("x-powered-by");
// The published app sits behind one proxy that adds the caller's address to X-Forwarded-For. Trust that one hop
// (and no more) so req.ip is the member's address for the per-network limits. TRUST_PROXY_HOPS overrides it.
app.set("trust proxy", Number(process.env["TRUST_PROXY_HOPS"] ?? 1));

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
app.use("/api", (_req: Request, res: Response) => void res.status(404).json({ message: "Not found" }));

// Last stop for any error: JSON (never a stack trace), and an alert for real server faults (500s).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; statusCode?: number; expose?: boolean; message?: string };
  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, "unhandled error");
    void alert("critical", `Server error: ${req.method} ${req.path}`, e.message ?? "unknown error");
  }
  if (res.headersSent) return;
  res.status(status).json({ message: status >= 500 ? "Something went wrong. Try again." : e.expose && e.message ? e.message : "Bad request" });
});

export default app;
