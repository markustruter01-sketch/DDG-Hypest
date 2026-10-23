import app from "./app";
import { logger } from "./lib/logger";
import { seedCommissionRatesIfEmpty } from "./lib/seed-commission-rates";
import { tidyExpired } from "./lib/tidy";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await seedCommissionRatesIfEmpty();
} catch (err) {
  logger.error({ err }, "Failed to seed commission rates");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // No "started" alert: the published app cold-starts often (autoscale), which would flood the alerts chat.
  void tidyExpired();
});
