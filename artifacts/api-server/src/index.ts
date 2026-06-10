import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDB } from "./db/index.js";
import { runInventoryBackgroundDeduction } from "./routes/inventory.js";
import { getSubHubDbConnection } from "./db/sub-hub-connections.js";

/**
 * Idempotent migration that runs on every startup and fixes two classes of
 * payment inconsistency in the orders collection:
 *
 * 1. Takeaway orders that are still "unpaid" — these are always collected at
 *    pickup, so mark them paid: paidAmount = total, dueAmount = 0.
 *
 * 2. Any order already marked "paid" but still carrying a dueAmount > 0 —
 *    just zero out the due.
 */
async function fixPaidOrdersDueAmount() {
  try {
    const conn = await getSubHubDbConnection("orders");
    const col = conn.db.collection("orders");

    // Fix 1: takeaway orders that are not yet marked as paid.
    const takeawayFix = await col.updateMany(
      { deliveryType: "takeaway", paymentStatus: { $ne: "paid" } },
      [
        {
          $set: {
            paymentStatus: "paid",
            paidAmount: { $ifNull: ["$total", 0] },
            dueAmount: 0,
          },
        },
      ]
    );
    if (takeawayFix.modifiedCount > 0) {
      logger.info(
        { count: takeawayFix.modifiedCount },
        "Migration: marked unpaid takeaway orders as fully paid"
      );
    }

    // Fix 2: any order already "paid" but with a stale dueAmount > 0.
    const dueFix = await col.updateMany(
      { paymentStatus: "paid", dueAmount: { $gt: 0 } },
      { $set: { dueAmount: 0 } }
    );
    if (dueFix.modifiedCount > 0) {
      logger.info(
        { count: dueFix.modifiedCount },
        "Migration: reset dueAmount=0 for paid orders"
      );
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
