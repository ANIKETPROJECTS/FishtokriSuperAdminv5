import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDB } from "./db/index.js";
import { runInventoryBackgroundDeduction } from "./routes/inventory.js";
import { getSubHubDbConnection } from "./db/sub-hub-connections.js";

/**
 * One-time idempotent migration: any order that has paymentStatus "paid"
 * but a dueAmount > 0 is inconsistent. Reset dueAmount to 0 for all such
 * orders (covers old takeaway orders created before the fix).
 */
async function fixPaidOrdersDueAmount() {
  try {
    const conn = await getSubHubDbConnection("orders");
    const result = await conn.db.collection("orders").updateMany(
      { paymentStatus: "paid", dueAmount: { $gt: 0 } },
      { $set: { dueAmount: 0 } }
    );
    if (result.modifiedCount > 0) {
      logger.info({ count: result.modifiedCount }, "Migration: reset dueAmount=0 for paid orders");
    }
  } catch (err) {
    logger.error({ err }, "Migration: fixPaidOrdersDueAmount failed (non-fatal)");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

connectDB()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");

      // Migration: fix paid orders that still have dueAmount > 0 (old takeaway bug).
      fixPaidOrdersDueAmount().catch(() => {});

      // Run once at startup (after 15s) to catch any orders that missed deduction
      // while the server was down, then keep polling every 60s.
      setTimeout(() => {
        runInventoryBackgroundDeduction().catch((e) =>
          logger.error({ err: e }, "bg inventory deduction (startup) failed")
        );
      }, 15_000);

      setInterval(() => {
        runInventoryBackgroundDeduction().catch((e) =>
          logger.error({ err: e }, "bg inventory deduction (poll) failed")
        );
      }, 60_000);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });
