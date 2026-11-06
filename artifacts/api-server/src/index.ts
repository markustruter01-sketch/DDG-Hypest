import app from "./app";
import { logger } from "./lib/logger";
import { tidyExpired } from "./lib/tidy";
import { devLoginProblem, listenHost } from "./lib/dev-login";
import { backfillNutritionBlocks } from "./coaching/food";
import { seedAllowances } from "./coaching/allowance";
import { pool, syncCheckConstraints } from "@workspace/db";

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

const devProblem = devLoginProblem();
if (devProblem) {
  logger.error(devProblem);
  throw new Error(`Refusing to start: ${devProblem}`);
}

// Schema push leaves changed CHECK rules stale; bring them in line before anything writes.
const checks = await syncCheckConstraints(pool);
if (checks.updated.length) logger.info({ updated: checks.updated }, "Database check rules updated to match the schema");
for (const f of checks.failed) logger.error(f, "Database check rule could not be updated (existing rows break it); left unchanged");

try {
  await seedAllowances(); // docs/COACH-AGENT-SPEC.md §5: fills missing rows only; never overwrites Markus's edits
  const blocked = await backfillNutritionBlocks(); // spec 3.1 §5.1: once at deploy; a no-op after
  if (blocked) logger.info({ blocked }, "Nutrition blocks backfilled");
} catch (err) {
  logger.error({ err }, "Failed to seed AI allowances");
  process.exit(1);
}

const onListen = (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // No "started" alert: the published app cold-starts often (autoscale), which would flood the alerts chat.
  void tidyExpired();
};
const host = listenHost();
if (host) app.listen(port, host, onListen);
else app.listen(port, onListen);
