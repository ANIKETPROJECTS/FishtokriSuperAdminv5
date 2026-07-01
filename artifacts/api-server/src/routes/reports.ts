import { Router } from "express";
import mongoose from "mongoose";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";
import { SubHub } from "../db/models/sub-hub.js";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";

const router = Router();
router.use(requireAuth as any);
router.use(loadScope as any);

const ORDERS_DB = "orders";

async function getOrdersDb() {
  return getSubHubDbConnection(ORDERS_DB);
}

function toId(id: string): mongoose.mongo.BSON.ObjectId | null {
  try { return new mongoose.mongo.ObjectId(id); } catch { return null; }
}

function scopeOrderFilter(req: ScopedRequest): Record<string, any> | null {
  const scope = req.scope;
  if (!scope || scope.isMaster) return {};
  if (scope.subHubIds.length === 0) return null;
  return { subHubId: { $in: scope.subHubIds } };
}

// ─── ORDERS DAY-END REPORT ──────────────────────────────────────────────────
// GET /api/reports/day-end/orders?from=YYYY-MM-DD&to=YYYY-MM-DD&subHubId=xxx
router.get("/day-end/orders", async (req: ScopedRequest, res) => {
  try {
    const conn = await getOrdersDb();
    const db = conn.db;

    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    const subHubIdFilter = String(req.query.subHubId || "");

    const scopeClause = scopeOrderFilter(req);
    if (scopeClause === null) {
      res.json({ orders: [], total: 0 });
      return;
    }

    const filter: any = { ...scopeClause };

    if (from || to) {
      const dateClause: any = {};
      if (from) dateClause.$gte = from;
      if (to) dateClause.$lte = to;
      filter.deliveryDate = dateClause;
    }

    if (subHubIdFilter) {
      filter.subHubId = subHubIdFilter;
    }

    const orders = await db.collection("orders")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();

    const formatted = orders.map((o: any) => {
      const items: any[] = Array.isArray(o.items) ? o.items : [];
      const payments: any[] = Array.isArray(o.payments) ? o.payments : [];

      // Derive payment mode label (use upiVariant when the mode is UPI)
      const upiLabel = o.upiVariant ? String(o.upiVariant).trim() : "UPI";
      let paymentMode = "—";
      if (payments.length > 0) {
        let modes = [...new Set(payments.map((p: any) => (p.mode || "").toLowerCase()).filter(Boolean))];
        // Business rule: an order cannot be both Cash and UPI simultaneously.
        // If both exist in payments[] it is a data error — treat as UPI only (drop cash).
        const isUpiVariant = (m: string) => m === "upi" || m.includes("gpay") || m.includes("paytm") || m.includes("phonepe");
        const hasCashMode = modes.some(m => m === "cash" || m === "cod");
        const hasUpiMode  = modes.some(m => isUpiVariant(m));
        if (hasCashMode && hasUpiMode) {
          modes = modes.filter(m => m !== "cash" && m !== "cod");
        }
        paymentMode = modes.map((m: string) => {
          if (m === "cash" || m === "cod") return "Cash";
          if (isUpiVariant(m)) return upiLabel;
          if (m === "card") return "Card";
          if (m === "wallet") return "Wallet";
          if (m === "bank") return "Bank";
          return m.charAt(0).toUpperCase() + m.slice(1);
        }).join(", ");
      } else if (o.paymentMode) {
        const m = String(o.paymentMode).toLowerCase();
        if (m === "cash" || m === "cod") paymentMode = "Cash";
        else if (m === "upi") paymentMode = upiLabel;
        else if (m === "card") paymentMode = "Card";
        else if (m === "wallet") paymentMode = "Wallet";
        else paymentMode = o.paymentMode;
      }

      // Payment status label
      const statusMap: Record<string, string> = {
        paid: "Paid",
        partial: "Partial",
        unpaid: "Unpaid",
        pending: "Pending",
      };
      const paymentStatus = statusMap[(o.paymentStatus || "").toLowerCase()] || o.paymentStatus || "—";

      return {
        _id: String(o._id),
        orderId: o.orderId || null,
        invoiceNo: o.orderId || `#${String(o._id).slice(-6).toUpperCase()}`,
        customerName: o.customerName || "—",
        phone: o.phone || o.customerPhone || "—",
        address: [o.address, o.deliveryArea, o.deliveryAddressDetail]
          .map((v: any) => (v && typeof v === "object" ? null : v))
          .filter(Boolean).join(", ") || o.pickupLocation || "—",
        items: items.map((it: any) => ({
          name: it.name || "Unknown",
          quantity: Number(it.quantity) || 1,
          unit: it.unit || "",
          price: Number(it.price) || 0,
        })),
        itemsSummary: items.map((it: any) =>
          `${it.name} x${it.quantity}${it.unit ? " " + it.unit : ""}`
        ).join(", "),
        subtotal: Number(o.subtotal) || 0,
        total: Number(o.total) || 0,
        discount: Number(o.discount) || 0,
        extraDiscount: Number(o.extraDiscount) || 0,
        extraDiscountType: o.extraDiscountType || "flat",
        couponCode: o.couponCode || "",
        slotCharge: Number(o.slotCharge) || 0,
        deliveryCharge: Number(o.deliveryCharge) || 0,
        paidAmount: Number(o.paidAmount) ?? null,
        dueAmount: Number(o.dueAmount) ?? null,
        walletUsed: Number(o.walletUsed) || 0,
        payments: payments.map((p: any) => ({
          mode: String(p.mode || "").toLowerCase(),
          amount: Number(p.amount) || 0,
        })),
        deliveryPerson: o.assignedDeliveryPersonName || "—",
        paymentMode,
        upiVariant: o.upiVariant || null,
        paymentStatus,
        status: o.status || "—",
        deliveryDate: o.deliveryDate || "",
        subHubName: o.subHubName || "—",
        timeslotStart: o.timeslotStart || null,
        timeslotEnd: o.timeslotEnd || null,
        timeslotLabel: o.timeslotLabel || null,
        isExpress: !!o.isExpress,
        notes: o.notes || "",
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
      };
    });

    // ── Server-side cash collection calculation log ──────────────────────────
    // Mirrors the frontend stats logic: cash = total - walletUsed (from payments[])
    let logCash = 0, logUpi = 0, logCard = 0;
    const cashBreakdown: Array<{ invoiceNo: string; total: number; walletUsed: number; cashCollected: number }> = [];
    for (const o of formatted) {
      const isCancelled = String(o.status || "").toLowerCase() === "cancelled";
      const isUnpaid = String(o.paymentStatus || "").toLowerCase() === "unpaid";
      if (isCancelled || isUnpaid) continue;

      const pays: Array<{ mode: string; amount: number }> = Array.isArray(o.payments) ? o.payments : [];
      const total = Number(o.total) || 0;

      const nonWalletPays = pays.filter(p => p.mode !== "wallet");
      if (nonWalletPays.length === 0) continue;

      const walletFromPays = pays
        .filter(p => p.mode === "wallet")
        .reduce((s, p) => s + p.amount, 0);
      const nonWalletPaid = nonWalletPays.reduce((s, p) => s + p.amount, 0);
      const scaleFactor = nonWalletPaid > 0
        ? Math.min(1, Math.max(0, total - walletFromPays) / nonWalletPaid)
        : 0;
      const isUpiLike = (m: string) =>
        m === "upi" || m.includes("gpay") || m.includes("paytm") || m.includes("phonepe");

      for (const p of nonWalletPays) {
        const m = p.mode;
        const amt = p.amount * scaleFactor;
        if (m === "cash" || m === "cod") {
          logCash += amt;
          cashBreakdown.push({ invoiceNo: o.invoiceNo, total, walletUsed: walletFromPays, cashCollected: amt });
        } else if (isUpiLike(m)) {
          logUpi += amt;
        } else if (m === "card") {
          logCard += amt;
        }
      }
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    req.log.info(
      {
        from,
        to,
        totalOrders: formatted.length,
        cashTotal: r2(logCash),
        upiTotal: r2(logUpi),
        cardTotal: r2(logCard),
        cashBreakdown,
      },
      "Day-end cash collection calculation"
    );
    // ────────────────────────────────────────────────────────────────────────

    res.json({ orders: formatted, total: formatted.length });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch day-end orders report");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch orders report" });
  }
});

// ─── INVENTORY DAY-END REPORT ───────────────────────────────────────────────
// GET /api/reports/day-end/inventory?subHubId=xxx
router.get("/day-end/inventory", async (req: ScopedRequest, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) {
      res.status(400).json({ error: "ValidationError", message: "subHubId is required" });
      return;
    }

    const scope = req.scope;
    if (scope && !scope.isMaster && !scope.subHubIds.includes(subHubId)) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this sub hub" });
      return;
    }

    const sub = await SubHub.findById(subHubId).lean();
    if (!sub) { res.status(404).json({ error: "NotFound", message: "Sub hub not found" }); return; }
    if (!sub.dbName) { res.status(400).json({ error: "NoDB", message: "Sub hub has no database linked" }); return; }

    const conn = await getSubHubDbConnection(sub.dbName);
    const products = await conn.db.collection("products")
      .find({})
      .sort({ category: 1, name: 1 })
      .toArray();

    const now = Date.now();

    const formatted = products.map((p: any) => {
      const batches: any[] = Array.isArray(p.batches) ? p.batches : [];
      const normalizedBatches = batches.map((b: any) => {
        const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
        const received = b.receivedDate ? new Date(b.receivedDate) : null;
        const daysLeft = expiry
          ? Math.ceil((expiry.getTime() - now) / (1000 * 60 * 60 * 24))
          : null;
        return {
          batchId: String(b._id || ""),
          batchNumber: b.batchNumber || "—",
          quantity: Number(b.quantity) || 0,
          receivedDate: received ? received.toISOString().slice(0, 10) : null,
          expiryDate: expiry ? expiry.toISOString().slice(0, 10) : null,
          shelfLifeDays: b.shelfLifeDays ?? null,
          daysLeft,
          isExpired: daysLeft !== null && daysLeft < 0,
          notes: b.notes || "",
        };
      });

      const totalQty = normalizedBatches.reduce((s: number, b: any) => s + b.quantity, 0);
      const activeQty = normalizedBatches
        .filter((b: any) => !b.isExpired)
        .reduce((s: number, b: any) => s + b.quantity, 0);

      return {
        productId: String(p._id),
        name: p.name || "—",
        category: p.category || "—",
        unit: p.unit || "",
        price: Number(p.price) || 0,
        totalQuantity: totalQty,
        activeQuantity: activeQty,
        status: p.status || "available",
        batches: normalizedBatches,
      };
    });

    res.json({
      products: formatted,
      total: formatted.length,
      subHub: { id: String(sub._id), name: sub.name, dbName: sub.dbName },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch day-end inventory report");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch inventory report" });
  }
});

// ─── WASTAGE REPORT ─────────────────────────────────────────────────────────
// GET /api/reports/wastage?subHubId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/wastage", async (req: ScopedRequest, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) {
      res.status(400).json({ error: "ValidationError", message: "subHubId is required" });
      return;
    }

    const scope = req.scope;
    if (scope && !scope.isMaster && !scope.subHubIds.includes(subHubId)) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this sub hub" });
      return;
    }

    const sub = await SubHub.findById(subHubId).lean();
    if (!sub) { res.status(404).json({ error: "NotFound", message: "Sub hub not found" }); return; }
    if (!sub.dbName) { res.status(400).json({ error: "NoDB", message: "Sub hub has no database linked" }); return; }

    const conn = await getSubHubDbConnection(sub.dbName);

    const from = String(req.query.from || "");
    const to = String(req.query.to || "");

    const fromDate = from ? new Date(from + "T00:00:00") : null;
    const toDate = to ? new Date(to + "T23:59:59") : null;

    // ── 1. Manually reduced stock: inventory_movements where type=adjustment & change<0 ──
    const movFilter: any = { type: "adjustment", change: { $lt: 0 } };
    if (fromDate || toDate) {
      const clause: any = {};
      if (fromDate) clause.$gte = fromDate;
      if (toDate) clause.$lte = toDate;
      movFilter.createdAt = clause;
    }

    const movements = await conn.db.collection("inventory_movements")
      .find(movFilter)
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();

    // Look up prices + batches for products referenced in movements
    const movProductIdStrs = [...new Set(movements.map((m: any) => String(m.productId)).filter(Boolean))];
    const priceMap = new Map<string, number>();
    // batchMap: productId -> Map<batchNumber, batch>
    const batchMap = new Map<string, Map<string, any>>();
    // batchIdMap: productId -> Map<_id string, batch>  (used to resolve batchObjectId → batchNumber)
    const batchIdMap = new Map<string, Map<string, any>>();
    if (movProductIdStrs.length > 0) {
      const prods = await conn.db.collection("products")
        .find({
          _id: {
            $in: movProductIdStrs.map((id) => {
              try { return new mongoose.mongo.ObjectId(id); } catch { return null; }
            }).filter(Boolean),
          },
        })
        .project({ _id: 1, price: 1, batches: 1 })
        .toArray();
      for (const p of prods) {
        const pid = String(p._id);
        priceMap.set(pid, Number(p.price) || 0);
        const bMap = new Map<string, any>();
        const bIdMap = new Map<string, any>();
        if (Array.isArray(p.batches)) {
          for (const b of p.batches) {
            if (b.batchNumber) bMap.set(String(b.batchNumber), b);
            if (b._id) bIdMap.set(String(b._id), b);
          }
        }
        batchMap.set(pid, bMap);
        batchIdMap.set(pid, bIdMap);
      }
    }

    // Helper: a valid batch name is a non-empty alphanumeric string (no scientific notation / raw ObjectIds)
    function isValidBatchName(v: any): boolean {
      if (!v || typeof v !== "string") return false;
      const s = v.trim();
      if (s.length === 0 || s.length > 60) return false;
      // Reject values that contain scientific notation (e.g. "5005.005e+22")
      if (/\d[eE][+\-]\d/.test(s) || (s.includes(".") && /e[+\-]/i.test(s))) return false;
      return true;
    }

    const reducedItems = movements.map((m: any) => {
      const qty = Math.abs(Number(m.change) || 0);
      const pid = String(m.productId);
      const price = priceMap.get(pid) || 0;
      const productBatches = batchMap.get(pid);
      const productBatchesById = batchIdMap.get(pid);

      // Resolve the best batch name:
      // 1. movement's own batchNumber (if valid)
      // 2. look up batch by batchObjectId in the product's current batches → get its batchNumber
      let batchId: string | null = null;
      if (m.batchNumber && isValidBatchName(m.batchNumber)) {
        batchId = String(m.batchNumber).trim();
      } else if (m.batchObjectId) {
        const batchDoc = productBatchesById?.get(String(m.batchObjectId));
        if (batchDoc?.batchNumber && isValidBatchName(batchDoc.batchNumber)) {
          batchId = String(batchDoc.batchNumber).trim();
        }
      }

      // Look up matched batch for date fields (by batchNumber key)
      const matchedBatch = batchId ? productBatches?.get(batchId) : undefined;
      // dateAdded: use movement's stored receivedDate, then matched batch lookup
      const dateAdded = m.receivedDate
        ? new Date(m.receivedDate).toISOString().slice(0, 10)
        : matchedBatch?.receivedDate
          ? new Date(matchedBatch.receivedDate).toISOString().slice(0, 10)
          : null;
      // expiryDate: use movement's stored expiryDate, then matched batch lookup
      const expiryDate = m.expiryDate
        ? new Date(m.expiryDate).toISOString().slice(0, 10)
        : matchedBatch?.expiryDate
          ? new Date(matchedBatch.expiryDate).toISOString().slice(0, 10)
          : null;
      return {
        id: String(m._id),
        batchId,
        dateAdded,
        expiryDate,
        item: m.productName || "—",
        type: "reduced",
        quantity: qty,
        unit: m.unit || "",
        totalPrice: parseFloat((qty * price).toFixed(2)),
        operationDate: m.createdAt ? new Date(m.createdAt).toISOString() : null,
        reason: m.reason || "",
        notes: m.notes || "",
      };
    });

    // ── 2. Expired batches: find products with batches whose expiryDate has passed ──
    const now = new Date();
    const expBatchFilter: any = {
      "batches.expiryDate": { $lt: now },
    };
    // If date range given, filter expired batches by their expiryDate falling in range
    if (fromDate || toDate) {
      const clause: any = { $lt: now };
      if (fromDate) clause.$gte = fromDate;
      if (toDate) clause.$lte = toDate;
      expBatchFilter["batches.expiryDate"] = clause;
    }

    const expiredProducts = await conn.db.collection("products")
      .find(expBatchFilter)
      .toArray();

    const expiredItems: any[] = [];
    for (const p of expiredProducts) {
      const batches: any[] = Array.isArray(p.batches) ? p.batches : [];
      for (const b of batches) {
        if (!b.expiryDate) continue;
        const expiry = new Date(b.expiryDate);
        if (expiry >= now) continue;
        if (fromDate && expiry < fromDate) continue;
        if (toDate && expiry > toDate) continue;
        const qty = Number(b.quantity) || 0;
        const price = Number(p.price) || 0;
        expiredItems.push({
          id: String(b._id || b.batchNumber || ""),
          batchId: (b.batchNumber && isValidBatchName(b.batchNumber)) ? String(b.batchNumber).trim() : null,
          dateAdded: b.receivedDate ? new Date(b.receivedDate).toISOString().slice(0, 10) : null,
          expiryDate: expiry.toISOString().slice(0, 10),
          item: p.name || "—",
          type: "expired",
          quantity: qty,
          unit: p.unit || "",
          totalPrice: parseFloat((qty * price).toFixed(2)),
          operationDate: expiry.toISOString(),
          reason: "",
          notes: b.notes || "",
        });
      }
    }

    // Combine and sort by operationDate descending
    const all = [...reducedItems, ...expiredItems].sort((a, b) => {
      const da = a.operationDate ? new Date(a.operationDate).getTime() : 0;
      const db2 = b.operationDate ? new Date(b.operationDate).getTime() : 0;
      return db2 - da;
    });

    res.json({
      records: all,
      total: all.length,
      subHub: { id: String(sub._id), name: sub.name },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch wastage report");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch wastage report" });
  }
});

export default router;
