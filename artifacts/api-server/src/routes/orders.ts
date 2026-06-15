import { Router } from "express";
import mongoose from "mongoose";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";
import { getCustomersConnection } from "../db/customers-connection.js";
import { syncOrderBankPayments } from "./banking.js";
import {
  applyOrderInventoryOnCreate,
  applyOrderInventoryOnUpdate,
  applyOrderInventoryOnDelete,
  autoDeductUndedcutedOrders,
  InsufficientStockError,
} from "./inventory.js";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";

const router = Router();
router.use(requireAuth as any);
router.use(loadScope as any);

const VALID_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "takeaway",
]);

/**
 * Returns a filter clause to scope orders to the user's hub set.
 * Master admins get an empty clause (no filtering). Non-master users without
 * any sub hubs get a filter that matches no documents.
 */
function scopeOrderFilter(req: ScopedRequest): Record<string, any> | null {
  const scope = req.scope;
  if (!scope || scope.isMaster) return {};
  if (scope.role === "delivery_person") {
    const uid = req.admin?.adminId;
    if (!uid) return null;
    return { assignedDeliveryPersonId: String(uid) };
  }
  if (scope.subHubIds.length === 0) return null; // sentinel: match nothing
  return { subHubId: { $in: scope.subHubIds } };
}

/** Combines an existing filter with the scope filter. Returns null when the
 *  scope is empty for a non-master user (caller should respond with empty). */
function applyOrderScope(filter: any, req: ScopedRequest): any | null {
  const scopeClause = scopeOrderFilter(req);
  if (scopeClause === null) return null;
  if (Object.keys(scopeClause).length === 0) return filter;
  if (filter.$and) {
    return { ...filter, $and: [...filter.$and, scopeClause] };
  }
  if (filter.$or) {
    // Wrap existing $or with $and so we don't lose either constraint.
    const { $or, ...rest } = filter;
    return { ...rest, $and: [{ $or }, scopeClause] };
  }
  return { ...filter, ...scopeClause };
}

async function getCustomersCollection() {
  const conn = await getCustomersConnection();
  return conn.db.collection("customers");
}

const ORDERS_DB = "orders";
const COLLECTION = "orders";

async function getOrdersDb() {
  return getSubHubDbConnection(ORDERS_DB);
}


function toId(id: string): mongoose.mongo.BSON.ObjectId | null {
  try { return new mongoose.mongo.ObjectId(id); } catch { return null; }
}

/**
 * Normalizes coupon data from an order document into a flat array.
 * Handles both the multi-coupon `coupons[]` format and the legacy
 * single-coupon `couponId / couponCode / couponTitle` fields.
 */
function extractOrderCoupons(order: any): Array<{ couponId: string; couponCode: string; couponTitle: string }> {
  const result: Array<{ couponId: string; couponCode: string; couponTitle: string }> = [];
  if (Array.isArray(order.coupons) && order.coupons.length > 0) {
    for (const c of order.coupons) {
      const id = String(c?.id ?? c?._id ?? c?.couponId ?? "").trim();
      if (id) result.push({
        couponId: id,
        couponCode: String(c?.code ?? c?.couponCode ?? "").trim(),
        couponTitle: String(c?.title ?? c?.name ?? c?.couponTitle ?? "").trim(),
      });
    }
  }
  if (result.length === 0 && order.couponId) {
    result.push({
      couponId: String(order.couponId).trim(),
      couponCode: String(order.couponCode ?? "").trim(),
      couponTitle: String(order.couponTitle ?? "").trim(),
    });
  }
  return result;
}

/** Statuses where the order is live (not yet delivered or cancelled). */
const ACTIVE_ORDER_STATUSES = new Set(["pending", "confirmed", "out_for_delivery", "takeaway"]);

/**
 * Upserts an activeCoupons entry for a customer.
 * Each coupon gets ONE entry (keyed by couponId) with usedCount tracking
 * how many active orders are using it, and orderIds[] listing those orders.
 * If an entry already exists for this couponId, increments usedCount and
 * appends the orderId. Otherwise, creates a new entry with usedCount=1.
 */
async function upsertActiveCoupon(
  cCol: any,
  customerId: string,
  coupon: { couponId: string; couponCode: string; couponTitle: string },
  orderId: string,
  subHubId: string,
  log: any,
) {
  const cid = toId(customerId);
  if (!cid) return;
  try {
    const updateResult = await cCol.updateOne(
      { _id: cid, "activeCoupons.couponId": coupon.couponId },
      {
        $inc: { "activeCoupons.$.usedCount": 1 },
        $addToSet: { "activeCoupons.$.orderIds": orderId },
      },
    );
    if (updateResult.matchedCount === 0) {
      await cCol.updateOne(
        { _id: cid },
        {
          $push: {
            activeCoupons: {
              couponId: coupon.couponId,
              couponCode: coupon.couponCode,
              couponTitle: coupon.couponTitle,
              subHubId: subHubId ?? "",
              usedCount: 1,
              orderIds: [orderId],
              appliedAt: new Date(),
            },
          },
        },
      );
    }
  } catch (e) {
    log.error({ err: e, customerId, orderId }, "Failed to upsert activeCoupon");
  }
}

/**
 * Decrements usedCount for an activeCoupons entry and removes the orderId.
 * If usedCount drops to 0 (or below), removes the entire entry so the
 * coupon becomes available again.
 */
async function decrementActiveCoupon(
  cCol: any,
  customerId: string,
  couponId: string,
  orderId: string,
  log: any,
) {
  const cid = toId(customerId);
  if (!cid) return;
  try {
    await cCol.updateOne(
      { _id: cid, "activeCoupons.couponId": couponId },
      { $inc: { "activeCoupons.$.usedCount": -1 } },
    );
    await cCol.updateOne(
      { _id: cid },
      { $pull: { "activeCoupons.$[elem].orderIds": orderId } as any },
      { arrayFilters: [{ "elem.couponId": couponId }] },
    );
    await cCol.updateOne(
      { _id: cid },
      { $pull: { activeCoupons: { couponId, usedCount: { $lte: 0 } } } as any },
    );
  } catch (e) {
    log.error({ err: e, customerId, orderId, couponId }, "Failed to decrement activeCoupon");
  }
}

/**
 * Syncs a customer's activeCoupons / usedCoupons arrays whenever an order's
 * status changes. All coupon state transitions live here so the logic is in
 * one place and easy to audit.
 *
 *  active   → delivered  : decrement activeCoupons usedCount → add to usedCoupons
 *  active   → cancelled  : decrement activeCoupons usedCount (entry removed if 0)
 *  delivered→ active     : remove from usedCoupons → re-upsert into activeCoupons
 *  delivered→ cancelled  : remove from usedCoupons
 *  cancelled→ active     : re-upsert into activeCoupons
 *  cancelled→ delivered  : add directly to usedCoupons
 */
async function syncCustomerCouponsOnStatusChange(
  cCol: any,
  customerId: string,
  orderId: string,
  orderCoupons: Array<{ couponId: string; couponCode: string; couponTitle: string }>,
  prevStatus: string,
  newStatus: string,
  subHubId: string,
  log: any,
) {
  if (!customerId || orderCoupons.length === 0 || prevStatus === newStatus) return;
  const cid = toId(customerId);
  if (!cid) return;

  const prevActive = ACTIVE_ORDER_STATUSES.has(prevStatus);
  const prevDelivered = prevStatus === "delivered";
  const prevCancelled = prevStatus === "cancelled";
  const newActive = ACTIVE_ORDER_STATUSES.has(newStatus);
  const newDelivered = newStatus === "delivered";
  const newCancelled = newStatus === "cancelled";

  try {
    if ((prevActive || prevDelivered) && newDelivered && !prevDelivered) {
      // ✅ Order delivered → decrement activeCoupons, lock permanently in usedCoupons
      for (const c of orderCoupons) {
        await decrementActiveCoupon(cCol, customerId, c.couponId, orderId, log);
      }
      const entries = orderCoupons.map((c) => ({ ...c, orderId, subHubId: subHubId ?? "", usedAt: new Date() }));
      await cCol.updateOne({ _id: cid }, { $push: { usedCoupons: { $each: entries } } });
      log.info({ customerId, orderId }, "Coupon lifecycle: activeCoupons decremented → usedCoupons (delivered)");
    } else if (prevDelivered && newActive) {
      // ↩️ Un-deliver → remove from usedCoupons, re-upsert into activeCoupons
      await cCol.updateOne({ _id: cid }, { $pull: { usedCoupons: { orderId } } });
      for (const c of orderCoupons) {
        await upsertActiveCoupon(cCol, customerId, c, orderId, subHubId, log);
      }
      log.info({ customerId, orderId }, "Coupon lifecycle: usedCoupons removed → activeCoupons upserted (un-delivered)");
    } else if ((prevActive || prevDelivered) && newCancelled) {
      // ❌ Order cancelled → decrement activeCoupons, remove from usedCoupons
      for (const c of orderCoupons) {
        await decrementActiveCoupon(cCol, customerId, c.couponId, orderId, log);
      }
      await cCol.updateOne({ _id: cid }, { $pull: { usedCoupons: { orderId } } });
      log.info({ customerId, orderId }, "Coupon lifecycle: activeCoupons decremented (cancelled)");
    } else if (prevCancelled && newActive) {
      // 🔄 Un-cancel → re-upsert into activeCoupons
      for (const c of orderCoupons) {
        await upsertActiveCoupon(cCol, customerId, c, orderId, subHubId, log);
      }
      log.info({ customerId, orderId }, "Coupon lifecycle: activeCoupons upserted (un-cancelled)");
    } else if (prevCancelled && newDelivered) {
      // Rare: cancelled → delivered directly
      const entries = orderCoupons.map((c) => ({ ...c, orderId, subHubId: subHubId ?? "", usedAt: new Date() }));
      await cCol.updateOne({ _id: cid }, { $push: { usedCoupons: { $each: entries } } });
      log.info({ customerId, orderId }, "Coupon lifecycle: added to usedCoupons (cancelled→delivered)");
    }
  } catch (e) {
    log.error({ err: e, customerId, orderId }, "Failed to sync customer coupon lifecycle");
  }
}

/** Returns today's date string in YYYYMMDD format using IST (UTC+5:30). */
function getTodayIST(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Returns today's date in YYYY-MM-DD format (IST), matching the deliveryDate field. */
function getTodayISODate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns tomorrow's date in YYYY-MM-DD format (IST), matching the deliveryDate field. */
function getTomorrowISODate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + 1);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Atomically generates the next sequential FishTokri order ID for today.
 * Format: #FTSYYYYMMDD{N}  e.g. #FTS202605261, #FTS202605262 …
 * Counter resets each calendar day (IST).
 */
async function generateOrderId(db: any): Promise<string> {
  const dateStr = getTodayIST();
  const counter = await db.collection("order_id_counters").findOneAndUpdate(
    { _id: dateStr },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  const seq: number = counter?.seq ?? 1;
  return `#FTS${dateStr}${seq}`;
}

/**
 * Re-aggregates today's and tomorrow's order counts for a given timeslot and
 * writes them back to the timeslot document in the sub-hub's MongoDB database.
 * Called fire-and-forget after every order mutation that could affect a slot count.
 */
async function syncTimeslotOrderCounts(
  timeslotId: string,
  subHubName: string,
  log: any,
): Promise<void> {
  try {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayISO = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
    const tomDate = new Date(ist.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowISO = `${tomDate.getUTCFullYear()}-${pad(tomDate.getUTCMonth() + 1)}-${pad(tomDate.getUTCDate())}`;

    const ordersConn = await getOrdersDb();
    const agg = await ordersConn.db.collection(COLLECTION).aggregate([
      {
        $match: {
          timeslotId,
          scheduleType: "slot",
          deliveryDate: { $in: [todayISO, tomorrowISO] },
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: "$deliveryDate",
          count: { $sum: 1 },
        },
      },
    ]).toArray();

    let todaysOrderCount = 0;
    let nextDayOrderCount = 0;
    for (const row of agg as any[]) {
      if (row._id === todayISO) todaysOrderCount = row.count;
      else if (row._id === tomorrowISO) nextDayOrderCount = row.count;
    }

    const subHubConn = await getSubHubDbConnection(subHubName);
    await subHubConn.db.collection("timeslots").updateOne(
      { _id: new mongoose.Types.ObjectId(timeslotId) },
      {
        $set: { todaysOrderCount, nextDayOrderCount },
        $unset: { todaysOrderDate: "", nextDayOrderDate: "" },
      },
    );

    log.info({ timeslotId, subHubName, todaysOrderCount, nextDayOrderCount }, "Timeslot order counts synced to DB");
  } catch (e) {
    log.warn({ err: e, timeslotId, subHubName }, "Failed to sync timeslot order counts (non-fatal)");
  }
}

// GET /api/orders — list with search, filter, sort, pagination
router.get("/", async (req: ScopedRequest, res) => {
  try {
    const conn = await getOrdersDb();
    const db = conn.db;

    const {
      q = "",
      status = "",
      deliveryType = "",
      tab = "",
      sort = "createdAt",
      order = "desc",
      page = "1",
      limit = "20",
      from = "",
      to = "",
      assignedTo = "",
      deliveryDateFilter = "",
    } = req.query as Record<string, string>;

    const filter: any = {};

    if (q) {
      const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const words = q.trim().split(/\s+/).filter(Boolean);

      const buildWordClause = (word: string) => {
        const re = { $regex: escapeRe(word), $options: "i" };
        const orClauses: any[] = [
          { customerName: re },
          { phone: re },
          { deliveryArea: re },
          { address: re },
          { "items.name": re },
          { orderId: re },
        ];
        // Also match by ObjectId hex — full (24 chars) or trailing fragment.
        // Strip leading '#' so searching '#FTS...' and 'FTS...' both work via orderId above;
        // hex fragment matching only applies to the raw _id hex string.
        const hex = word.replace(/^#/, "").toLowerCase();
        if (/^[0-9a-f]+$/.test(hex)) {
          if (hex.length === 24) {
            const oid = toId(hex);
            if (oid) orClauses.push({ _id: oid });
          } else {
            orClauses.push({
              $expr: {
                $regexMatch: {
                  input: { $toString: "$_id" },
                  regex: `${hex}$`,
                  options: "i",
                },
              },
            });
          }
        }
        return { $or: orClauses };
      };

      if (words.length === 1) {
        // Single word: set $or directly so the tab-history handler can wrap it.
        filter.$or = buildWordClause(words[0]).$or;
      } else {
        // Multiple words: each word must match at least one field ($and of $or).
        // The tab-history handler checks filter.$or — since it's unset here, it
        // will add the status clause as a new top-level $or which MongoDB ANDs
        // with our $and, giving correct results.
        filter.$and = words.map(buildWordClause);
      }
    }

    // Tab semantics: takeaway-deliveryType orders are always treated as completed (History).
    // - "current": active statuses AND deliveryType != takeaway
    // - "history": history statuses OR deliveryType == takeaway
    const ACTIVE = ["pending", "confirmed", "out_for_delivery"];
    const HISTORY = ["delivered", "cancelled"];

    const statusList = status
      ? status.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (tab === "current") {
      const list = statusList.length ? statusList.filter((s) => ACTIVE.includes(s)) : ACTIVE;
      filter.status = { $in: list };
      filter.deliveryType = { $ne: "takeaway" };
    } else if (tab === "history") {
      const list = statusList.length ? statusList.filter((s) => HISTORY.includes(s)) : HISTORY;
      filter.$or = [
        ...(filter.$or ?? []).map((c: any) => ({ ...c })),
      ];
      const historyClause = { $or: [{ status: { $in: list } }, { deliveryType: "takeaway" }] };
      if (filter.$or && filter.$or.length) {
        filter.$and = [{ $or: filter.$or }, historyClause];
        delete filter.$or;
      } else {
        Object.assign(filter, historyClause);
      }
    } else if (statusList.length) {
      filter.status = statusList.length === 1 ? statusList[0] : { $in: statusList };
    }
    if (deliveryType) filter.deliveryType = deliveryType;
    if (assignedTo) filter.assignedDeliveryPersonId = assignedTo;

    // Date range filter — matches on deliveryDate (YYYY-MM-DD string).
    // Orders with no deliveryDate set are excluded when a range is active,
    // since they have no scheduled delivery date to match against.
    if (from || to) {
      const dateRangeClause: any = {};
      if (from) dateRangeClause.$gte = from; // string comparison works for YYYY-MM-DD
      if (to) dateRangeClause.$lte = to;
      filter.deliveryDate = dateRangeClause;
    }

    // deliveryDateFilter: "today"    = today, past, or no date set (Current Orders)
    //                     "tomorrow" = only tomorrow's date (Next Day Orders)
    if (deliveryDateFilter === "today" || deliveryDateFilter === "tomorrow" || deliveryDateFilter === "other") {
      const todayISO = getTodayISODate();
      const tomorrowISO = getTomorrowISODate();
      if (deliveryDateFilter === "today") {
        // Current Orders: no date, empty, today, or any past date (deliveryDate <= today)
        const todayClause = {
          $or: [
            { deliveryDate: null },
            { deliveryDate: "" },
            { deliveryDate: { $exists: false } },
            { deliveryDate: { $lte: todayISO } },
          ],
        };
        if (!filter.$and) filter.$and = [];
        if (filter.$or) {
          filter.$and.unshift({ $or: filter.$or });
          delete filter.$or;
        }
        filter.$and.push(todayClause);
      } else {
        // "tomorrow" / "other": exactly tomorrow's date only
        filter.deliveryDate = tomorrowISO;
      }
    }

    const sortDir = order === "asc" ? 1 : -1;
    const sortObj: any = {};
    const allowedSorts = ["createdAt", "customerName", "status"];
    sortObj[allowedSorts.includes(sort) ? sort : "createdAt"] = sortDir;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const scopedFilter = applyOrderScope(filter, req);
    if (scopedFilter === null) {
      res.json({ orders: [], total: 0, page: pageNum, limit: limitNum, pages: 0 });
      return;
    }

    const [orders, total] = await Promise.all([
      db.collection(COLLECTION).find(scopedFilter).sort(sortObj).skip(skip).limit(limitNum).toArray(),
      db.collection(COLLECTION).countDocuments(scopedFilter),
    ]);

    res.json({ orders, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });

    // Fire-and-forget: deduct inventory for any active orders that arrived without
    // going through applyOrderInventoryOnCreate (e.g. customer-app-created orders).
    autoDeductUndedcutedOrders(conn.db, orders as any[]).catch((e) =>
      req.log.error({ err: e }, "autoDeductUndedcutedOrders failed")
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list orders");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch orders" });
  }
});

// GET /api/orders/stats — summary counts per status
router.get("/stats", async (req: ScopedRequest, res) => {
  try {
    const conn = await getOrdersDb();
    const scopeClause = scopeOrderFilter(req);
    if (scopeClause === null) {
      res.json({ stats: {}, rawStats: {}, total: 0, currentTotal: 0, historyTotal: 0, todayTotal: 0, otherDayTotal: 0 });
      return;
    }
    const pipeline: any[] = [];
    if (Object.keys(scopeClause).length > 0) pipeline.push({ $match: scopeClause });
    pipeline.push({ $group: { _id: { status: "$status", deliveryType: "$deliveryType" }, count: { $sum: 1 } } });
    const agg = await conn.db.collection(COLLECTION).aggregate(pipeline).toArray();

    const ACTIVE = ["pending", "confirmed", "out_for_delivery"];
    const HISTORY = ["delivered", "cancelled"];

    // Raw per-status counts (used by some legacy callers).
    const rawStats: Record<string, number> = {};
    // Display stats: takeaway-deliveryType orders are bucketed under "takeaway",
    // not under their underlying status. Delivered/cancelled keep their status.
    const stats: Record<string, number> = {};
    let takeawayActive = 0;
    let takeawayHistory = 0;

    for (const row of agg) {
      const st = row._id?.status ?? "unknown";
      const dt = row._id?.deliveryType ?? "delivery";
      const c = row.count ?? 0;
      rawStats[st] = (rawStats[st] ?? 0) + c;
      if (dt === "takeaway") {
        if (HISTORY.includes(st)) {
          // Delivered/cancelled takeaway orders count under their final status,
          // not under the Takeaway bucket.
          stats[st] = (stats[st] ?? 0) + c;
          takeawayHistory += c;
        } else {
          takeawayActive += c;
        }
      } else {
        stats[st] = (stats[st] ?? 0) + c;
      }
    }
    stats.takeaway = takeawayActive;

    const total = Object.values(rawStats).reduce((a, b) => a + b, 0);
    const currentTotal = ACTIVE.reduce((s, k) => s + (stats[k] ?? 0), 0);
    const historyTotal = HISTORY.reduce((s, k) => s + (stats[k] ?? 0), 0) + takeawayActive;

    // Current / next-day counts for the tab badges
    // Current Orders = today, past, or no date set
    // Next Day Orders = exactly tomorrow's date
    const todayISO = getTodayISODate();
    const tomorrowISO = getTomorrowISODate();
    const activeNonTakeaway = {
      ...scopeClause,
      status: { $in: ACTIVE },
      deliveryType: { $ne: "takeaway" },
    };
    const [todayTotal, otherDayTotal] = await Promise.all([
      conn.db.collection(COLLECTION).countDocuments({
        ...activeNonTakeaway,
        $or: [
          { deliveryDate: null },
          { deliveryDate: "" },
          { deliveryDate: { $exists: false } },
          { deliveryDate: { $lte: todayISO } },
        ],
      }),
      conn.db.collection(COLLECTION).countDocuments({
        ...activeNonTakeaway,
        deliveryDate: tomorrowISO,
      }),
    ]);

    res.json({ stats, rawStats, total, currentTotal, historyTotal, todayTotal, otherDayTotal });
  } catch (err) {
    req.log.error({ err }, "Failed to get order stats");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch order stats" });
  }
});

// GET /api/orders/delivery-stats?assignedTo=ID — scoped stats for a delivery person
router.get("/delivery-stats", async (req: ScopedRequest, res) => {
  try {
    const { assignedTo = "" } = req.query as Record<string, string>;
    if (!assignedTo) {
      res.status(400).json({ error: "ValidationError", message: "assignedTo is required" });
      return;
    }

    const conn = await getOrdersDb();
    const col = conn.db.collection(COLLECTION);
    // Hub admins (super_hub / sub_hub) see only delivery stats from their own
    // hubs. Master admin and the delivery person themself see everything for
    // the assigned ID.
    const baseFilter: any = { assignedDeliveryPersonId: assignedTo };
    const scope = req.scope;
    if (scope && !scope.isMaster && scope.role !== "delivery_person") {
      if (scope.subHubIds.length === 0) {
        res.json({
          statusCounts: { pending: 0, confirmed: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 },
          totalAssigned: 0, activeCount: 0,
          today: { count: 0, revenue: 0, total: 0 }, week: { count: 0, revenue: 0, total: 0 },
          month: { count: 0, revenue: 0, total: 0 }, allTime: { count: 0, revenue: 0, total: 0 },
          monthly: [], recent: [],
        });
        return;
      }
      baseFilter.subHubId = { $in: scope.subHubIds };
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - 6); // last 7 days inclusive
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    function totalExpr() {
      // Prefer order.total when present; otherwise sum items.price * items.quantity.
      return {
        $cond: [
          { $gt: [{ $ifNull: ["$total", 0] }, 0] },
          "$total",
          {
            $sum: {
              $map: {
                input: { $ifNull: ["$items", []] },
                as: "i",
                in: {
                  $multiply: [
                    { $ifNull: ["$$i.price", 0] },
                    { $ifNull: ["$$i.quantity", 1] },
                  ],
                },
              },
            },
          },
        ],
      };
    }

    const [statusAgg, todayAgg, weekAgg, monthAgg, totalsAgg, monthlyAgg, recent] = await Promise.all([
      // status counts
      col.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),

      // today delivered (count + revenue collected)
      col.aggregate([
        { $match: { ...baseFilter, status: "delivered", updatedAt: { $gte: startOfDay } } },
        { $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$paidAmount", 0] } },
            total:   { $sum: totalExpr() },
        } },
      ]).toArray(),

      // last 7 days delivered
      col.aggregate([
        { $match: { ...baseFilter, status: "delivered", updatedAt: { $gte: startOfWeek } } },
        { $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$paidAmount", 0] } },
            total:   { $sum: totalExpr() },
        } },
      ]).toArray(),

      // current month delivered
      col.aggregate([
        { $match: { ...baseFilter, status: "delivered", updatedAt: { $gte: startOfMonth } } },
        { $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$paidAmount", 0] } },
            total:   { $sum: totalExpr() },
        } },
      ]).toArray(),

      // all-time delivered totals
      col.aggregate([
        { $match: { ...baseFilter, status: "delivered" } },
        { $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$paidAmount", 0] } },
            total:   { $sum: totalExpr() },
        } },
      ]).toArray(),

      // monthly trend (last 6 months) — delivered count + revenue collected
      col.aggregate([
        { $match: { ...baseFilter, status: "delivered", updatedAt: { $gte: sixMonthsAgo } } },
        { $group: {
            _id: { y: { $year: "$updatedAt" }, m: { $month: "$updatedAt" } },
            count:   { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$paidAmount", 0] } },
            total:   { $sum: totalExpr() },
        } },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]).toArray(),

      // recent 5 orders (any status)
      col.find(baseFilter).sort({ createdAt: -1 }).limit(5).toArray(),
    ]);

    const statusCounts: Record<string, number> = {
      pending: 0, confirmed: 0, out_for_delivery: 0, delivered: 0, cancelled: 0,
    };
    for (const row of statusAgg) {
      const k = String((row as any)._id ?? "unknown");
      statusCounts[k] = (statusCounts[k] ?? 0) + ((row as any).count ?? 0);
    }
    const totalAssigned = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const activeCount =
      statusCounts.pending + statusCounts.confirmed +
      statusCounts.out_for_delivery;

    function pickAgg(rows: any[]) {
      const r = rows[0] ?? {};
      return {
        count:   Number(r.count   ?? 0),
        revenue: Number(r.revenue ?? 0),
        total:   Number(r.total   ?? 0),
      };
    }

    // Build a 6-month window (fill empty months with zeros).
    const monthlyMap = new Map<string, { count: number; revenue: number; total: number }>();
    for (const row of monthlyAgg) {
      const id: any = (row as any)._id;
      const key = `${id.y}-${String(id.m).padStart(2, "0")}`;
      monthlyMap.set(key, {
        count:   Number((row as any).count   ?? 0),
        revenue: Number((row as any).revenue ?? 0),
        total:   Number((row as any).total   ?? 0),
      });
    }
    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthly: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = monthlyMap.get(key) ?? { count: 0, revenue: 0, total: 0 };
      monthly.push({
        month: `${monthLabels[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        delivered: v.count,
        revenue:   v.revenue,
        total:     v.total,
      });
    }

    res.json({
      statusCounts,
      totalAssigned,
      activeCount,
      today:  pickAgg(todayAgg),
      week:   pickAgg(weekAgg),
      month:  pickAgg(monthAgg),
      allTime: pickAgg(totalsAgg),
      monthly,
      recent,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get delivery stats");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch delivery stats" });
  }
});

/** Returns true if the order document is in the request user's scope. */
function isOrderInScope(scope: ScopedRequest["scope"], order: any, req?: ScopedRequest): boolean {
  if (!scope || scope.isMaster) return true;
  if (scope.role === "delivery_person") {
    const uid = req?.admin?.adminId ? String(req.admin.adminId) : "";
    const assigned = order?.assignedDeliveryPersonId ? String(order.assignedDeliveryPersonId) : "";
    return !!uid && uid === assigned;
  }
  const subId = order?.subHubId ? String(order.subHubId) : "";
  return !!subId && scope.subHubIds.includes(subId);
}

// POST /api/orders — create new order manually (admin)
router.post("/", async (req: ScopedRequest, res) => {
  try {
    const {
      customerId,
      customerName,
      phone,
      email,
      items,
      deliveryType,
      address,
      deliveryArea,
      notes,
      status,
      subHubId,
      subHubName,
      superHubId,
      superHubName,
      createCustomerIfMissing,
      newCustomerExtras,
      deliveryAddressDetail,
      subtotal,
      discount,
      slotCharge,
      deliveryCharge,
      extraDiscount,
      extraDiscountType,
      total: totalIn,
      couponId,
      couponCode,
      couponTitle,
      couponIds,
      couponCodes,
      coupons,
      paymentStatus,
      payments,
      paidAmount,
      paymentMode,
      scheduleType,
      deliveryDate,
      timeslotId,
      timeslotLabel,
      timeslotStart,
      timeslotEnd,
      isExpress,
    } = req.body ?? {};

    // Fall back to the name stored in the delivery address if the account has no name
    let effectiveCustomerName = customerName && String(customerName).trim() ? String(customerName).trim() : "";
    if (!effectiveCustomerName && deliveryAddressDetail && typeof deliveryAddressDetail === "object") {
      const addrName = (deliveryAddressDetail as any).name || (deliveryAddressDetail as any).contactName || "";
      if (addrName && String(addrName).trim()) {
        effectiveCustomerName = String(addrName).trim();
      }
    }
    if (!effectiveCustomerName) {
      res.status(400).json({ error: "ValidationError", message: "Customer name is required" });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "ValidationError", message: "At least one item is required" });
      return;
    }
    const dt = deliveryType === "takeaway" ? "takeaway" : "delivery";
    if (dt === "delivery" && !String(address ?? "").trim()) {
      res.status(400).json({ error: "ValidationError", message: "Delivery address is required" });
      return;
    }

    const cleanItems = items.map((it: any) => ({
      productId: it.productId ? String(it.productId) : undefined,
      name: String(it.name ?? "").trim(),
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
      unit: it.unit ?? "",
    })).filter((it: any) => it.name);

    if (cleanItems.length === 0) {
      res.status(400).json({ error: "ValidationError", message: "Items must have a name" });
      return;
    }

    if (status !== undefined && status !== null && status !== "" && !VALID_ORDER_STATUSES.has(String(status))) {
      res.status(400).json({ error: "ValidationError", message: `Invalid order status: ${status}` });
      return;
    }

    // Enforce hub scope on order creation: hub admins can only create orders
    // inside their own sub hubs.
    if (req.scope && !req.scope.isMaster) {
      const reqSub = subHubId ? String(subHubId) : "";
      if (!reqSub || !req.scope.subHubIds.includes(reqSub)) {
        res.status(403).json({ error: "Forbidden", message: "You can only create orders for your assigned sub hubs." });
        return;
      }
    }

    let resolvedCustomerId: string | undefined = customerId ? String(customerId) : undefined;

    // Optionally create customer if missing
    if (!resolvedCustomerId && createCustomerIfMissing && (email || phone)) {
      const cCol = await getCustomersCollection();
      const existing = email
        ? await cCol.findOne({ email: String(email).toLowerCase().trim() })
        : await cCol.findOne({ phone: String(phone).trim() });
      if (existing) {
        resolvedCustomerId = String(existing._id);
      } else {
        const extras = (newCustomerExtras && typeof newCustomerExtras === "object") ? newCustomerExtras : {};
        const firstAddress =
          dt === "delivery" && deliveryAddressDetail && typeof deliveryAddressDetail === "object"
            ? { label: "Home", ...deliveryAddressDetail }
            : dt === "delivery" && address
              ? { label: "Home", address: String(address).trim(), area: deliveryArea ?? "" }
              : null;
        const newCustomer = {
          name: effectiveCustomerName,
          email: email ? String(email).toLowerCase().trim() : "",
          phone: phone ? String(phone).trim() : "",
          alternatePhone: extras.alternatePhone ? String(extras.alternatePhone).trim() : "",
          dateOfBirth: extras.dateOfBirth ? String(extras.dateOfBirth).trim() : "",
          gender: extras.gender ? String(extras.gender).trim() : "",
          notes: extras.notes ? String(extras.notes).trim() : "",
          addresses: firstAddress ? [firstAddress] : [],
          orders: [],
          usedCoupons: [],
          activeCoupons: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const insert = await cCol.insertOne(newCustomer as any);
        resolvedCustomerId = String(insert.insertedId);
      }
    }

    const computedSubtotal = cleanItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const sub = Number(subtotal);
    const subTotalNum = Number.isFinite(sub) && sub > 0 ? sub : computedSubtotal;
    const discountNum = Math.max(0, Number(discount) || 0);
    const slotChargeNum = Math.max(0, Number(slotCharge) || 0);
    const deliveryChargeNum = Math.max(0, Number(deliveryCharge) || 0);
    const extraDiscountNum = Math.max(0, Number(extraDiscount) || 0);
    const totalNum = Number.isFinite(Number(totalIn)) && Number(totalIn) > 0
      ? Number(totalIn)
      : Math.max(0, subTotalNum - discountNum + slotChargeNum + deliveryChargeNum);

    const orderDoc: any = {
      customerId: resolvedCustomerId ?? undefined,
      customerName: effectiveCustomerName,
      phone: phone ? String(phone).trim() : "",
      email: email ? String(email).trim() : "",
      items: cleanItems,
      subtotal: subTotalNum,
      discount: discountNum,
      slotCharge: slotChargeNum,
      deliveryCharge: deliveryChargeNum,
      extraDiscount: extraDiscountNum,
      extraDiscountType: extraDiscountType ? String(extraDiscountType) : "flat",
      total: totalNum,
      deliveryType: dt,
      address: dt === "delivery" ? String(address ?? "").trim() : "",
      deliveryArea: dt === "delivery" ? String(deliveryArea ?? "").trim() : "",
      deliveryAddressDetail: dt === "delivery" && deliveryAddressDetail ? deliveryAddressDetail : undefined,
      pickupLocation: dt === "takeaway" ? (subHubName || "FishTokri Store") : "",
      notes: notes ? String(notes).trim() : "",
      status: status || "pending",
      source: "admin_manual",
      subHubId: subHubId ? String(subHubId) : undefined,
      subHubName: subHubName ?? undefined,
      superHubId: superHubId ? String(superHubId) : undefined,
      superHubName: superHubName ?? undefined,
      // Coupons (single + multi)
      couponId: couponId ? String(couponId) : undefined,
      couponCode: couponCode ?? undefined,
      couponTitle: couponTitle ?? undefined,
      couponIds: Array.isArray(couponIds) ? couponIds.map((x: any) => String(x)) : undefined,
      couponCodes: Array.isArray(couponCodes) ? couponCodes.map((x: any) => String(x)) : undefined,
      coupons: Array.isArray(coupons) ? coupons : undefined,
      // Payment — if grand total is zero (e.g. fully covered by coupon/discount),
      // always mark the order as paid regardless of what the client sent.
      paymentStatus: totalNum === 0
        ? "paid"
        : ["paid", "partial", "unpaid"].includes(String(paymentStatus))
          ? String(paymentStatus)
          : "unpaid",
      payments: Array.isArray(payments)
        ? payments
            .map((p: any) => ({
              mode: String(p?.mode ?? "").trim(),
              amount: Math.max(0, Number(p?.amount) || 0),
              reference: p?.reference ? String(p.reference).trim() : "",
              paidAt: p?.paidAt ? new Date(p.paidAt) : new Date(),
            }))
            .filter((p: any) => p.mode && p.amount > 0)
        : [],
      paidAmount: totalNum === 0 ? 0 : Math.max(0, Number(paidAmount) || 0),
      dueAmount: (totalNum === 0 || String(paymentStatus) === "paid") ? 0 : Math.max(0, totalNum - (Number(paidAmount) || 0)),
      paymentMode: paymentMode ? String(paymentMode) : undefined,
      // Schedule
      scheduleType: scheduleType === "instant" ? "instant" : scheduleType === "express" ? "express" : "slot",
      isExpress: !!isExpress,
      deliveryDate: deliveryDate ? String(deliveryDate) : undefined,
      timeslotId: timeslotId ? String(timeslotId) : undefined,
      timeslotLabel: timeslotLabel ?? undefined,
      timeslotStart: timeslotStart ?? undefined,
      timeslotEnd: timeslotEnd ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    Object.keys(orderDoc).forEach((k) => orderDoc[k] === undefined && delete orderDoc[k]);

    // --- Coupon maxUsage enforcement (BEFORE insert) ---
    // Check the coupon's maxUsage limit against the customer's total usage
    // (active orders + historically delivered orders). Blocks if the limit
    // has been reached. Also prunes any stale activeCoupons entries whose
    // referenced orders no longer exist.
    const preCheckCoupons = extractOrderCoupons(orderDoc);
    if (preCheckCoupons.length > 0 && resolvedCustomerId) {
      const cColPre = await getCustomersCollection();
      const customerDoc = await cColPre.findOne(
        { _id: toId(resolvedCustomerId) },
        { projection: { activeCoupons: 1, usedCoupons: 1 } },
      );

      for (const reqCoupon of preCheckCoupons) {
        // Count how many times this coupon is currently locked in active orders.
        const activeEntry = (customerDoc?.activeCoupons ?? []).find(
          (ac: any) => String(ac.couponId).trim() === reqCoupon.couponId,
        );
        // For old-format entries (no usedCount field), assume usedCount=1 if any entry exists.
        const activeUsedCount = activeEntry
          ? (activeEntry.usedCount != null ? (Number(activeEntry.usedCount) || 0) : 1)
          : 0;

        // Build the orderIds list — handle both new format (orderIds[]) and old format (orderId string).
        const rawOrderIds: string[] = activeEntry
          ? (Array.isArray(activeEntry.orderIds) && activeEntry.orderIds.length > 0
              ? activeEntry.orderIds
              : activeEntry.orderId
                ? [String(activeEntry.orderId)]
                : [])
          : [];

        // Prune stale orderIds from this entry (orders that no longer exist).
        if (activeEntry && rawOrderIds.length > 0) {
          const ordersConn = await getOrdersDb();
          const parsedIds = rawOrderIds
            .map((id: string) => { try { return toId(String(id)); } catch { return null; } })
            .filter(Boolean);
          const existingOrders = parsedIds.length > 0
            ? await ordersConn.db.collection(COLLECTION)
                .find({ _id: { $in: parsedIds } }, { projection: { _id: 1 } })
                .toArray()
            : [];
          const existingOrderIdSet = new Set(existingOrders.map((o: any) => String(o._id)));
          const staleOrderIds = rawOrderIds.filter((id: string) => !existingOrderIdSet.has(String(id)));
          if (staleOrderIds.length > 0) {
            for (const staleId of staleOrderIds) {
              await decrementActiveCoupon(cColPre, resolvedCustomerId!, reqCoupon.couponId, staleId, req.log);
            }
            req.log.info({ customerId: resolvedCustomerId, staleOrderIds }, "Pruned stale activeCoupons orderIds");
          }
          // Recompute activeUsedCount after pruning
          const refreshed = await cColPre.findOne(
            { _id: toId(resolvedCustomerId) },
            { projection: { activeCoupons: 1 } },
          );
          const refreshedEntry = (refreshed?.activeCoupons ?? []).find(
            (ac: any) => String(ac.couponId).trim() === reqCoupon.couponId,
          );
          // Use refreshed count going forward
          const liveActiveCount = refreshedEntry ? (Number(refreshedEntry.usedCount) || 0) : 0;

          // Count past (delivered) uses
          const historicalCount = (customerDoc?.usedCoupons ?? []).filter(
            (uc: any) => String(uc.couponId).trim() === reqCoupon.couponId,
          ).length;

          const totalUsage = liveActiveCount + historicalCount;

          // Fetch the coupon from the sub-hub DB to get maxUsage
          if (orderDoc.subHubName) {
            try {
              const subHubConn = await getSubHubDbConnection(String(orderDoc.subHubName));
              const couponDoc = await subHubConn.db.collection("coupons").findOne(
                { _id: toId(reqCoupon.couponId) },
                { projection: { maxUsage: 1, isActive: 1 } },
              );
              if (couponDoc && couponDoc.maxUsage != null) {
                const maxUsage = Number(couponDoc.maxUsage);
                if (maxUsage > 0 && totalUsage >= maxUsage) {
                  res.status(400).json({
                    error: "CouponUsageLimitReached",
                    message: `Coupon "${reqCoupon.couponCode || reqCoupon.couponId}" has reached its maximum usage limit for this customer.`,
                  });
                  return;
                }
              }
            } catch (e) {
              req.log.warn({ err: e, couponId: reqCoupon.couponId }, "Could not fetch coupon for maxUsage check — allowing");
            }
          }
          continue;
        }

        // No active entry with orderIds to prune — just check usage counts directly
        const historicalCount = (customerDoc?.usedCoupons ?? []).filter(
          (uc: any) => String(uc.couponId).trim() === reqCoupon.couponId,
        ).length;
        const totalUsage = activeUsedCount + historicalCount;

        if (orderDoc.subHubName) {
          try {
            const subHubConn = await getSubHubDbConnection(String(orderDoc.subHubName));
            const couponDoc = await subHubConn.db.collection("coupons").findOne(
              { _id: toId(reqCoupon.couponId) },
              { projection: { maxUsage: 1, isActive: 1 } },
            );
            if (couponDoc && couponDoc.maxUsage != null) {
              const maxUsage = Number(couponDoc.maxUsage);
              if (maxUsage > 0 && totalUsage >= maxUsage) {
                res.status(400).json({
                  error: "CouponUsageLimitReached",
                  message: `Coupon "${reqCoupon.couponCode || reqCoupon.couponId}" has reached its maximum usage limit for this customer.`,
                });
                return;
              }
            }
          } catch (e) {
            req.log.warn({ err: e, couponId: reqCoupon.couponId }, "Could not fetch coupon for maxUsage check — allowing");
          }
        }
      }
    }
    // --- End coupon maxUsage enforcement ---

    const conn = await getOrdersDb();
    orderDoc.orderId = await generateOrderId(conn.db);
    const result = await conn.db.collection(COLLECTION).insertOne(orderDoc);

    // Sync inventory (deduct stock for active orders).
    // Pre-claim the order with inventoryDeducted=true BEFORE calling applyOrderInventoryOnCreate.
    // This prevents the background deduction job from racing between the insert and the flag
    // being set — without this guard, both the POST handler and the background job could both
    // see inventoryDeducted=false and each deduct independently, causing a double deduction.
    const ORDER_DEDUCT_STATUSES = new Set(["pending", "confirmed", "out_for_delivery", "delivered", "takeaway"]);
    const shouldDeductOnCreate = ORDER_DEDUCT_STATUSES.has(String(orderDoc.status)) && !!orderDoc.subHubId;
    if (shouldDeductOnCreate) {
      await conn.db.collection(COLLECTION).updateOne(
        { _id: result.insertedId },
        { $set: { inventoryDeducted: true } }
      );
      orderDoc.inventoryDeducted = true;
    }
    try {
      req.log.info({ orderId: String(result.insertedId), subHubId: orderDoc.subHubId, status: orderDoc.status, itemCount: (orderDoc.items ?? []).length }, "order create: calling applyOrderInventoryOnCreate");
      const deducted = await applyOrderInventoryOnCreate({
        _id: result.insertedId,
        subHubId: orderDoc.subHubId,
        subHubName: orderDoc.subHubName,
        status: orderDoc.status,
        items: orderDoc.items,
      });
      req.log.info({ orderId: String(result.insertedId), deducted }, "order create: applyOrderInventoryOnCreate returned");
      if (!deducted && shouldDeductOnCreate) {
        // applyDelta found no matching products — reset flag so background job can retry later.
        await conn.db.collection(COLLECTION).updateOne(
          { _id: result.insertedId },
          { $set: { inventoryDeducted: false } }
        );
        orderDoc.inventoryDeducted = false;
      }
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        // Race condition: another order just took the last unit inside the lock.
        // Reset the pre-claim flag and cancel the just-inserted order.
        req.log.warn(
          { orderId: String(result.insertedId), product: e.productName, available: e.available, requested: e.requested },
          "order create: insufficient stock — cancelling order and returning 409"
        );
        try {
          await conn.db.collection(COLLECTION).updateOne(
            { _id: result.insertedId },
            { $set: { status: "cancelled", cancelReason: "out_of_stock", updatedAt: new Date(), inventoryDeducted: false } }
          );
        } catch (cancelErr) {
          req.log.error({ err: cancelErr, orderId: String(result.insertedId) }, "order create: failed to cancel oversell order");
        }
        res.status(409).json({
          error: "InsufficientStock",
          message: `"${e.productName}" is out of stock (only ${e.available} available, you requested ${e.requested}). Please update your order.`,
          productName: e.productName,
          available: e.available,
          requested: e.requested,
        });
        return;
      }
      // General deduction error — reset flag so background job can retry.
      if (shouldDeductOnCreate) {
        await conn.db.collection(COLLECTION).updateOne(
          { _id: result.insertedId },
          { $set: { inventoryDeducted: false } }
        );
        orderDoc.inventoryDeducted = false;
      }
      req.log.error({ err: e }, "Failed to sync inventory on order create");
    }

    // Mirror order payments into banking ▸ payments so the ledger stays in sync.
    if (Array.isArray(orderDoc.payments) && orderDoc.payments.length > 0) {
      try {
        await syncOrderBankPayments({
          orderId: String(result.insertedId),
          customerName: orderDoc.customerName,
          payments: orderDoc.payments,
          orderRef: `#${String(result.insertedId).slice(-6).toUpperCase()}`,
        });
      } catch (e) {
        req.log.error({ err: e }, "Failed to sync order payments to banking");
      }
    }

    // Deduct wallet balance if customer paid (partially or fully) using wallet.
    const walletPayments = (orderDoc.payments ?? []).filter((p: any) => p.mode === "wallet");
    const walletUsed = walletPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    if (walletUsed > 0 && resolvedCustomerId) {
      try {
        const cCol = await getCustomersCollection();
        await cCol.updateOne(
          { _id: toId(resolvedCustomerId) },
          { $inc: { walletBalance: -walletUsed } }
        );
        req.log.info({ customerId: resolvedCustomerId, deducted: walletUsed }, "Wallet deducted on order create");
      } catch (e) {
        req.log.error({ err: e }, "Failed to deduct wallet on order create");
      }
    }

    // Track coupon in customer's activeCoupons using the aggregated structure
    // (one entry per coupon, usedCount incremented per order).
    const orderCouponsOnCreate = extractOrderCoupons(orderDoc);
    if (orderCouponsOnCreate.length > 0 && resolvedCustomerId && orderDoc.status !== "cancelled") {
      const cCol = await getCustomersCollection();
      const orderId = String(result.insertedId);
      for (const c of orderCouponsOnCreate) {
        await upsertActiveCoupon(cCol, resolvedCustomerId, c, orderId, orderDoc.subHubId ?? "", req.log);
      }
      req.log.info({ customerId: resolvedCustomerId, orderId, coupons: orderCouponsOnCreate.length }, "Coupon lifecycle: upserted activeCoupons on order create");
    }

    res.status(201).json({ order: { ...orderDoc, _id: result.insertedId } });

    // Sync timeslot order counts to MongoDB immediately after creating an order.
    if (scheduleType === "slot" && timeslotId && orderDoc.subHubName) {
      syncTimeslotOrderCounts(String(timeslotId), String(orderDoc.subHubName), req.log);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "InternalError", message: "Failed to create order" });
  }
});

// GET /api/orders/:id — single order
router.get("/:id", async (req: ScopedRequest, res) => {
  try {
    const oid = toId(req.params.id);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid order ID" }); return; }
    const conn = await getOrdersDb();
    const order = await conn.db.collection(COLLECTION).findOne({ _id: oid });
    if (!order || !isOrderInScope(req.scope, order, req)) {
      res.status(404).json({ error: "NotFound", message: "Order not found" }); return;
    }
    res.json({ order });
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch order" });
  }
});

// PUT /api/orders/:id — update status / notes / customer info
router.put("/:id", async (req: ScopedRequest, res) => {
  try {
    const oid = toId(req.params.id);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid order ID" }); return; }
    const {
      status, notes,
      assignedDeliveryPersonId, assignedDeliveryPersonName,
      customerName, phone, email, address, deliveryArea, deliveryAddressDetail,
      paymentStatus, payments, paidAmount, paymentMode, upiVariant,
      items, deliveryType,
      superHubId, superHubName, subHubId, subHubName,
      scheduleType, deliveryDate, timeslotId, timeslotLabel, timeslotStart, timeslotEnd,
      couponId, couponCode, couponTitle, couponIds, couponCodes, coupons,
      subtotal, discount, slotCharge, deliveryCharge, extraDiscount, extraDiscountType, total,
      cancellationReason,
      walletTopup,
      walletAdjustment,
      isExpress,
    } = req.body;
    if (status !== undefined && !VALID_ORDER_STATUSES.has(String(status))) {
      res.status(400).json({ error: "ValidationError", message: `Invalid order status: ${status}` });
      return;
    }
    const update: any = { updatedAt: new Date() };
    if (status !== undefined) update.status = status;
    if (notes !== undefined) update.notes = notes;
    if (assignedDeliveryPersonId !== undefined) update.assignedDeliveryPersonId = assignedDeliveryPersonId;
    if (assignedDeliveryPersonName !== undefined) update.assignedDeliveryPersonName = assignedDeliveryPersonName;
    if (customerName !== undefined) update.customerName = customerName;
    if (phone !== undefined) update.phone = phone;
    if (email !== undefined) update.email = email;
    if (address !== undefined) update.address = address;
    if (deliveryArea !== undefined) update.deliveryArea = deliveryArea;
    if (deliveryAddressDetail !== undefined) update.deliveryAddressDetail = deliveryAddressDetail;
    if (deliveryType !== undefined) update.deliveryType = deliveryType;
    if (superHubId !== undefined) update.superHubId = superHubId;
    if (superHubName !== undefined) update.superHubName = superHubName;
    if (subHubId !== undefined) update.subHubId = subHubId;
    if (subHubName !== undefined) update.subHubName = subHubName;
    if (scheduleType !== undefined) update.scheduleType = scheduleType;
    if (isExpress !== undefined) update.isExpress = !!isExpress;
    if (deliveryDate !== undefined) update.deliveryDate = deliveryDate;
    if (timeslotId !== undefined) update.timeslotId = timeslotId;
    if (timeslotLabel !== undefined) update.timeslotLabel = timeslotLabel;
    if (timeslotStart !== undefined) update.timeslotStart = timeslotStart;
    if (timeslotEnd !== undefined) update.timeslotEnd = timeslotEnd;
    if (couponId !== undefined) update.couponId = couponId;
    if (couponCode !== undefined) update.couponCode = couponCode;
    if (couponTitle !== undefined) update.couponTitle = couponTitle;
    if (Array.isArray(couponIds)) update.couponIds = couponIds;
    if (Array.isArray(couponCodes)) update.couponCodes = couponCodes;
    if (Array.isArray(coupons)) update.coupons = coupons;
    if (subtotal !== undefined) update.subtotal = Number(subtotal) || 0;
    if (discount !== undefined) update.discount = Number(discount) || 0;
    if (slotCharge !== undefined) update.slotCharge = Number(slotCharge) || 0;
    if (deliveryCharge !== undefined) update.deliveryCharge = Number(deliveryCharge) || 0;
    if (extraDiscount !== undefined) update.extraDiscount = Number(extraDiscount) || 0;
    if (extraDiscountType !== undefined) update.extraDiscountType = String(extraDiscountType);
    if (total !== undefined) update.total = Number(total) || 0;
    if (cancellationReason !== undefined) {
      update.cancellationReason = cancellationReason ? String(cancellationReason).trim().slice(0, 500) : "";
    }
    if (Array.isArray(items)) {
      update.items = items.map((it: any) => ({
        productId: it?.productId ? String(it.productId) : undefined,
        name: String(it?.name ?? "").trim(),
        price: Number(it?.price) || 0,
        quantity: Number(it?.quantity) || 0,
        unit: String(it?.unit ?? "").trim(),
      })).filter((it: any) => it.name && it.quantity > 0);
    }

    if (paymentStatus !== undefined && ["paid", "partial", "unpaid"].includes(String(paymentStatus))) {
      update.paymentStatus = String(paymentStatus);
    }
    if (paymentMode !== undefined) update.paymentMode = paymentMode ? String(paymentMode) : "";
    if (upiVariant !== undefined) update.upiVariant = upiVariant ? String(upiVariant).trim() : null;
    if (Array.isArray(payments)) {
      update.payments = payments
        .map((p: any) => ({
          mode: String(p?.mode ?? "").trim(),
          amount: Math.max(0, Number(p?.amount) || 0),
          reference: p?.reference ? String(p.reference).trim() : "",
          paidAt: p?.paidAt ? new Date(p.paidAt) : new Date(),
        }))
        .filter((p: any) => p.mode && p.amount > 0);
    }
    if (paidAmount !== undefined) {
      const paidNum = Math.max(0, Number(paidAmount) || 0);
      update.paidAmount = paidNum;
      // recompute due against existing total (fall back to items sum for legacy orders)
      const conn0 = await getOrdersDb();
      const existing = await conn0.db.collection(COLLECTION).findOne(
        { _id: oid },
        { projection: { total: 1, items: 1 } }
      );
      let totalNum = Number(existing?.total) || 0;
      if (totalNum <= 0 && Array.isArray(existing?.items)) {
        totalNum = existing.items.reduce(
          (s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1),
          0
        );
        update.total = totalNum;
      }
      const effectivePaymentStatus = update.paymentStatus ?? (await (async () => {
        const o = await (await getOrdersDb()).db.collection(COLLECTION).findOne({ _id: oid }, { projection: { paymentStatus: 1 } });
        return o?.paymentStatus ?? "unpaid";
      })());
      update.dueAmount = String(effectivePaymentStatus) === "paid" ? 0 : Math.max(0, totalNum - paidNum);
    }
    const conn = await getOrdersDb();
    const prev = await conn.db.collection(COLLECTION).findOne({ _id: oid });
    if (!prev || !isOrderInScope(req.scope, prev, req)) {
      res.status(404).json({ error: "NotFound", message: "Order not found" }); return;
    }
    // Hub admins cannot reassign an order to a sub hub outside their scope.
    if (req.scope && !req.scope.isMaster && update.subHubId !== undefined) {
      const targetSub = update.subHubId ? String(update.subHubId) : "";
      if (!targetSub || !req.scope.subHubIds.includes(targetSub)) {
        res.status(403).json({ error: "Forbidden", message: "You cannot reassign this order to a sub hub outside your scope." });
        return;
      }
    }

    // Guard: out_for_delivery / delivered require an assigned delivery partner
    // (only applies to delivery-type orders, not takeaway).
    if (status !== undefined && (status === "out_for_delivery" || status === "delivered")) {
      const effectiveDeliveryType = update.deliveryType ?? prev.deliveryType ?? "delivery";
      if (effectiveDeliveryType !== "takeaway") {
        const effectiveAssignee =
          update.assignedDeliveryPersonId !== undefined
            ? update.assignedDeliveryPersonId
            : prev.assignedDeliveryPersonId;
        if (!effectiveAssignee) {
          res.status(400).json({
            error: "DeliveryPartnerRequired",
            message: "Assign a delivery partner before marking the order as Out for Delivery or Delivered.",
          });
          return;
        }
      }
    }

    // If the order is being moved OUT of "delivered" back to an earlier
    // active status (e.g. pending / confirmed / out_for_delivery), the
    // previously recorded payment is no longer relevant — clear it so the
    // next "delivered" transition prompts for fresh payment info.
    let clearPayments = false;
    if (
      status !== undefined &&
      prev.status === "delivered" &&
      status !== "delivered" &&
      status !== "cancelled" &&
      !Array.isArray(payments) // don't override an explicit payments update
    ) {
      clearPayments = true;
      update.payments = [];
      update.paidAmount = 0;
      update.paymentMode = "";
      const totalForDue = Number((update.total ?? prev.total)) || 0;
      // If the order total is zero (fully discounted), keep it paid; otherwise revert to unpaid.
      if (totalForDue === 0) {
        update.paymentStatus = "paid";
        update.dueAmount = 0;
      } else {
        update.paymentStatus = "unpaid";
        update.dueAmount = totalForDue;
      }
    }
    // Final guard: if the resolved paymentStatus is "paid", dueAmount must be 0.
    const finalPaymentStatus = update.paymentStatus ?? String(prev.paymentStatus ?? "");
    if (finalPaymentStatus === "paid") {
      update.dueAmount = 0;
    }

    const result = await conn.db.collection(COLLECTION).findOneAndUpdate(
      { _id: oid },
      { $set: update },
      { returnDocument: "after" }
    );
    if (!result) { res.status(404).json({ error: "NotFound", message: "Order not found" }); return; }

    // Sync inventory if status transitioned between active/cancelled.
    try {
      const wasDeducted = (prev as any).inventoryDeducted === true;
      const nowDeducted = await applyOrderInventoryOnUpdate(
        prev as any,
        result as any,
        wasDeducted,
      );
      if (wasDeducted !== nowDeducted) {
        await conn.db.collection(COLLECTION).updateOne(
          { _id: oid },
          { $set: { inventoryDeducted: nowDeducted } }
        );
        (result as any).inventoryDeducted = nowDeducted;
      }
    } catch (e) {
      req.log.error({ err: e }, "Failed to sync inventory on order update");
    }

    // Handle explicit walletAdjustment: positive = credit to customer wallet, negative = debit.
    // This is used when the collected amount differs from the outstanding amount at delivery.
    if (walletAdjustment !== undefined && (result as any).customerId) {
      const adj = Number(walletAdjustment) || 0;
      if (adj !== 0) {
        try {
          const cCol = await getCustomersCollection();
          await cCol.updateOne(
            { _id: new mongoose.Types.ObjectId(String((result as any).customerId)) },
            { $inc: { walletBalance: adj } }
          );
          req.log.info({ customerId: (result as any).customerId, walletAdjustment: adj }, "Wallet adjusted from delivery payment difference");
        } catch (e) {
          req.log.error({ err: e }, "Failed to apply walletAdjustment");
        }
      }
    }

    // Handle wallet payment entries: when "wallet" mode payments change, apply the delta to customer wallet.
    // Positive delta = credit (overpayment going to wallet). Negative delta = debit (not typical on update).
    if (Array.isArray(payments) && (result as any).customerId) {
      try {
        const prevWalletTotal = ((prev as any).payments ?? [])
          .filter((p: any) => p.mode === "wallet")
          .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
        const newWalletTotal = ((result as any).payments ?? [])
          .filter((p: any) => p.mode === "wallet")
          .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
        const walletDelta = newWalletTotal - prevWalletTotal;
        if (walletDelta !== 0) {
          const cCol = await getCustomersCollection();
          await cCol.updateOne(
            { _id: new mongoose.Types.ObjectId(String((result as any).customerId)) },
            { $inc: { walletBalance: walletDelta } }
          );
          req.log.info({ customerId: (result as any).customerId, delta: walletDelta }, "Wallet updated from delivery payment");
        }
      } catch (e) {
        req.log.error({ err: e }, "Failed to update wallet from delivery payment");
      }
    }

    // Handle wallet refund/re-deduction based on status-only transitions.
    // These cases are separate from explicit payment-array updates handled above.
    if (status !== undefined && String(status) !== String(prev.status ?? "") && (result as any).customerId) {
      const prevStatus = String(prev.status ?? "");
      const newStatus = String(status);
      const wasNotCancelled = prevStatus !== "cancelled";
      const isNowCancelled = newStatus === "cancelled";
      const wasCancelled = prevStatus === "cancelled";
      try {
        // Case 1: Order just cancelled — refund any wallet payments back to the customer.
        // Only fires when payments array is not explicitly provided (that case is handled above).
        if (isNowCancelled && wasNotCancelled && !Array.isArray(payments)) {
          const walletToRefund = ((prev as any).payments ?? [])
            .filter((p: any) => p.mode === "wallet")
            .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
          if (walletToRefund > 0) {
            const cCol = await getCustomersCollection();
            await cCol.updateOne(
              { _id: new mongoose.Types.ObjectId(String((result as any).customerId)) },
              { $inc: { walletBalance: walletToRefund } }
            );
            req.log.info({ customerId: (result as any).customerId, refunded: walletToRefund }, "Wallet refunded on order cancellation");
          }
        }

        // Case 2: Order un-cancelled (moved from cancelled → active) — re-deduct wallet payments.
        // Only fires when payments array is not explicitly provided.
        if (wasCancelled && !isNowCancelled && !Array.isArray(payments)) {
          const walletToDeduct = ((result as any).payments ?? [])
            .filter((p: any) => p.mode === "wallet")
            .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
          if (walletToDeduct > 0) {
            const cCol = await getCustomersCollection();
            await cCol.updateOne(
              { _id: new mongoose.Types.ObjectId(String((result as any).customerId)) },
              { $inc: { walletBalance: -walletToDeduct } }
            );
            req.log.info({ customerId: (result as any).customerId, deducted: walletToDeduct }, "Wallet re-deducted on order re-activation from cancelled");
          }
        }

        // Case 3: Order moved OUT of "delivered" (payments cleared) — refund any wallet used.
        // clearPayments wipes the payments array so we look at prev.payments for the amount.
        if (clearPayments && !isNowCancelled && !Array.isArray(payments)) {
          const walletToRefund = ((prev as any).payments ?? [])
            .filter((p: any) => p.mode === "wallet")
            .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
          if (walletToRefund > 0) {
            const cCol = await getCustomersCollection();
            await cCol.updateOne(
              { _id: new mongoose.Types.ObjectId(String((result as any).customerId)) },
              { $inc: { walletBalance: walletToRefund } }
            );
            req.log.info({ customerId: (result as any).customerId, refunded: walletToRefund }, "Wallet refunded when order moved out of delivered status");
          }
        }
      } catch (e) {
        req.log.error({ err: e }, "Failed to update wallet on order status transition");
      }
    }

    // Sync customer's activeCoupons / usedCoupons when order status changes.
    if (status !== undefined && status !== prev.status && (result as any).customerId) {
      const orderCouponsOnUpdate = extractOrderCoupons(prev);
      await syncCustomerCouponsOnStatusChange(
        await getCustomersCollection(),
        String((result as any).customerId),
        String(oid),
        orderCouponsOnUpdate,
        String(prev.status ?? ""),
        String(status),
        String((result as any).subHubId ?? ""),
        req.log,
      );
    }

    // If the payments list was touched, re-sync this order's banking payments.
    if (Array.isArray(payments) || clearPayments) {
      try {
        await syncOrderBankPayments({
          orderId: String((result as any)._id),
          customerName: (result as any).customerName,
          payments: (result as any).payments || [],
          orderRef: `#${String((result as any)._id).slice(-6).toUpperCase()}`,
        });
      } catch (e) {
        req.log.error({ err: e }, "Failed to sync order payments to banking");
      }
    }

    res.json({ order: result });

    // Sync timeslot order counts to MongoDB after any status change on a slot order.
    if ((result as any).scheduleType === "slot" && (result as any).timeslotId && (result as any).subHubName) {
      syncTimeslotOrderCounts(String((result as any).timeslotId), String((result as any).subHubName), req.log);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update order");
    res.status(500).json({ error: "InternalError", message: "Failed to update order" });
  }
});

// DELETE /api/orders/:id — delete an order
router.delete("/:id", async (req: ScopedRequest, res) => {
  try {
    const oid = toId(req.params.id);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid order ID" }); return; }
    const conn = await getOrdersDb();
    req.log.info({ id: req.params.id, oid: oid.toHexString() }, "Attempting to delete order");
    const existing = await conn.db.collection(COLLECTION).findOne({ _id: oid });
    if (!existing || !isOrderInScope(req.scope, existing, req)) {
      res.status(404).json({ error: "NotFound", message: "Order not found" }); return;
    }
    const result = await conn.db.collection(COLLECTION).deleteOne({ _id: oid });
    req.log.info({ deletedCount: result.deletedCount }, "Delete result");
    if (result.deletedCount === 0) { res.status(404).json({ error: "NotFound", message: "Order not found" }); return; }

    // Restore inventory for any deducted items.
    try {
      await applyOrderInventoryOnDelete(existing as any, (existing as any).inventoryDeducted === true);
    } catch (e) {
      req.log.error({ err: e }, "Failed to restore inventory on order delete");
    }

    try {
      await syncOrderBankPayments({ orderId: req.params.id, payments: [] });
    } catch (e) {
      req.log.error({ err: e }, "Failed to remove order payments from banking");
    }

    // Refund wallet if the deleted order had wallet payments and was NOT already cancelled.
    // Cancelled orders already had their wallet refunded at the time of cancellation.
    if ((existing as any).customerId && (existing as any).status !== "cancelled") {
      try {
        const walletToRefund = ((existing as any).payments ?? [])
          .filter((p: any) => p.mode === "wallet")
          .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
        if (walletToRefund > 0) {
          const cCol = await getCustomersCollection();
          await cCol.updateOne(
            { _id: new mongoose.Types.ObjectId(String((existing as any).customerId)) },
            { $inc: { walletBalance: walletToRefund } }
          );
          req.log.info({ customerId: (existing as any).customerId, refunded: walletToRefund }, "Wallet refunded on order delete");
        }
      } catch (e) {
        req.log.error({ err: e }, "Failed to refund wallet on order delete");
      }
    }

    // Release coupon locks when an order is deleted.
    // Decrement usedCount in activeCoupons (removes entry if count reaches 0).
    // If the order was already delivered, usedCoupons history is preserved.
    if ((existing as any).customerId) {
      try {
        const deletedCoupons = extractOrderCoupons(existing);
        if (deletedCoupons.length > 0) {
          const cCol = await getCustomersCollection();
          const orderId = req.params.id;
          const wasDelivered = (existing as any).status === "delivered";
          if (!wasDelivered) {
            for (const c of deletedCoupons) {
              await decrementActiveCoupon(cCol, String((existing as any).customerId), c.couponId, orderId, req.log);
            }
            req.log.info({ customerId: (existing as any).customerId, orderId }, "Coupon lifecycle: activeCoupons decremented on order delete");
          }
        }
      } catch (e) {
        req.log.error({ err: e }, "Failed to clean up coupon on order delete");
      }
    }

    // Remove the deleted order's stored ref from the customer's orders array.
    // Without this, the customer detail page still shows the order as "active"
    // because enrichCustomers falls back to the stale ref in customer.orders.
    if ((existing as any).customerId) {
      try {
        const cCol = await getCustomersCollection();
        const orderId = req.params.id;
        await cCol.updateOne(
          { _id: new mongoose.Types.ObjectId(String((existing as any).customerId)) },
          { $pull: { orders: { $or: [{ _id: oid }, { id: orderId }, { orderId }] } } as any }
        );
        req.log.info({ customerId: (existing as any).customerId, orderId }, "Removed order ref from customer.orders on delete");
      } catch (e) {
        req.log.error({ err: e }, "Failed to remove order ref from customer on delete");
      }
    }

    res.json({ success: true });

    // Sync timeslot order counts to MongoDB after deleting a slot order.
    if ((existing as any).scheduleType === "slot" && (existing as any).timeslotId && (existing as any).subHubName) {
      syncTimeslotOrderCounts(String((existing as any).timeslotId), String((existing as any).subHubName), req.log);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to delete order");
    res.status(500).json({ error: "InternalError", message: "Failed to delete order" });
  }
});

export default router;
