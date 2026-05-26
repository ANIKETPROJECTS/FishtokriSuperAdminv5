import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { SubHub } from "../db/models/sub-hub.js";
import { SuperHub } from "../db/models/super-hub.js";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";

const router: IRouter = Router();
router.use(requireAuth as any);
router.use(loadScope as any);

const MOVEMENTS_COLLECTION = "inventory_movements";
const ADJUSTMENTS_COLLECTION = "inventory_adjustments";

function toId(id: string) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

/**
 * Returns true if the request user is allowed to access the given sub hub.
 * Master admins always have access; non-master users must have the sub hub
 * in their resolved scope.
 */
function userCanAccessSubHub(req: ScopedRequest, subHubId: string): boolean {
  const scope = req.scope;
  if (!scope || scope.isMaster) return true;
  return scope.subHubIds.includes(String(subHubId));
}

async function getCtx(subHubId: string, res: any, req?: ScopedRequest) {
  if (req && !userCanAccessSubHub(req, subHubId)) {
    res.status(403).json({ error: "Forbidden", message: "You do not have access to this sub hub" });
    return null;
  }
  const sub = await SubHub.findById(subHubId);
  if (!sub) { res.status(404).json({ error: "NotFound", message: "Sub hub not found" }); return null; }
  if (!sub.dbName) { res.status(400).json({ error: "NoDB", message: "Sub hub has no database linked" }); return null; }
  const conn = await getSubHubDbConnection(sub.dbName);
  return { sub, conn };
}

// ─── BATCH HELPERS ────────────────────────────────────────────────────────────
type Batch = {
  _id?: any;
  batchNumber?: string;
  quantity: number;
  shelfLifeDays?: number | null;
  receivedDate?: Date | null;
  expiryDate?: Date | null;
  notes?: string;
  createdAt?: Date;
};

function toDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeBatch(b: any): Batch {
  const received = toDate(b?.receivedDate) ?? new Date();
  const shelf = b?.shelfLifeDays != null && b.shelfLifeDays !== "" ? Number(b.shelfLifeDays) : null;
  let expiry = toDate(b?.expiryDate);
  if (!expiry && shelf != null && Number.isFinite(shelf)) {
    expiry = new Date(received.getTime() + shelf * 24 * 60 * 60 * 1000);
  }
  return {
    _id: b?._id ?? new mongoose.Types.ObjectId(),
    batchNumber: b?.batchNumber ? String(b.batchNumber).trim() : "",
    quantity: Math.max(0, Number(b?.quantity) || 0),
    shelfLifeDays: shelf != null && Number.isFinite(shelf) ? shelf : null,
    receivedDate: received,
    expiryDate: expiry,
    notes: b?.notes ? String(b.notes).trim() : "",
    createdAt: b?.createdAt ? new Date(b.createdAt) : new Date(),
  };
}

function batchesTotal(batches: Batch[] | undefined | null): number {
  if (!Array.isArray(batches)) return 0;
  return batches.reduce((s, b) => s + (Number(b?.quantity) || 0), 0);
}

function sortBatchesFIFO(batches: Batch[]): Batch[] {
  // earliest expiry first; batches without expiry sort to the end
  return [...batches].sort((a, b) => {
    const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
    const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
    if (ax !== bx) return ax - bx;
    const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ac - bc;
  });
}

/**
 * Consume `qty` units from batches FIFO (earliest expiry first),
 * skipping any batches that have already expired.
 * Expired batches are preserved unchanged in the returned list so
 * admins can still see and remove them manually.
 * If non-expired batches are insufficient, `remaining` will be > 0.
 */
function consumeBatches(batches: Batch[], qty: number, now: Date = new Date()): { batches: Batch[]; remaining: number } {
  const nowMs = now.getTime();

  // Split into expired (untouched) and active (eligible for deduction)
  const expired = batches.filter((b) => b.expiryDate && new Date(b.expiryDate).getTime() < nowMs);
  const active  = batches.filter((b) => !b.expiryDate || new Date(b.expiryDate).getTime() >= nowMs);

  let remaining = qty;
  const sorted = sortBatchesFIFO(active);
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    b.quantity -= take;
    remaining -= take;
  }

  // Drop emptied active batches; keep expired batches as-is
  const result = [...expired, ...sorted.filter((b) => b.quantity > 0)];
  return { batches: result, remaining };
}

/**
 * Sync a product document so `quantity` matches the sum of its batches,
 * keeps batches normalized and persisted.
 */
async function persistBatches(productsCol: any, productId: any, batches: Batch[], extra: Record<string, any> = {}) {
  const normalized = batches.map((b) => normalizeBatch(b));
  const total = batchesTotal(normalized);
  await productsCol.updateOne(
    { _id: productId },
    { $set: { batches: normalized, quantity: total, updatedAt: new Date(), ...extra } }
  );
  return { batches: normalized, quantity: total };
}

// ─── ANALYTICS SUMMARY (across sub-hubs in the user's scope) ─────────────────
router.get("/analytics/summary", async (req: ScopedRequest, res) => {
  try {
    const scope = req.scope;
    const subFilter: any = {};
    if (scope && !scope.isMaster) {
      const ids = scope.subHubIds.map((id) => {
        try { return new mongoose.Types.ObjectId(id); } catch { return null; }
      }).filter(Boolean) as mongoose.Types.ObjectId[];
      if (ids.length === 0) {
        res.json({
          overview: {
            totalSubHubs: 0, trackedSubHubs: 0, totalProducts: 0, activeProducts: 0,
            outOfStockCount: 0, lowStockCount: 0, expiringSoonCount: 0, expiredCount: 0,
            totalStockValue: 0, totalQuantity: 0, categoryCount: 0,
            movementsTotal: 0, movements30d: 0, adjustmentsTotal: 0, adjustments30d: 0,
          },
          lowStock: [], expiringBatches: [], recentMovements: [], subHubBreakdown: [],
        });
        return;
      }
      subFilter._id = { $in: ids };
    }
    const subs = await SubHub.find(subFilter).lean();
    let totalProducts = 0;
    let activeProducts = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    let totalStockValue = 0;
    let totalQuantity = 0;
    let movements30d = 0;
    let movementsTotal = 0;
    let adjustments30d = 0;
    let adjustmentsTotal = 0;
    let categories = new Set<string>();

    type LowItem = { id: string; name: string; quantity: number; unit: string; category: string; subHubName: string; subHubId: string };
    type ExpiringItem = { id: string; name: string; quantity: number; unit: string; expiryDate: string; subHubName: string; subHubId: string; daysLeft: number };
    type SubSummary = { id: string; name: string; products: number; outOfStock: number; lowStock: number; stockValue: number };
    type RecentMove = any;
    const lowItems: LowItem[] = [];
    const expiringItems: ExpiringItem[] = [];
    const subSummaries: SubSummary[] = [];
    const recent: RecentMove[] = [];

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const soonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const sub of subs) {
      if (!sub.dbName) continue;
      const conn = await getSubHubDbConnection(sub.dbName);
      const productsCol = conn.db.collection("products");
      const movementsCol = conn.db.collection(MOVEMENTS_COLLECTION);
      const adjustmentsCol = conn.db.collection(ADJUSTMENTS_COLLECTION);

      const products = await productsCol.find({}).toArray();
      let subStockValue = 0;
      let subOut = 0;
      let subLow = 0;
      for (const p of products) {
        const batches: Batch[] = Array.isArray(p.batches) ? p.batches : [];
        const qty = batches.length > 0 ? batchesTotal(batches) : (Number(p.quantity) || 0);
        const price = Number(p.price) || 0;
        totalProducts += 1;
        totalQuantity += qty;
        totalStockValue += qty * price;
        subStockValue += qty * price;
        if ((p.status ?? "available") === "available") activeProducts += 1;
        if (p.category) categories.add(String(p.category));
        if (qty <= 0) { outOfStockCount += 1; subOut += 1; }
        else if (qty < 5) {
          lowStockCount += 1;
          subLow += 1;
          lowItems.push({
            id: String(p._id),
            name: p.name ?? "",
            quantity: qty,
            unit: p.unit ?? "",
            category: p.category ?? "",
            subHubName: sub.name ?? "",
            subHubId: String(sub._id),
          });
        }
        for (const b of batches) {
          if (!b.expiryDate || (Number(b.quantity) || 0) <= 0) continue;
          const exp = new Date(b.expiryDate);
          if (isNaN(exp.getTime())) continue;
          const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          if (exp.getTime() < now.getTime()) {
            expiredCount += 1;
            expiringItems.push({
              id: String(p._id), name: p.name ?? "", quantity: Number(b.quantity) || 0, unit: p.unit ?? "",
              expiryDate: exp.toISOString(), subHubName: sub.name ?? "", subHubId: String(sub._id), daysLeft,
            });
          } else if (exp.getTime() <= soonCutoff.getTime()) {
            expiringSoonCount += 1;
            expiringItems.push({
              id: String(p._id), name: p.name ?? "", quantity: Number(b.quantity) || 0, unit: p.unit ?? "",
              expiryDate: exp.toISOString(), subHubName: sub.name ?? "", subHubId: String(sub._id), daysLeft,
            });
          }
        }
      }
      subSummaries.push({
        id: String(sub._id),
        name: sub.name ?? "",
        products: products.length,
        outOfStock: subOut,
        lowStock: subLow,
        stockValue: subStockValue,
      });

      const [moveTotal, moveRecent, adjTotal, adjRecent, recentDocs] = await Promise.all([
        movementsCol.countDocuments({}),
        movementsCol.countDocuments({ createdAt: { $gte: since30 } }),
        adjustmentsCol.countDocuments({}),
        adjustmentsCol.countDocuments({ createdAt: { $gte: since30 } }),
        movementsCol.find({}).sort({ createdAt: -1 }).limit(8).toArray(),
      ]);
      movementsTotal += moveTotal;
      movements30d += moveRecent;
      adjustmentsTotal += adjTotal;
      adjustments30d += adjRecent;
      for (const m of recentDocs) {
        recent.push({ ...m, subHubName: sub.name ?? "", subHubId: String(sub._id) });
      }
    }

    lowItems.sort((a, b) => a.quantity - b.quantity);
    expiringItems.sort((a, b) => a.daysLeft - b.daysLeft);
    recent.sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
    subSummaries.sort((a, b) => b.stockValue - a.stockValue);

    res.json({
      overview: {
        totalSubHubs: subs.length,
        trackedSubHubs: subs.filter((s) => s.dbName).length,
        totalProducts,
        activeProducts,
        outOfStockCount,
        lowStockCount,
        expiringSoonCount,
        expiredCount,
        totalStockValue,
        totalQuantity,
        categoryCount: categories.size,
        movementsTotal,
        movements30d,
        adjustmentsTotal,
        adjustments30d,
      },
      lowStock: lowItems.slice(0, 10),
      expiringBatches: expiringItems.slice(0, 12),
      recentMovements: recent.slice(0, 10),
      subHubBreakdown: subSummaries.slice(0, 8),
    });
  } catch (err) {
    res.status(500).json({ error: "InternalError", message: "Failed to fetch inventory analytics" });
  }
});

// ─── PRODUCT LIST (for selected sub-hub) ──────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const search = String(req.query.search || "");
    const query: any = search ? { name: { $regex: search, $options: "i" } } : {};
    const products = await ctx.conn.db.collection("products").find(query).sort({ category: 1, name: 1 }).toArray();
    res.json({
      products: products.map((p: any) => {
        const batches: Batch[] = Array.isArray(p.batches) ? p.batches : [];
        const qty = batches.length > 0 ? batchesTotal(batches) : (Number(p.quantity) || 0);
        return {
          id: String(p._id),
          name: p.name,
          category: p.category ?? "",
          subCategory: p.subCategory ?? "",
          unit: p.unit ?? "",
          price: Number(p.price) || 0,
          quantity: qty,
          status: p.status ?? "available",
          imageUrl: p.imageUrl ?? "",
          batches: sortBatchesFIFO(batches).map((b) => ({
            id: String(b._id ?? ""),
            batchNumber: b.batchNumber ?? "",
            quantity: Number(b.quantity) || 0,
            shelfLifeDays: b.shelfLifeDays ?? null,
            receivedDate: b.receivedDate ? new Date(b.receivedDate).toISOString() : null,
            expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString() : null,
            notes: b.notes ?? "",
            createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : null,
          })),
        };
      }),
      total: products.length,
      subHub: { id: String(ctx.sub._id), name: ctx.sub.name, dbName: ctx.sub.dbName },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list inventory products");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch products" });
  }
});

// ─── MOVEMENT HISTORY ─────────────────────────────────────────────────────────
router.get("/movements", async (req, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const productId = String(req.query.productId || "");
    const orderId = String(req.query.orderId || "");
    const type = String(req.query.type || "");
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const filter: any = {};
    if (productId) filter.productId = productId;
    if (orderId) filter.orderId = orderId;
    if (type) filter.type = type;
    const rows = await ctx.conn.db
      .collection(MOVEMENTS_COLLECTION)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    res.json({ movements: rows, total: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list inventory movements");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch movements" });
  }
});

// ─── ADJUSTMENTS ──────────────────────────────────────────────────────────────
router.get("/adjustments", async (req, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const rows = await ctx.conn.db
      .collection(ADJUSTMENTS_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    res.json({ adjustments: rows, total: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list inventory adjustments");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch adjustments" });
  }
});

router.post("/adjustments", async (req, res) => {
  try {
    const { subHubId, superHubId, date, reason, notes, items } = req.body ?? {};
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "ValidationError", message: "At least one item is required" }); return;
    }
    if (!reason || !String(reason).trim()) {
      res.status(400).json({ error: "ValidationError", message: "Reason is required" }); return;
    }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;

    const superHub = superHubId ? await SuperHub.findById(superHubId) : null;
    const products = ctx.conn.db.collection("products");
    const movements = ctx.conn.db.collection(MOVEMENTS_COLLECTION);

    const adjustmentItems: any[] = [];
    const movementDocs: any[] = [];
    const now = new Date();

    for (const it of items) {
      const pid = toId(String(it.productId || ""));
      if (!pid) continue;
      const existing = await products.findOne({ _id: pid });
      if (!existing) continue;

      const currentBatches: Batch[] = Array.isArray(existing.batches) ? existing.batches.map((b: any) => normalizeBatch(b)) : [];
      const before = batchesTotal(currentBatches) || (Number(existing.quantity) || 0);

      const mode = String(it.mode || (it.addQuantity != null ? "add" : it.removeQuantity != null ? "remove" : "set"));

      let newBatches = [...currentBatches];
      let delta = 0;
      let appliedBatch: Batch | null = null;

      if (mode === "add") {
        const addQty = Math.max(0, Number(it.addQuantity) || 0);
        if (addQty <= 0) continue;
        const batch = normalizeBatch({
          batchNumber: it.batchNumber,
          quantity: addQty,
          shelfLifeDays: it.shelfLifeDays,
          expiryDate: it.expiryDate,
          receivedDate: it.receivedDate ?? now,
          notes: it.notes,
          createdAt: now,
        });
        newBatches.push(batch);
        delta = addQty;
        appliedBatch = batch;
      } else if (mode === "remove") {
        const rmQty = Math.max(0, Number(it.removeQuantity) || 0);
        if (rmQty <= 0) continue;
        const consumed = consumeBatches(currentBatches, rmQty);
        newBatches = consumed.batches;
        delta = -(rmQty - consumed.remaining);
        if (delta === 0) continue;
      } else {
        // legacy "set" mode (no batch info) — keep behaviour for backward compat
        const newQty = Number(it.newQuantity);
        if (!Number.isFinite(newQty)) continue;
        delta = newQty - before;
        if (delta === 0 && !it.force) {
          adjustmentItems.push({
            productId: String(pid), productName: existing.name, unit: existing.unit ?? "",
            quantityBefore: before, newQuantity: newQty, quantityAdjusted: 0, mode: "set",
          });
          continue;
        }
        if (delta > 0) {
          // treat as new batch with optional shelf life
          const batch = normalizeBatch({
            quantity: delta,
            shelfLifeDays: it.shelfLifeDays,
            expiryDate: it.expiryDate,
            receivedDate: now,
            createdAt: now,
          });
          newBatches.push(batch);
          appliedBatch = batch;
        } else {
          const consumed = consumeBatches(currentBatches, -delta);
          newBatches = consumed.batches;
          if (consumed.remaining > 0 && currentBatches.length === 0) {
            // legacy product without batches: just set total directly
            newBatches = [];
          }
        }
      }

      const persisted = await persistBatches(products, pid, newBatches);

      adjustmentItems.push({
        productId: String(pid),
        productName: existing.name,
        unit: existing.unit ?? "",
        quantityBefore: before,
        newQuantity: persisted.quantity,
        quantityAdjusted: delta,
        mode,
        batch: appliedBatch ? {
          batchNumber: appliedBatch.batchNumber,
          quantity: appliedBatch.quantity,
          shelfLifeDays: appliedBatch.shelfLifeDays,
          expiryDate: appliedBatch.expiryDate,
        } : undefined,
      });
      movementDocs.push({
        type: "adjustment",
        productId: String(pid),
        productName: existing.name,
        unit: existing.unit ?? "",
        change: delta,
        balance: persisted.quantity,
        reason: String(reason).trim(),
        notes: notes ? String(notes).trim() : "",
        batchNumber: appliedBatch?.batchNumber || undefined,
        expiryDate: appliedBatch?.expiryDate || undefined,
        createdAt: now,
      });
    }

    if (adjustmentItems.length === 0) {
      res.status(400).json({ error: "ValidationError", message: "No valid items to adjust" }); return;
    }

    if (movementDocs.length > 0) await movements.insertMany(movementDocs);

    const adjustmentDoc = {
      date: date ? new Date(date) : now,
      reason: String(reason).trim(),
      notes: notes ? String(notes).trim() : "",
      subHubId: String(ctx.sub._id),
      subHubName: ctx.sub.name,
      superHubId: superHub ? String(superHub._id) : "",
      superHubName: superHub?.name ?? "",
      items: adjustmentItems,
      createdAt: now,
    };
    const result = await ctx.conn.db.collection(ADJUSTMENTS_COLLECTION).insertOne(adjustmentDoc);
    res.status(201).json({ adjustment: { ...adjustmentDoc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create inventory adjustment");
    res.status(500).json({ error: "InternalError", message: "Failed to save adjustment" });
  }
});

// ─── PER-PRODUCT BATCH ENDPOINTS ──────────────────────────────────────────────
router.get("/products/:productId/batches", async (req, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const pid = toId(req.params.productId);
    if (!pid) { res.status(400).json({ error: "InvalidId", message: "Invalid product id" }); return; }
    const product = await ctx.conn.db.collection("products").findOne({ _id: pid });
    if (!product) { res.status(404).json({ error: "NotFound", message: "Product not found" }); return; }
    const batches: Batch[] = Array.isArray(product.batches) ? product.batches : [];
    res.json({
      productId: String(pid),
      name: product.name,
      unit: product.unit ?? "",
      quantity: batchesTotal(batches) || (Number(product.quantity) || 0),
      batches: sortBatchesFIFO(batches),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch batches");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch batches" });
  }
});

router.delete("/products/:productId/batches/:batchId", async (req, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const pid = toId(req.params.productId);
    if (!pid) { res.status(400).json({ error: "InvalidId", message: "Invalid product id" }); return; }
    const product = await ctx.conn.db.collection("products").findOne({ _id: pid });
    if (!product) { res.status(404).json({ error: "NotFound", message: "Product not found" }); return; }
    const batches: Batch[] = Array.isArray(product.batches) ? product.batches.map((b: any) => normalizeBatch(b)) : [];
    const remaining = batches.filter((b) => String(b._id) !== String(req.params.batchId));
    const persisted = await persistBatches(ctx.conn.db.collection("products"), pid, remaining);
    res.json({ productId: String(pid), quantity: persisted.quantity, batches: persisted.batches });
  } catch (err) {
    req.log.error({ err }, "Failed to delete batch");
    res.status(500).json({ error: "InternalError", message: "Failed to delete batch" });
  }
});

// PUT /api/inventory/products/:productId/batches — replace batches for a product
router.put("/products/:productId/batches", async (req, res) => {
  try {
    const subHubId = String(req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const pid = toId(req.params.productId);
    if (!pid) { res.status(400).json({ error: "InvalidId", message: "Invalid product id" }); return; }
    const product = await ctx.conn.db.collection("products").findOne({ _id: pid });
    if (!product) { res.status(404).json({ error: "NotFound", message: "Product not found" }); return; }
    const batches: Batch[] = Array.isArray(req.body.batches) ? req.body.batches : [];
    const persisted = await persistBatches(ctx.conn.db.collection("products"), pid, batches);
    res.json({ productId: String(pid), quantity: persisted.quantity, batches: persisted.batches });
  } catch (err) {
    req.log.error({ err }, "Failed to update batches");
    res.status(500).json({ error: "InternalError", message: "Failed to update batches" });
  }
});

// POST /api/inventory/init-product-batches — one-time migration: add empty batch to products without any batch
router.post("/init-product-batches", async (req, res) => {
  try {
    const subHubId = String((req.body as any)?.subHubId || req.query.subHubId || "");
    if (!subHubId) { res.status(400).json({ error: "ValidationError", message: "subHubId is required" }); return; }
    const ctx = await getCtx(subHubId, res, req as ScopedRequest);
    if (!ctx) return;
    const productsCol = ctx.conn.db.collection("products");
    const allProducts = await productsCol.find({}).toArray();
    let initialized = 0;
    let skipped = 0;
    for (const p of allProducts) {
      const existingBatches: Batch[] = Array.isArray(p.batches) ? p.batches : [];
      if (existingBatches.length === 0) {
        const emptyBatch = normalizeBatch({ batchNumber: "BATCH-1", quantity: 0, receivedDate: new Date(), notes: "" });
        await persistBatches(productsCol, p._id, [emptyBatch]);
        initialized++;
      } else {
        skipped++;
      }
    }
    res.json({ message: `Done. Added initial batch to ${initialized} products; ${skipped} already had batches.`, initialized, skipped });
  } catch (err) {
    req.log.error({ err }, "Failed to init product batches");
    res.status(500).json({ error: "InternalError", message: "Failed to init batches" });
  }
});

// ─── ORDER SYNC HELPERS (used by orders.ts) ───────────────────────────────────
type OrderForSync = {
  _id: any;
  subHubId?: string;
  subHubName?: string;
  status?: string;
  items?: Array<{ productId?: string; name?: string; quantity?: number; unit?: string }>;
};

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "out_for_delivery", "delivered", "takeaway"]);

function orderShouldDeduct(order: OrderForSync) {
  if (!order || !order.subHubId) return false;
  const status = String(order.status ?? "").toLowerCase();
  return ACTIVE_STATUSES.has(status);
}

async function applyDelta(order: OrderForSync, direction: "deduct" | "restore") {
  if (!order.subHubId) return;
  const sub = await SubHub.findById(order.subHubId);
  if (!sub?.dbName) return;
  const conn = await getSubHubDbConnection(sub.dbName);
  const products = conn.db.collection("products");
  const movements = conn.db.collection(MOVEMENTS_COLLECTION);
  const now = new Date();
  const orderId = String(order._id);
  const orderRef = `#${orderId.slice(-6).toUpperCase()}`;
  const items = Array.isArray(order.items) ? order.items : [];

  for (const it of items) {
    if (!it.productId) continue;
    const pid = toId(String(it.productId));
    if (!pid) continue;
    const qty = Math.max(0, Number(it.quantity) || 0);
    if (qty <= 0) continue;

    const existing = await products.findOne({ _id: pid });
    if (!existing) continue;
    const currentBatches: Batch[] = Array.isArray(existing.batches) ? existing.batches.map((b: any) => normalizeBatch(b)) : [];

    let newBatches = currentBatches;
    let appliedExpiry: Date | null = null;
    if (direction === "deduct") {
      if (currentBatches.length > 0) {
        const now2 = new Date();
        const nowMs2 = now2.getTime();
        const consumed = consumeBatches(currentBatches, qty, now2);
        newBatches = consumed.batches;
        // Pick expiry from the oldest active (non-expired) batch that was consumed
        const activeSorted = sortBatchesFIFO(
          currentBatches.filter((b) => !b.expiryDate || new Date(b.expiryDate).getTime() >= nowMs2)
        );
        appliedExpiry = activeSorted[0]?.expiryDate ?? null;
      } else {
        // legacy product with no batches — just decrement quantity
        await products.updateOne(
          { _id: pid },
          { $inc: { quantity: -qty }, $set: { updatedAt: now } }
        );
        const after = await products.findOne({ _id: pid }, { projection: { quantity: 1, name: 1, unit: 1 } });
        await movements.insertOne({
          type: "order_deduct", productId: String(pid),
          productName: (after as any)?.name ?? it.name ?? "",
          unit: (after as any)?.unit ?? it.unit ?? "",
          change: -qty, balance: Number((after as any)?.quantity) || 0,
          orderId, orderRef, createdAt: now,
        });
        continue;
      }
    } else {
      // restore: push back as a new "restored" batch (preserves traceability)
      newBatches = [...currentBatches, normalizeBatch({
        batchNumber: `RESTORE-${orderRef}`,
        quantity: qty,
        receivedDate: now,
        notes: `Restored from order ${orderRef}`,
        createdAt: now,
      })];
    }

    const persisted = await persistBatches(products, pid, newBatches);
    await movements.insertOne({
      type: direction === "deduct" ? "order_deduct" : "order_restore",
      productId: String(pid),
      productName: existing.name ?? it.name ?? "",
      unit: existing.unit ?? it.unit ?? "",
      change: direction === "deduct" ? -qty : qty,
      balance: persisted.quantity,
      orderId,
      orderRef,
      expiryDate: appliedExpiry || undefined,
      createdAt: now,
    });
  }
}

/**
 * Atomically claims and deducts inventory for orders that arrived without
 * going through applyOrderInventoryOnCreate (e.g. customer-app-created orders
 * inserted directly into MongoDB). Uses findOneAndUpdate with an inventoryDeducted
 * condition to prevent double-deduction if multiple requests run concurrently.
 */
export async function autoDeductUndedcutedOrders(
  ordersDb: any,
  orders: Array<{ _id: any; status?: string; subHubId?: string; subHubName?: string; items?: any[]; inventoryDeducted?: boolean }>
): Promise<void> {
  const candidates = orders.filter(
    (o) => ACTIVE_STATUSES.has(String(o.status ?? "").toLowerCase()) && o.inventoryDeducted !== true
  );
  if (candidates.length === 0) return;

  for (const order of candidates) {
    try {
      // Atomically claim this order for deduction: only succeeds if inventoryDeducted is still not true
      const claimed = await ordersDb.collection("orders").findOneAndUpdate(
        { _id: order._id, inventoryDeducted: { $ne: true } },
        { $set: { inventoryDeducted: true } },
        { returnDocument: "before" }
      );
      if (!claimed) continue; // another request already claimed it
      // Run the actual stock deduction
      await applyDelta(
        { _id: order._id, subHubId: order.subHubId, subHubName: order.subHubName, status: order.status, items: order.items },
        "deduct"
      );
    } catch {
      // Revert the flag so it can be retried next time
      try {
        await ordersDb.collection("orders").updateOne(
          { _id: order._id },
          { $set: { inventoryDeducted: false } }
        );
      } catch { /* best-effort */ }
    }
  }
}

export async function applyOrderInventoryOnCreate(order: OrderForSync) {
  if (!orderShouldDeduct(order)) return false;
  await applyDelta(order, "deduct");
  return true;
}

export async function applyOrderInventoryOnDelete(order: OrderForSync, wasDeducted: boolean) {
  if (!wasDeducted) return false;
  if (!order?.subHubId) return false;
  await applyDelta(order, "restore");
  return true;
}

function itemsSignature(items: any): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((i: any) => `${i?.productId ?? ""}:${Number(i?.quantity) || 0}`)
    .filter((s: string) => s !== ":0")
    .sort()
    .join("|");
}

export async function applyOrderInventoryOnUpdate(prev: OrderForSync, next: OrderForSync, wasDeducted: boolean) {
  const wantsDeducted = orderShouldDeduct(next);
  if (!wasDeducted && wantsDeducted) {
    await applyDelta(next, "deduct");
    return true;
  }
  if (wasDeducted && !wantsDeducted) {
    // Restore using the previous items snapshot (in case items changed)
    await applyDelta({ ...prev, _id: next._id }, "restore");
    return false;
  }
  if (wasDeducted && wantsDeducted) {
    // Both active: if items or sub-hub changed, re-balance by restoring prev and deducting next.
    const prevSig = `${prev?.subHubId ?? ""}::${itemsSignature((prev as any)?.items)}`;
    const nextSig = `${next?.subHubId ?? ""}::${itemsSignature((next as any)?.items)}`;
    if (prevSig !== nextSig) {
      await applyDelta({ ...prev, _id: next._id }, "restore");
      await applyDelta(next, "deduct");
    }
    return true;
  }
  return wasDeducted;
}

export default router;
