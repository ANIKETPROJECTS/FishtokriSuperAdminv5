import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { SubHub } from "../db/models/sub-hub.js";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";

const router: IRouter = Router({ mergeParams: true });
router.use(requireAuth as any);
router.use(loadScope as any);

async function getSubHubDb(subHubId: string, res: any, req?: ScopedRequest) {
  const sub = await SubHub.findById(subHubId);
  if (!sub) {
    res.status(404).json({ error: "NotFound", message: "Sub hub not found" });
    return null;
  }
  // Enforce hub scope: non-master users may only access sub hubs in their scope
  // (either directly assigned or under one of their assigned super hubs).
  if (req && req.scope && !req.scope.isMaster) {
    const subId = String(sub._id);
    const subSuperId = sub.superHubId ? String(sub.superHubId) : "";
    const inSubScope = req.scope.subHubIds.includes(subId);
    const inSuperScope = subSuperId && req.scope.superHubIds.includes(subSuperId);
    if (!inSubScope && !inSuperScope) {
      res.status(404).json({ error: "NotFound", message: "Sub hub not found" });
      return null;
    }
  }
  if (!sub.dbName) {
    res.status(400).json({ error: "NoDB", message: "This sub hub has no database linked. Edit the sub hub and set a database name." });
    return null;
  }
  const conn = await getSubHubDbConnection(sub.dbName);
  return { sub, conn };
}

function toId(id: string) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

function normalizeIdList(values: any) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      const raw = typeof value === "string" ? value : value?.$oid ? value.$oid : value?._id ? String(value._id) : "";
      return toId(raw);
    })
    .filter(Boolean);
}

// ─── STATS ────────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const db = ctx.conn.db;
    const [products, categories, coupons, combos, carousels, pincodes, sections, timeslots] = await Promise.all([
      db.collection("products").countDocuments(),
      db.collection("categories").countDocuments(),
      db.collection("coupons").countDocuments(),
      db.collection("combos").countDocuments(),
      db.collection("carousels").countDocuments(),
      db.collection("pincodes").countDocuments(),
      db.collection("sections").countDocuments(),
      db.collection("timeslots").countDocuments(),
    ]);
    res.json({ stats: { products, categories, coupons, combos, carousels, pincodes, sections, timeslots, dbName: ctx.sub.dbName } });
  } catch (err) {
    req.log.error({ err }, "Failed to get sub hub menu stats");
    res.status(500).json({ error: "InternalError", message: "Failed to get stats" });
  }
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const search = String(req.query.search || "");
    const query: any = search ? { name: { $regex: search, $options: "i" } } : {};
    const products = await ctx.conn.db.collection("products").find(query).sort({ sortOrder: 1, name: 1 }).toArray();
    // Derive quantity from non-expired batches only — expired stock is not available for sale.
    const nowMs = Date.now();
    const productsWithQty = products.map((p: any) => {
      const batches: any[] = Array.isArray(p.batches) ? p.batches : [];
      const total = batches
        .filter((b: any) => !b?.expiryDate || new Date(b.expiryDate).getTime() >= nowMs)
        .reduce((s: number, b: any) => s + (Math.max(0, Number(b?.quantity) || 0)), 0);
      return { ...p, quantity: total };
    });
    res.json({ products: productsWithQty, total: productsWithQty.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get products");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch products" });
  }
});

router.post("/products", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const {
      name, description, category, subCategory, shortCode,
      price, originalPrice, discountPct, unit, weight, grossWeight, netWeight, pieces, serves, quantity,
      status, isArchived, imageUrl, limitedStockNote, lowStockThreshold,
      recipes, sectionId, couponIds,
    } = req.body;
    if (!name) { res.status(400).json({ error: "ValidationError", message: "Name is required" }); return; }
    const p = Number(price) || 0;
    const op = Number(originalPrice) || p;
    const doc = {
      name,
      description: description ?? "",
      category: category ?? "",
      subCategory: subCategory ?? "",
      shortCode: shortCode ?? "",
      price: p,
      originalPrice: op,
      discountPct: Number(discountPct) || (op > p ? Math.round(((op - p) / op) * 100) : 0),
      unit: unit ?? "per pack",
      weight: weight ?? "",
      grossWeight: grossWeight ?? "",
      netWeight: netWeight ?? "",
      pieces: pieces ?? "",
      serves: serves ?? "",
      quantity: Number(quantity) || 0,
      status: status ?? "available",
      isArchived: isArchived === true,
      imageUrl: imageUrl ?? "",
      limitedStockNote: limitedStockNote ?? "",
      lowStockThreshold: lowStockThreshold != null ? Number(lowStockThreshold) : 0,
      recipes: Array.isArray(recipes) ? recipes : [],
      sectionId: normalizeIdList(sectionId),
      couponIds: normalizeIdList(couponIds),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await ctx.conn.db.collection("products").insertOne(doc);
    res.status(201).json({ product: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(500).json({ error: "InternalError", message: "Failed to create product" });
  }
});

router.put("/products/:productId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.productId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid product ID" }); return; }
    const {
      name, description, category, subCategory, shortCode,
      price, originalPrice, discountPct, unit, weight, grossWeight, netWeight, pieces, serves, quantity,
      status, isArchived, imageUrl, limitedStockNote, lowStockThreshold,
      recipes, sectionId, couponIds,
    } = req.body;
    const update: any = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (category !== undefined) update.category = category;
    if (subCategory !== undefined) update.subCategory = subCategory;
    if (shortCode !== undefined) update.shortCode = shortCode;
    if (price !== undefined) update.price = Number(price) || 0;
    if (originalPrice !== undefined) update.originalPrice = Number(originalPrice) || 0;
    if (discountPct !== undefined) update.discountPct = Number(discountPct) || 0;
    if (unit !== undefined) update.unit = unit;
    if (weight !== undefined) update.weight = weight;
    if (grossWeight !== undefined) update.grossWeight = grossWeight;
    if (netWeight !== undefined) update.netWeight = netWeight;
    if (pieces !== undefined) update.pieces = pieces;
    if (serves !== undefined) update.serves = serves;
    if (quantity !== undefined) update.quantity = Number(quantity) || 0;
    if (status !== undefined) update.status = status;
    if (isArchived !== undefined) update.isArchived = isArchived === true;
    if (imageUrl !== undefined) update.imageUrl = imageUrl;
    if (limitedStockNote !== undefined) update.limitedStockNote = limitedStockNote;
    if (lowStockThreshold !== undefined) update.lowStockThreshold = Number(lowStockThreshold) || 0;
    if (recipes !== undefined) update.recipes = Array.isArray(recipes) ? recipes : [];
    if (sectionId !== undefined) update.sectionId = normalizeIdList(sectionId);
    if (couponIds !== undefined) update.couponIds = normalizeIdList(couponIds);
    const existing = await ctx.conn.db.collection("products").findOne({ _id: oid });
    if (!existing) { res.status(404).json({ error: "NotFound", message: "Product not found" }); return; }
    const result = await ctx.conn.db.collection("products").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Product not found" }); return; }
    if (couponIds !== undefined) {
      const oldCouponIds: string[] = (existing.couponIds ?? []).map((c: any) => String(c));
      const newCouponIds: string[] = (Array.isArray(couponIds) ? couponIds : []).map((c: any) => String(c));
      const removedCouponIds = oldCouponIds.filter((id) => !newCouponIds.includes(id)).map((id) => toId(id)).filter(Boolean);
      const addedCouponIds = newCouponIds.filter((id) => !oldCouponIds.includes(id)).map((id) => toId(id)).filter(Boolean);
      const productIdStr = String(oid);
      if (removedCouponIds.length > 0) {
        await ctx.conn.db.collection("coupons").updateMany(
          { _id: { $in: removedCouponIds } },
          { $pull: { applicableProducts: productIdStr } }
        );
      }
      if (addedCouponIds.length > 0) {
        await ctx.conn.db.collection("coupons").updateMany(
          { _id: { $in: addedCouponIds } },
          { $addToSet: { applicableProducts: productIdStr } }
        );
      }
    }
    res.json({ product: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(500).json({ error: "InternalError", message: "Failed to update product" });
  }
});

router.delete("/products/:productId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.productId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid product ID" }); return; }
    await ctx.conn.db.collection("products").deleteOne({ _id: oid });
    res.json({ message: "Product deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "InternalError", message: "Failed to delete product" });
  }
});

// ─── PRODUCTS BULK UPSERT ─────────────────────────────────────────────────────
router.post("/products/bulk-upsert", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const rows: any[] = Array.isArray(req.body.products) ? req.body.products : [];
    if (rows.length === 0) { res.status(400).json({ error: "ValidationError", message: "No products provided" }); return; }

    const created: number[] = [];
    const updated: number[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const p = Number(row.price) || 0;
        const op = Number(row.originalPrice ?? row.mrp) || p;
        const fields = {
          name: row.name ?? "",
          description: row.description ?? "",
          category: row.category ?? "",
          subCategory: row.subCategory ?? "",
          price: p,
          originalPrice: op,
          discountPct: Number(row.discountPct ?? row.discount_pct) || (op > p ? Math.round(((op - p) / op) * 100) : 0),
          unit: row.unit ?? "per pack",
          weight: row.weight ?? "",
          grossWeight: row.grossWeight ?? "",
          netWeight: row.netWeight ?? "",
          pieces: row.pieces ?? "",
          serves: row.serves ?? "",
          quantity: Number(row.quantity ?? row.stock) || 0,
          status: row.status ?? "available",
          isArchived: String(row.isArchived ?? row.archived ?? "").toLowerCase() === "yes" || row.isArchived === true,
          imageUrl: row.imageUrl ?? "",
          limitedStockNote: row.limitedStockNote ?? "",
          updatedAt: new Date(),
        };
        if (!fields.name) { errors.push(`Row skipped: missing name`); continue; }

        const oid = row._id ? toId(String(row._id)) : null;
        if (oid) {
          await ctx.conn.db.collection("products").updateOne({ _id: oid }, { $set: fields });
          updated.push(1);
        } else {
          await ctx.conn.db.collection("products").insertOne({ ...fields, createdAt: new Date() });
          created.push(1);
        }
      } catch (rowErr: any) {
        errors.push(rowErr.message);
      }
    }

    res.json({ created: created.length, updated: updated.length, errors });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk upsert products");
    res.status(500).json({ error: "InternalError", message: "Failed to process bulk upsert" });
  }
});

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
router.get("/categories", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const categories = await ctx.conn.db.collection("categories").find({}).sort({ sortOrder: 1, name: 1 }).toArray();
    res.json({ categories, total: categories.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get categories");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch categories" });
  }
});

router.post("/categories", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { name, imageUrl, isActive, sortOrder, subCategories } = req.body;
    if (!name) { res.status(400).json({ error: "ValidationError", message: "Name is required" }); return; }
    const doc = {
      name,
      imageUrl: imageUrl ?? "",
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
      subCategories: Array.isArray(subCategories) ? subCategories : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await ctx.conn.db.collection("categories").insertOne(doc);
    res.status(201).json({ category: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ error: "InternalError", message: "Failed to create category" });
  }
});

router.put("/categories/reorder", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "ValidationError", message: "items array required" }); return; }
    const ops = items.map(({ id, sortOrder }: { id: string; sortOrder: number }) => {
      const oid = toId(id);
      if (!oid) return null;
      return { updateOne: { filter: { _id: oid }, update: { $set: { sortOrder: Number(sortOrder), updatedAt: new Date() } } } };
    }).filter(Boolean);
    if (ops.length > 0) await ctx.conn.db.collection("categories").bulkWrite(ops as any);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder categories");
    res.status(500).json({ error: "InternalError", message: "Failed to reorder categories" });
  }
});

router.put("/categories/:catId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.catId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid category ID" }); return; }
    const { name, imageUrl, isActive, sortOrder, subCategories } = req.body;
    const update: any = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (imageUrl !== undefined) update.imageUrl = imageUrl;
    if (isActive !== undefined) update.isActive = isActive;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (subCategories !== undefined) update.subCategories = subCategories;
    const result = await ctx.conn.db.collection("categories").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Category not found" }); return; }
    res.json({ category: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update category");
    res.status(500).json({ error: "InternalError", message: "Failed to update category" });
  }
});

router.delete("/categories/:catId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.catId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid category ID" }); return; }
    await ctx.conn.db.collection("categories").deleteOne({ _id: oid });
    res.json({ message: "Category deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "InternalError", message: "Failed to delete category" });
  }
});

// ─── COUPONS ──────────────────────────────────────────────────────────────────
router.get("/coupons", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const coupons = await ctx.conn.db.collection("coupons").find({}).sort({ createdAt: -1 }).toArray();
    res.json({ coupons, total: coupons.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get coupons");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch coupons" });
  }
});

router.post("/coupons", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { code, title, description, type, discountValue, minOrderAmount, maxUsage, isFirstTimeOnly, applicableCategories, applicableProducts, isActive, expiresAt } = req.body;
    if (!code) { res.status(400).json({ error: "ValidationError", message: "Code is required" }); return; }
    const existing = await ctx.conn.db.collection("coupons").findOne({ code: { $regex: `^${code}$`, $options: "i" } });
    if (existing) { res.status(400).json({ error: "DuplicateCoupon", message: "Coupon code already exists" }); return; }
    const doc: any = {
      code: code.toUpperCase(),
      title: title ?? "",
      description: description ?? "",
      type: type ?? "percentage",
      discountValue: Number(discountValue) || 0,
      minOrderAmount: Number(minOrderAmount) || 0,
      isFirstTimeOnly: isFirstTimeOnly === true,
      applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
      applicableProducts: Array.isArray(applicableProducts) ? applicableProducts : [],
      isActive: isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (maxUsage) doc.maxUsage = Number(maxUsage);
    if (expiresAt) doc.expiresAt = new Date(expiresAt);
    const result = await ctx.conn.db.collection("coupons").insertOne(doc);
    const couponOid = result.insertedId;
    if (doc.applicableProducts.length > 0) {
      const productOids = doc.applicableProducts.map((p: any) => toId(typeof p === "string" ? p : String(p))).filter(Boolean);
      await ctx.conn.db.collection("products").updateMany(
        { _id: { $in: productOids } },
        { $addToSet: { couponIds: couponOid } }
      );
    }
    res.status(201).json({ coupon: { ...doc, _id: couponOid } });
  } catch (err) {
    req.log.error({ err }, "Failed to create coupon");
    res.status(500).json({ error: "InternalError", message: "Failed to create coupon" });
  }
});

router.put("/coupons/:couponId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.couponId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid coupon ID" }); return; }
    const { code, title, description, type, discountValue, minOrderAmount, maxUsage, isFirstTimeOnly, applicableCategories, applicableProducts, isActive, expiresAt } = req.body;
    const update: any = { updatedAt: new Date() };
    if (code !== undefined) update.code = code.toUpperCase();
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (type !== undefined) update.type = type;
    if (discountValue !== undefined) update.discountValue = Number(discountValue) || 0;
    if (minOrderAmount !== undefined) update.minOrderAmount = Number(minOrderAmount) || 0;
    if (maxUsage !== undefined) update.maxUsage = maxUsage ? Number(maxUsage) : null;
    if (isFirstTimeOnly !== undefined) update.isFirstTimeOnly = isFirstTimeOnly;
    if (applicableCategories !== undefined) update.applicableCategories = Array.isArray(applicableCategories) ? applicableCategories : [];
    if (applicableProducts !== undefined) update.applicableProducts = Array.isArray(applicableProducts) ? applicableProducts : [];
    if (isActive !== undefined) update.isActive = isActive;
    if (expiresAt !== undefined) update.expiresAt = expiresAt ? new Date(expiresAt) : null;
    const existing = await ctx.conn.db.collection("coupons").findOne({ _id: oid });
    if (!existing) { res.status(404).json({ error: "NotFound", message: "Coupon not found" }); return; }
    const result = await ctx.conn.db.collection("coupons").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Coupon not found" }); return; }
    if (applicableProducts !== undefined) {
      const oldIds: string[] = (existing.applicableProducts ?? []).map((p: any) => String(p));
      const newIds: string[] = (Array.isArray(applicableProducts) ? applicableProducts : []).map((p: any) => String(p));
      const removedIds = oldIds.filter((id) => !newIds.includes(id)).map((id) => toId(id)).filter(Boolean);
      const addedIds = newIds.filter((id) => !oldIds.includes(id)).map((id) => toId(id)).filter(Boolean);
      if (removedIds.length > 0) {
        await ctx.conn.db.collection("products").updateMany(
          { _id: { $in: removedIds } },
          { $pull: { couponIds: oid } }
        );
      }
      if (addedIds.length > 0) {
        await ctx.conn.db.collection("products").updateMany(
          { _id: { $in: addedIds } },
          { $addToSet: { couponIds: oid } }
        );
      }
    }
    res.json({ coupon: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update coupon");
    res.status(500).json({ error: "InternalError", message: "Failed to update coupon" });
  }
});

router.delete("/coupons/:couponId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.couponId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid coupon ID" }); return; }
    const existing = await ctx.conn.db.collection("coupons").findOne({ _id: oid });
    if (existing) {
      const productOids = (existing.applicableProducts ?? []).map((p: any) => toId(String(p))).filter(Boolean);
      if (productOids.length > 0) {
        await ctx.conn.db.collection("products").updateMany(
          { _id: { $in: productOids } },
          { $pull: { couponIds: oid } }
        );
      }
    }
    await ctx.conn.db.collection("coupons").deleteOne({ _id: oid });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete coupon");
    res.status(500).json({ error: "InternalError", message: "Failed to delete coupon" });
  }
});

// ─── COMBOS ───────────────────────────────────────────────────────────────────
router.get("/combos", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const combosCol = ctx.conn.db.collection("combos");
    const productsCol = ctx.conn.db.collection("products");
    const combos = await combosCol.find({}).sort({ sortOrder: 1, name: 1 }).toArray();

    // Sync each combo's isActive against current product stock.
    // A combo must be inactive if ANY of its constituent products has quantity <= 0.
    const toDeactivate: any[] = [];
    const toActivate: any[] = [];

    for (const combo of combos) {
      const includes: any[] = Array.isArray(combo.includes) ? combo.includes : [];
      if (includes.length === 0) continue;

      // Collect all productIds (support both string and ObjectId storage)
      const productIds = includes.map((inc: any) => {
        const id = inc.productId;
        const oid = toId(String(id));
        return oid;
      }).filter(Boolean);

      if (productIds.length === 0) continue;

      const products = await productsCol
        .find({ _id: { $in: productIds } }, { projection: { quantity: 1 } })
        .toArray();

      const anyOutOfStock = products.some((p: any) => (Number(p.quantity) || 0) <= 0)
        || products.length < productIds.length; // some products missing entirely

      if (anyOutOfStock && combo.isActive) {
        toDeactivate.push(combo._id);
        combo.isActive = false;
      } else if (!anyOutOfStock && !combo.isActive) {
        toActivate.push(combo._id);
        combo.isActive = true;
      }
    }

    // Persist the synced statuses in bulk
    const now = new Date();
    if (toDeactivate.length > 0) {
      await combosCol.updateMany(
        { _id: { $in: toDeactivate } },
        { $set: { isActive: false, updatedAt: now } },
      );
    }
    if (toActivate.length > 0) {
      await combosCol.updateMany(
        { _id: { $in: toActivate } },
        { $set: { isActive: true, updatedAt: now } },
      );
    }

    res.json({ combos, total: combos.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get combos");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch combos" });
  }
});

router.post("/combos", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { name, description, fullDescription, serves, weight, discountedPrice, originalPrice, discount, includes, tags, nutrition, isActive, sortOrder, sectionId } = req.body;
    if (!name) { res.status(400).json({ error: "ValidationError", message: "Name is required" }); return; }
    const dp = Number(discountedPrice) || 0;
    const op = Number(originalPrice) || 0;
    const doc = {
      name,
      description: description ?? "",
      fullDescription: fullDescription ?? "",
      serves: serves ?? "",
      weight: weight ?? "",
      discountedPrice: dp,
      originalPrice: op,
      discount: Number(discount) || (op > dp && dp > 0 ? Math.round(((op - dp) / op) * 100) : 0),
      includes: Array.isArray(includes) ? includes : [],
      tags: Array.isArray(tags) ? tags : [],
      nutrition: Array.isArray(nutrition) ? nutrition : [],
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
      sectionId: normalizeIdList(sectionId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await ctx.conn.db.collection("combos").insertOne(doc);
    res.status(201).json({ combo: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create combo");
    res.status(500).json({ error: "InternalError", message: "Failed to create combo" });
  }
});

router.put("/combos/reorder", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "ValidationError", message: "items array required" }); return; }
    const ops = items.map(({ id, sortOrder }: { id: string; sortOrder: number }) => {
      const oid = toId(id);
      if (!oid) return null;
      return { updateOne: { filter: { _id: oid }, update: { $set: { sortOrder: Number(sortOrder), updatedAt: new Date() } } } };
    }).filter(Boolean);
    if (ops.length > 0) await ctx.conn.db.collection("combos").bulkWrite(ops as any);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder combos");
    res.status(500).json({ error: "InternalError", message: "Failed to reorder combos" });
  }
});

router.put("/combos/:comboId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.comboId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid combo ID" }); return; }
    const { name, description, fullDescription, serves, weight, discountedPrice, originalPrice, discount, includes, tags, nutrition, isActive, sortOrder, sectionId } = req.body;
    const update: any = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (fullDescription !== undefined) update.fullDescription = fullDescription;
    if (serves !== undefined) update.serves = serves;
    if (weight !== undefined) update.weight = weight;
    if (discountedPrice !== undefined) update.discountedPrice = Number(discountedPrice) || 0;
    if (originalPrice !== undefined) update.originalPrice = Number(originalPrice) || 0;
    if (discount !== undefined) update.discount = Number(discount) || 0;
    if (includes !== undefined) update.includes = Array.isArray(includes) ? includes : [];
    if (tags !== undefined) update.tags = tags;
    if (nutrition !== undefined) update.nutrition = nutrition;
    if (isActive !== undefined) update.isActive = isActive;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (sectionId !== undefined) update.sectionId = normalizeIdList(sectionId);
    const result = await ctx.conn.db.collection("combos").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Combo not found" }); return; }
    res.json({ combo: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update combo");
    res.status(500).json({ error: "InternalError", message: "Failed to update combo" });
  }
});

router.delete("/combos/:comboId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.comboId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid combo ID" }); return; }
    await ctx.conn.db.collection("combos").deleteOne({ _id: oid });
    res.json({ message: "Combo deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete combo");
    res.status(500).json({ error: "InternalError", message: "Failed to delete combo" });
  }
});

// ─── CAROUSELS ────────────────────────────────────────────────────────────────
router.get("/carousels", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const carousels = await ctx.conn.db.collection("carousels").find({}).sort({ order: 1 }).toArray();
    res.json({ carousels, total: carousels.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get carousels");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch carousels" });
  }
});

router.post("/carousels", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { imageUrl, title, linkUrl, order, isActive } = req.body;
    if (!imageUrl) { res.status(400).json({ error: "ValidationError", message: "Image URL is required" }); return; }
    const doc = {
      imageUrl,
      title: title ?? null,
      linkUrl: linkUrl ?? null,
      order: Number(order) || 0,
      isActive: isActive !== false,
    };
    const result = await ctx.conn.db.collection("carousels").insertOne(doc);
    res.status(201).json({ carousel: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create carousel");
    res.status(500).json({ error: "InternalError", message: "Failed to create carousel" });
  }
});

router.put("/carousels/reorder", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "ValidationError", message: "items array required" }); return; }
    const ops = items.map(({ id, order }: { id: string; order: number }) => {
      const oid = toId(id);
      if (!oid) return null;
      return { updateOne: { filter: { _id: oid }, update: { $set: { order: Number(order) } } } };
    }).filter(Boolean);
    if (ops.length > 0) await ctx.conn.db.collection("carousels").bulkWrite(ops as any);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder carousels");
    res.status(500).json({ error: "InternalError", message: "Failed to reorder carousels" });
  }
});

router.put("/carousels/:carouselId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.carouselId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid carousel ID" }); return; }
    const { imageUrl, title, linkUrl, order, isActive } = req.body;
    const update: any = {};
    if (imageUrl !== undefined) update.imageUrl = imageUrl;
    if (title !== undefined) update.title = title || null;
    if (linkUrl !== undefined) update.linkUrl = linkUrl || null;
    if (order !== undefined) update.order = Number(order) || 0;
    if (isActive !== undefined) update.isActive = isActive;
    const result = await ctx.conn.db.collection("carousels").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Carousel not found" }); return; }
    res.json({ carousel: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update carousel");
    res.status(500).json({ error: "InternalError", message: "Failed to update carousel" });
  }
});

router.delete("/carousels/:carouselId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.carouselId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid carousel ID" }); return; }
    await ctx.conn.db.collection("carousels").deleteOne({ _id: oid });
    res.json({ message: "Carousel deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete carousel");
    res.status(500).json({ error: "InternalError", message: "Failed to delete carousel" });
  }
});

// ─── SECTIONS ─────────────────────────────────────────────────────────────────
router.get("/sections", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const sections = await ctx.conn.db.collection("sections").find({}).sort({ sortOrder: 1 }).toArray();
    res.json({ sections, total: sections.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get sections");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch sections" });
  }
});

router.post("/sections", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { title, type, sortOrder, isActive } = req.body;
    if (!title) { res.status(400).json({ error: "ValidationError", message: "Title is required" }); return; }
    const doc = {
      title,
      type: type ?? "products",
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== false,
    };
    const result = await ctx.conn.db.collection("sections").insertOne(doc);
    res.status(201).json({ section: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create section");
    res.status(500).json({ error: "InternalError", message: "Failed to create section" });
  }
});

router.put("/sections/reorder", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "ValidationError", message: "items array required" }); return; }
    const ops = items.map(({ id, sortOrder }: { id: string; sortOrder: number }) => {
      const oid = toId(id);
      if (!oid) return null;
      return { updateOne: { filter: { _id: oid }, update: { $set: { sortOrder: Number(sortOrder) } } } };
    }).filter(Boolean);
    if (ops.length > 0) await ctx.conn.db.collection("sections").bulkWrite(ops as any);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder sections");
    res.status(500).json({ error: "InternalError", message: "Failed to reorder sections" });
  }
});

router.put("/sections/:sectionId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.sectionId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid section ID" }); return; }
    const { title, type, sortOrder, isActive } = req.body;
    const update: any = {};
    if (title !== undefined) update.title = title;
    if (type !== undefined) update.type = type;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) update.isActive = isActive;
    const result = await ctx.conn.db.collection("sections").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Section not found" }); return; }
    res.json({ section: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update section");
    res.status(500).json({ error: "InternalError", message: "Failed to update section" });
  }
});

router.put("/sections/:sectionId/items", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const sectionOid = toId(req.params.sectionId);
    if (!sectionOid) { res.status(400).json({ error: "InvalidId", message: "Invalid section ID" }); return; }
    const { type, itemIds } = req.body;
    const col = type === "combos" ? "combos" : "products";
    const newOids = Array.isArray(itemIds) ? itemIds.map((id: any) => toId(String(id))).filter(Boolean) : [];
    await ctx.conn.db.collection(col).updateMany({ sectionId: sectionOid }, { $pull: { sectionId: sectionOid } } as any);
    if (newOids.length > 0) {
      await ctx.conn.db.collection(col).updateMany({ _id: { $in: newOids } }, { $addToSet: { sectionId: sectionOid } });
    }
    res.json({ ok: true, assigned: newOids.length });
  } catch (err) {
    req.log.error({ err }, "Failed to assign section items");
    res.status(500).json({ error: "InternalError", message: "Failed to assign section items" });
  }
});

router.delete("/sections/:sectionId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.sectionId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid section ID" }); return; }
    await ctx.conn.db.collection("sections").deleteOne({ _id: oid });
    res.json({ message: "Section deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete section");
    res.status(500).json({ error: "InternalError", message: "Failed to delete section" });
  }
});

// ─── PINCODES ─────────────────────────────────────────────────────────────────
router.get("/pincodes", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const pincodes = await ctx.conn.db.collection("pincodes").find({}).sort({ pincode: 1 }).toArray();
    res.json({ pincodes, total: pincodes.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get pincodes");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch pincodes" });
  }
});

router.post("/pincodes", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { pincode, area, city, isActive } = req.body;
    if (!pincode) { res.status(400).json({ error: "ValidationError", message: "Pincode is required" }); return; }
    const existing = await ctx.conn.db.collection("pincodes").findOne({ pincode });
    if (existing) { res.status(400).json({ error: "Duplicate", message: "Pincode already exists" }); return; }
    const doc = {
      pincode: String(pincode),
      area: area ?? "",
      city: city ?? "",
      isActive: isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await ctx.conn.db.collection("pincodes").insertOne(doc);
    res.status(201).json({ pincode: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create pincode");
    res.status(500).json({ error: "InternalError", message: "Failed to create pincode" });
  }
});

router.put("/pincodes/:pincodeId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.pincodeId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid pincode ID" }); return; }
    const { pincode, area, city, isActive } = req.body;
    const update: any = { updatedAt: new Date() };
    if (pincode !== undefined) update.pincode = String(pincode);
    if (area !== undefined) update.area = area;
    if (city !== undefined) update.city = city;
    if (isActive !== undefined) update.isActive = isActive;
    const result = await ctx.conn.db.collection("pincodes").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Pincode not found" }); return; }
    res.json({ pincode: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update pincode");
    res.status(500).json({ error: "InternalError", message: "Failed to update pincode" });
  }
});

router.delete("/pincodes/:pincodeId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.pincodeId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid pincode ID" }); return; }
    await ctx.conn.db.collection("pincodes").deleteOne({ _id: oid });
    res.json({ message: "Pincode deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete pincode");
    res.status(500).json({ error: "InternalError", message: "Failed to delete pincode" });
  }
});

// ─── TIMESLOTS ─────────────────────────────────────────────────────────────────

/** Returns today's date in YYYY-MM-DD format using IST (UTC+5:30). */
function getTimeslotTodayISO(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns tomorrow's date in YYYY-MM-DD format using IST (UTC+5:30). */
function getTimeslotTomorrowISO(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + 1);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

router.get("/timeslots", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const timeslots = await ctx.conn.db.collection("timeslots").find({}).sort({ sortOrder: 1, startTime: 1 }).toArray();

    if (timeslots.length > 0) {
      const todayISO = getTimeslotTodayISO();
      const tomorrowISO = getTimeslotTomorrowISO();
      const timeslotIdStrs = timeslots.map((t: any) => String(t._id));
      try {
        const ordersConn = await getSubHubDbConnection("orders");
        const countsAgg = await ordersConn.db.collection("orders").aggregate([
          {
            $match: {
              timeslotId: { $in: timeslotIdStrs },
              scheduleType: "slot",
              deliveryDate: { $in: [todayISO, tomorrowISO] },
              status: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: { timeslotId: "$timeslotId", deliveryDate: "$deliveryDate" },
              count: { $sum: 1 },
            },
          },
        ]).toArray();

        const countMap = new Map<string, { today: number; tomorrow: number }>();
        for (const row of countsAgg as any[]) {
          const tid = String(row._id.timeslotId);
          const date = String(row._id.deliveryDate);
          if (!countMap.has(tid)) countMap.set(tid, { today: 0, tomorrow: 0 });
          const entry = countMap.get(tid)!;
          if (date === todayISO) entry.today = row.count;
          else if (date === tomorrowISO) entry.tomorrow = row.count;
        }

        for (const slot of timeslots as any[]) {
          const counts = countMap.get(String(slot._id)) ?? { today: 0, tomorrow: 0 };
          slot.todaysOrderCount = counts.today;
          slot.nextDayOrderCount = counts.tomorrow;
          delete slot.todaysOrderDate;
          delete slot.nextDayOrderDate;
        }

        // Persist computed counts back to MongoDB so the DB reflects reality.
        const bulkOps = (timeslots as any[]).map((slot) => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(slot._id) },
            update: {
              $set: {
                todaysOrderCount: slot.todaysOrderCount,
                nextDayOrderCount: slot.nextDayOrderCount,
              },
              $unset: { todaysOrderDate: "", nextDayOrderDate: "" },
            },
          },
        }));
        await ctx.conn.db.collection("timeslots").bulkWrite(bulkOps, { ordered: false });
      } catch (e) {
        req.log.warn({ err: e }, "Failed to compute timeslot order counts (non-fatal)");
        for (const slot of timeslots as any[]) {
          slot.todaysOrderCount = slot.todaysOrderCount ?? 0;
          slot.nextDayOrderCount = slot.nextDayOrderCount ?? 0;
          delete slot.todaysOrderDate;
          delete slot.nextDayOrderDate;
        }
      }
    }

    res.json({ timeslots, total: timeslots.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get timeslots");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch timeslots" });
  }
});

router.post("/timeslots", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { label, startTime, endTime, isInstant, extraCharge, isActive, sortOrder, orderLimit } = req.body;
    if (!startTime || !endTime) { res.status(400).json({ error: "ValidationError", message: "Start time and end time are required" }); return; }
    const resolvedLabel = label && String(label).trim() ? String(label).trim() : `${startTime} - ${endTime}`;
    const doc = {
      label: resolvedLabel,
      startTime,
      endTime,
      isInstant: isInstant === true,
      extraCharge: Number(extraCharge) || 0,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
      orderLimit: Number(orderLimit) || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await ctx.conn.db.collection("timeslots").insertOne(doc);
    res.status(201).json({ timeslot: { ...doc, _id: result.insertedId } });
  } catch (err) {
    req.log.error({ err }, "Failed to create timeslot");
    res.status(500).json({ error: "InternalError", message: "Failed to create timeslot" });
  }
});

router.put("/timeslots/reorder", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "ValidationError", message: "items array required" }); return; }
    const ops = items.map(({ id, sortOrder }: { id: string; sortOrder: number }) => {
      const oid = toId(id);
      if (!oid) return null;
      return { updateOne: { filter: { _id: oid }, update: { $set: { sortOrder: Number(sortOrder), updatedAt: new Date() } } } };
    }).filter(Boolean);
    if (ops.length > 0) await ctx.conn.db.collection("timeslots").bulkWrite(ops as any);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder timeslots");
    res.status(500).json({ error: "InternalError", message: "Failed to reorder timeslots" });
  }
});

router.put("/timeslots/:timeslotId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.timeslotId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid timeslot ID" }); return; }
    const { label, startTime, endTime, isInstant, extraCharge, isActive, sortOrder, orderLimit } = req.body;
    const update: any = { updatedAt: new Date() };
    if (label !== undefined) update.label = label;
    if (startTime !== undefined) update.startTime = startTime;
    if (endTime !== undefined) update.endTime = endTime;
    if (isInstant !== undefined) update.isInstant = isInstant === true;
    if (extraCharge !== undefined) update.extraCharge = Number(extraCharge) || 0;
    if (isActive !== undefined) {
      update.isActive = isActive;
      // If admin manually changes isActive, clear the auto-limit flag
      update.limitedByOrders = false;
    }
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (orderLimit !== undefined) update.orderLimit = Number(orderLimit) || 0;
    const result = await ctx.conn.db.collection("timeslots").findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
    if (!result) { res.status(404).json({ error: "NotFound", message: "Timeslot not found" }); return; }
    res.json({ timeslot: result });
  } catch (err) {
    req.log.error({ err }, "Failed to update timeslot");
    res.status(500).json({ error: "InternalError", message: "Failed to update timeslot" });
  }
});

router.delete("/timeslots/:timeslotId", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const oid = toId(req.params.timeslotId);
    if (!oid) { res.status(400).json({ error: "InvalidId", message: "Invalid timeslot ID" }); return; }
    await ctx.conn.db.collection("timeslots").deleteOne({ _id: oid });
    res.json({ message: "Timeslot deleted" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete timeslot");
    res.status(500).json({ error: "InternalError", message: "Failed to delete timeslot" });
  }
});

// ─── BULK UPSERTS ─────────────────────────────────────────────────────────────

router.post("/categories/bulk-upsert", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const rows: any[] = Array.isArray(req.body.items) ? req.body.items : [];
    if (rows.length === 0) { res.status(400).json({ error: "ValidationError", message: "No items provided" }); return; }
    let created = 0, updated = 0; const errors: string[] = [];
    for (const row of rows) {
      try {
        const subCats = row.subCategories ? String(row.subCategories).split("|").map((s: string) => ({ name: s.trim() })).filter((s: any) => s.name) : undefined;
        const fields: any = { name: row.name ?? "", imageUrl: row.imageUrl ?? "", isActive: String(row.isActive ?? "yes").toLowerCase() !== "no", sortOrder: Number(row.sortOrder) || 0, updatedAt: new Date() };
        if (subCats !== undefined) fields.subCategories = subCats;
        if (!fields.name) { errors.push("Skipped: missing name"); continue; }
        const oid = row._id ? toId(String(row._id)) : null;
        if (oid) { await ctx.conn.db.collection("categories").updateOne({ _id: oid }, { $set: fields }); updated++; }
        else { await ctx.conn.db.collection("categories").insertOne({ ...fields, createdAt: new Date() }); created++; }
      } catch (e: any) { errors.push(e.message); }
    }
    res.json({ created, updated, errors });
  } catch (err) { req.log.error({ err }, "categories bulk-upsert failed"); res.status(500).json({ error: "InternalError", message: "Failed" }); }
});

router.post("/combos/bulk-upsert", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const rows: any[] = Array.isArray(req.body.items) ? req.body.items : [];
    if (rows.length === 0) { res.status(400).json({ error: "ValidationError", message: "No items provided" }); return; }
    let created = 0, updated = 0; const errors: string[] = [];
    for (const row of rows) {
      try {
        const dp = Number(row.discountedPrice ?? row.salePrice) || 0;
        const op = Number(row.originalPrice ?? row.mrp) || dp;
        const fields: any = {
          name: row.name ?? "", description: row.description ?? "", fullDescription: row.fullDescription ?? "",
          serves: row.serves ?? "", weight: row.weight ?? "",
          discountedPrice: dp, originalPrice: op,
          discount: Number(row.discount) || (op > dp && dp > 0 ? Math.round(((op - dp) / op) * 100) : 0),
          includes: row.includes ? String(row.includes).split("|").map((s: string) => s.trim()).filter(Boolean) : [],
          tags: row.tags ? String(row.tags).split("|").map((s: string) => s.trim()).filter(Boolean) : [],
          isActive: String(row.isActive ?? "yes").toLowerCase() !== "no",
          sortOrder: Number(row.sortOrder) || 0, updatedAt: new Date(),
        };
        if (!fields.name) { errors.push("Skipped: missing name"); continue; }
        const oid = row._id ? toId(String(row._id)) : null;
        if (oid) { await ctx.conn.db.collection("combos").updateOne({ _id: oid }, { $set: fields }); updated++; }
        else { await ctx.conn.db.collection("combos").insertOne({ ...fields, createdAt: new Date() }); created++; }
      } catch (e: any) { errors.push(e.message); }
    }
    res.json({ created, updated, errors });
  } catch (err) { req.log.error({ err }, "combos bulk-upsert failed"); res.status(500).json({ error: "InternalError", message: "Failed" }); }
});

router.post("/coupons/bulk-upsert", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const rows: any[] = Array.isArray(req.body.items) ? req.body.items : [];
    if (rows.length === 0) { res.status(400).json({ error: "ValidationError", message: "No items provided" }); return; }
    let created = 0, updated = 0; const errors: string[] = [];
    for (const row of rows) {
      try {
        const code = String(row.code ?? "").toUpperCase().trim();
        if (!code) { errors.push("Skipped: missing code"); continue; }
        const fields: any = {
          code, title: row.title ?? "", description: row.description ?? "",
          type: row.type === "flat" ? "flat" : "percentage",
          discountValue: Number(row.discountValue) || 0,
          minOrderAmount: Number(row.minOrderAmount) || 0,
          maxUsage: row.maxUsage ? Number(row.maxUsage) : null,
          isFirstTimeOnly: String(row.isFirstTimeOnly ?? "no").toLowerCase() === "yes",
          isActive: String(row.isActive ?? "yes").toLowerCase() !== "no",
          expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
          updatedAt: new Date(),
        };
        const oid = row._id ? toId(String(row._id)) : null;
        if (oid) { await ctx.conn.db.collection("coupons").updateOne({ _id: oid }, { $set: fields }); updated++; }
        else {
          const existing = await ctx.conn.db.collection("coupons").findOne({ code: { $regex: `^${code}$`, $options: "i" } });
          if (existing) { await ctx.conn.db.collection("coupons").updateOne({ _id: existing._id }, { $set: fields }); updated++; }
          else { await ctx.conn.db.collection("coupons").insertOne({ ...fields, applicableCategories: [], applicableProducts: [], createdAt: new Date() }); created++; }
        }
      } catch (e: any) { errors.push(e.message); }
    }
    res.json({ created, updated, errors });
  } catch (err) { req.log.error({ err }, "coupons bulk-upsert failed"); res.status(500).json({ error: "InternalError", message: "Failed" }); }
});

router.post("/sections/bulk-upsert", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const rows: any[] = Array.isArray(req.body.items) ? req.body.items : [];
    if (rows.length === 0) { res.status(400).json({ error: "ValidationError", message: "No items provided" }); return; }
    let created = 0, updated = 0; const errors: string[] = [];
    for (const row of rows) {
      try {
        const fields: any = { title: row.title ?? "", type: row.type ?? "products", sortOrder: Number(row.sortOrder) || 0, isActive: String(row.isActive ?? "yes").toLowerCase() !== "no", updatedAt: new Date() };
        if (!fields.title) { errors.push("Skipped: missing title"); continue; }
        const oid = row._id ? toId(String(row._id)) : null;
        if (oid) { await ctx.conn.db.collection("sections").updateOne({ _id: oid }, { $set: fields }); updated++; }
        else { await ctx.conn.db.collection("sections").insertOne({ ...fields, createdAt: new Date() }); created++; }
      } catch (e: any) { errors.push(e.message); }
    }
    res.json({ created, updated, errors });
  } catch (err) { req.log.error({ err }, "sections bulk-upsert failed"); res.status(500).json({ error: "InternalError", message: "Failed" }); }
});

router.post("/timeslots/bulk-upsert", async (req, res) => {
  try {
    const ctx = await getSubHubDb(req.params.id, res, req as ScopedRequest);
    if (!ctx) return;
    const rows: any[] = Array.isArray(req.body.items) ? req.body.items : [];
    if (rows.length === 0) { res.status(400).json({ error: "ValidationError", message: "No items provided" }); return; }
    let created = 0, updated = 0; const errors: string[] = [];
    for (const row of rows) {
      try {
        const fields: any = {
          label: row.label ?? "", startTime: row.startTime ?? "", endTime: row.endTime ?? "",
          isInstant: String(row.isInstant ?? "no").toLowerCase() === "yes",
          extraCharge: Number(row.extraCharge) || 0,
          isActive: String(row.isActive ?? "yes").toLowerCase() !== "no",
          sortOrder: Number(row.sortOrder) || 0,
          orderLimit: Number(row.orderLimit) || 0,
          updatedAt: new Date(),
        };
        if (!fields.label || !fields.startTime || !fields.endTime) { errors.push("Skipped: missing label/startTime/endTime"); continue; }
        const oid = row._id ? toId(String(row._id)) : null;
        if (oid) { await ctx.conn.db.collection("timeslots").updateOne({ _id: oid }, { $set: fields }); updated++; }
        else { await ctx.conn.db.collection("timeslots").insertOne({ ...fields, createdAt: new Date() }); created++; }
      } catch (e: any) { errors.push(e.message); }
    }
    res.json({ created, updated, errors });
  } catch (err) { req.log.error({ err }, "timeslots bulk-upsert failed"); res.status(500).json({ error: "InternalError", message: "Failed" }); }
});

export default router;
