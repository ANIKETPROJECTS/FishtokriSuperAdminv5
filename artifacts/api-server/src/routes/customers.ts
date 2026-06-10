import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { getCustomersConnection } from "../db/customers-connection.js";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";

const router: IRouter = Router();
router.use(requireAuth as any);
router.use(loadScope as any);

/**
 * For a non-master user, returns the set of customer identifiers (phones,
 * emails, customerIds, and customer ObjectIds) that appear on at least one
 * order in their hub scope. Returns null when no scoping is needed (master).
 * Returns an empty bundle (all empty arrays) when the user has no hubs.
 */
async function loadCustomerScopeKeys(
  scope: ScopedRequest["scope"],
): Promise<null | { phones: string[]; emails: string[]; customerIds: string[]; objectIds: mongoose.Types.ObjectId[] }> {
  if (!scope || scope.isMaster) return null;
  if (scope.subHubIds.length === 0) {
    return { phones: [], emails: [], customerIds: [], objectIds: [] };
  }
  const ordersConn = await getSubHubDbConnection("orders");
  const projection = {
    phone: 1, email: 1, customerName: 1, customerId: 1,
    customerPhone: 1, customerEmail: 1, userId: 1,
    "customer.phone": 1, "customer.email": 1, "customer.id": 1, "customer._id": 1,
  };
  const orders = await ordersConn.db
    .collection("orders")
    .find({ subHubId: { $in: scope.subHubIds } })
    .project(projection)
    .toArray();

  const phoneSet = new Set<string>();
  const emailSet = new Set<string>();
  const customerIdSet = new Set<string>();

  for (const o of orders) {
    const phones = [o.phone, o.customerPhone, (o as any).customer?.phone];
    const emails = [o.email, o.customerEmail, (o as any).customer?.email];
    const ids = [o.customerId, o.userId, (o as any).customer?.id, (o as any).customer?._id];
    for (const p of phones) if (p) phoneSet.add(String(p).trim().toLowerCase());
    for (const e of emails) if (e) emailSet.add(String(e).trim().toLowerCase());
    for (const id of ids) if (id) customerIdSet.add(String(id).trim());
  }

  const objectIds: mongoose.Types.ObjectId[] = [];
  for (const id of customerIdSet) {
    if (mongoose.isValidObjectId(id)) objectIds.push(new mongoose.Types.ObjectId(id));
  }

  return {
    phones: [...phoneSet],
    emails: [...emailSet],
    customerIds: [...customerIdSet],
    objectIds,
  };
}

/** Returns true if the customer document is in the request user's scope. */
function isCustomerInScope(
  scope: ScopedRequest["scope"],
  scopeKeys: Awaited<ReturnType<typeof loadCustomerScopeKeys>>,
  customer: any,
): boolean {
  if (!scope || scope.isMaster || !scopeKeys) return true;
  const phone = String(customer?.phone ?? "").trim().toLowerCase();
  const email = String(customer?.email ?? "").trim().toLowerCase();
  const id = String(customer?._id ?? customer?.id ?? "").trim();
  if (phone && scopeKeys.phones.includes(phone)) return true;
  if (email && scopeKeys.emails.includes(email)) return true;
  if (id && scopeKeys.customerIds.includes(id)) return true;
  return false;
}

const ACTIVE_ORDER_STATUSES = new Set(["pending", "confirmed", "out_for_delivery"]);

const customerSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    dateOfBirth: String,
    walletBalance: { type: Number, default: 0 },
    addresses: { type: Array, default: [] },
    orders: { type: Array, default: [] },
    usedCoupons: { type: Array, default: [] },
    activeCoupons: { type: Array, default: [] },
  },
  { timestamps: true, strict: false }
);

async function getCustomerModel() {
  const conn = await getCustomersConnection();
  if (conn.models["Customer"]) return conn.models["Customer"];
  return conn.model("Customer", customerSchema, "customers");
}

function serializeCustomer(doc: any) {
  return {
    id: String(doc._id),
    name: doc.name ?? "",
    email: doc.email ?? "",
    phone: doc.phone ?? "",
    dateOfBirth: doc.dateOfBirth ?? "",
    walletBalance: Number(doc.walletBalance) || 0,
    addresses: doc.addresses ?? [],
    orders: doc.orders ?? [],
    usedCoupons: doc.usedCoupons ?? [],
    activeCoupons: doc.activeCoupons ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}


function sanitizeAddresses(addresses: any): any[] {
  if (!Array.isArray(addresses)) return [];
  return addresses
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const cleaned: Record<string, any> = {};
      const keep = [
        "label", "type", "name", "phone",
        "houseNo", "flatNo", "building", "society", "apartment",
        "street", "addressLine1", "addressLine2", "area", "locality",
        "landmark", "city", "state", "pincode", "zipCode",
        "instructions", "deliveryInstructions",
        "latitude", "longitude", "isDefault",
      ];
      for (const k of keep) {
        if (a[k] !== undefined && a[k] !== null && a[k] !== "") cleaned[k] = a[k];
      }
      return Object.keys(cleaned).length ? cleaned : null;
    })
    .filter(Boolean);
}

function normalize(value: any) {
  return String(value ?? "").trim().toLowerCase();
}

function getOrderId(order: any) {
  return String(order?._id ?? order?.id ?? order?.orderId ?? "");
}

function matchesCustomer(order: any, customer: any) {
  const phone = normalize(customer.phone);
  const email = normalize(customer.email);
  const id = normalize(customer.id);

  const orderPhones = [
    order.phone,
    order.customerPhone,
    order.mobile,
    order.customer?.phone,
    order.deliveryAddress?.phone,
  ].map(normalize).filter(Boolean);

  const orderEmails = [
    order.email,
    order.customerEmail,
    order.customer?.email,
  ].map(normalize).filter(Boolean);

  const orderCustomerIds = [
    order.customerId,
    order.userId,
    order.customer?._id,
    order.customer?.id,
  ].map(normalize).filter(Boolean);

  return (
    (phone && orderPhones.includes(phone)) ||
    (email && orderEmails.includes(email)) ||
    (id && orderCustomerIds.includes(id))
  );
}

function buildOrdersQuery(customers: any[]) {
  const phones = [...new Set(customers.map((c) => normalize(c.phone)).filter(Boolean))];
  const emails = [...new Set(customers.map((c) => normalize(c.email)).filter(Boolean))];
  const ids = [...new Set(customers.map((c) => String(c.id)).filter(Boolean))];
  const orderIds = customers
    .flatMap((c) => (Array.isArray(c.orders) ? c.orders : []))
    .map(getOrderId)
    .filter(Boolean);
  const objectIds = orderIds
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const or: any[] = [];
  if (phones.length) {
    or.push({ phone: { $in: phones } }, { customerPhone: { $in: phones } }, { "customer.phone": { $in: phones } });
  }
  if (emails.length) {
    or.push({ email: { $in: emails } }, { customerEmail: { $in: emails } }, { "customer.email": { $in: emails } });
  }
  if (ids.length) {
    or.push({ customerId: { $in: ids } }, { userId: { $in: ids } }, { "customer.id": { $in: ids } });
  }
  if (objectIds.length) {
    or.push({ _id: { $in: objectIds } });
  }
  return or.length ? { $or: or } : null;
}

async function enrichCustomers(customers: any[], log?: any) {
  if (!customers.length) return customers;
  const query = buildOrdersQuery(customers);
  if (!query) return customers.map((c) => ({ ...c, currentOrders: [], orderHistory: c.orders ?? [] }));

  let liveOrders: any[] = [];
  try {
    const ordersConn = await getSubHubDbConnection("orders");
    liveOrders = await ordersConn.db.collection("orders").find(query).sort({ createdAt: -1 }).limit(1000).toArray();
  } catch (err) {
    log?.warn?.({ err }, "Could not enrich customers with live orders");
  }

  // Build a set of all live order IDs (full string of MongoDB _id).
  // Used to detect stale stored refs for orders that no longer exist in the DB.
  const liveOrderIdSet = new Set(liveOrders.map((o) => String(o._id)));

  return customers.map((customer) => {
    const linkedOrders = liveOrders.filter((order) => matchesCustomer(order, customer));
    // Live orders come FIRST so their full data (status, orderNumber, discount, etc.)
    // wins deduplication over the minimal stored refs in customer.orders.
    const storedRefs = Array.isArray(customer.orders) ? customer.orders : [];

    // Drop stale active stored refs — a stored ref that claims to be "active" but
    // whose ID is not present in liveOrders means the order was deleted from the DB
    // without the ref being cleaned up. Keeping it would show a ghost active order.
    // Historical (non-active) refs are kept as-is for order-history display.
    const validStoredRefs = storedRefs.filter((ref) => {
      if (!ACTIVE_ORDER_STATUSES.has(normalize(ref.status))) return true; // keep history
      const refId = getOrderId(ref);
      return refId ? liveOrderIdSet.has(refId) : false;
    });

    const combined = [...linkedOrders, ...validStoredRefs];
    const seen = new Set<string>();
    const orders = combined.filter((order) => {
      const id = getOrderId(order);
      const key = id || JSON.stringify(order);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const currentOrders = orders.filter((order) => ACTIVE_ORDER_STATUSES.has(normalize(order.status)));
    const orderHistory = orders.filter((order) => !ACTIVE_ORDER_STATUSES.has(normalize(order.status)));
    return { ...customer, orders, currentOrders, orderHistory };
  });
}

router.get("/", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const { search, sort = "createdAt_desc", page = "1", limit = "20" } = req.query as Record<string, string>;

    const filter: Record<string, any> = {};
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    // Apply hub scope: non-master users only see customers who placed at
    // least one order in their sub hubs.
    const scopeKeys = await loadCustomerScopeKeys(req.scope);
    if (scopeKeys) {
      const hasAnyKeys =
        scopeKeys.phones.length > 0 || scopeKeys.emails.length > 0 || scopeKeys.objectIds.length > 0;
      if (!hasAnyKeys) {
        const pageNumEmpty = Math.max(1, parseInt(page, 10));
        const limitNumEmpty = Math.min(100, Math.max(1, parseInt(limit, 10)));
        res.json({ customers: [], total: 0, page: pageNumEmpty, limit: limitNumEmpty });
        return;
      }
      const scopeOr: any[] = [];
      if (scopeKeys.phones.length) scopeOr.push({ phone: { $in: scopeKeys.phones } });
      if (scopeKeys.emails.length) scopeOr.push({ email: { $in: scopeKeys.emails } });
      if (scopeKeys.objectIds.length) scopeOr.push({ _id: { $in: scopeKeys.objectIds } });
      const scopeClause = { $or: scopeOr };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, scopeClause];
        delete filter.$or;
      } else {
        Object.assign(filter, scopeClause);
      }
    }

    let sortObj: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === "name_asc") sortObj = { name: 1 };
    else if (sort === "name_desc") sortObj = { name: -1 };
    else if (sort === "email_asc") sortObj = { email: 1 };
    else if (sort === "email_desc") sortObj = { email: -1 };
    else if (sort === "createdAt_asc") sortObj = { createdAt: 1 };
    else if (sort === "createdAt_desc") sortObj = { createdAt: -1 };

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort(sortObj).skip(skip).limit(limitNum),
      Customer.countDocuments(filter),
    ]);

    const enriched = await enrichCustomers(customers.map(serializeCustomer), req.log);
    res.json({ customers: enriched, total, page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "Failed to get customers");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch customers" });
  }
});

// Lean POS search — id/name/phone/addresses only, no order enrichment.
// Used by the point-of-sale customer lookup for fast as-you-type searching.
router.get("/pos-search", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const q = String(req.query.q ?? "").trim();
    if (!q) return void res.json({ customers: [] });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    const filter: any = { $or: [{ name: regex }, { phone: regex }] };

    const docs = await Customer.find(filter)
      .sort({ name: 1 })
      .limit(25)
      .select("name phone addresses");

    const customers = docs.map((d: any) => ({
      id: String(d._id),
      name: d.name ?? "",
      phone: d.phone ?? "",
      addresses: d.addresses ?? [],
    }));

    res.json({ customers });
  } catch (err) {
    req.log.error({ err }, "Failed to pos-search customers");
    res.status(500).json({ error: "InternalError", message: "Failed to search customers" });
  }
});

// Lean full list — id/name/phone only, no enrichment, no pagination cap.
// Used by the coupon modal to populate the customer picker with all customers.
router.get("/lean-all", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const scopeKeys = await loadCustomerScopeKeys(req.scope);
    const filter: Record<string, any> = {};
    if (scopeKeys) {
      const hasAnyKeys = scopeKeys.phones.length > 0 || scopeKeys.emails.length > 0 || scopeKeys.objectIds.length > 0;
      if (!hasAnyKeys) { res.json({ customers: [] }); return; }
      const scopeOr: any[] = [];
      if (scopeKeys.phones.length) scopeOr.push({ phone: { $in: scopeKeys.phones } });
      if (scopeKeys.emails.length) scopeOr.push({ email: { $in: scopeKeys.emails } });
      if (scopeKeys.objectIds.length) scopeOr.push({ _id: { $in: scopeKeys.objectIds } });
      Object.assign(filter, { $or: scopeOr });
    }
    const docs = await Customer.find(filter).sort({ name: 1 }).select("name phone");
    res.json({
      customers: docs.map((d: any) => ({
        id: String(d._id),
        name: d.name ?? "",
        phone: d.phone ?? "",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get lean customer list");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch customers" });
  }
});

router.get("/:id", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const customer = await Customer.findById(req.params.id);
    if (!customer) { res.status(404).json({ error: "NotFound", message: "Customer not found" }); return; }
    const scopeKeys = await loadCustomerScopeKeys(req.scope);
    if (!isCustomerInScope(req.scope, scopeKeys, customer)) {
      res.status(404).json({ error: "NotFound", message: "Customer not found" }); return;
    }
    const [enriched] = await enrichCustomers([serializeCustomer(customer)], req.log);
    res.json({ customer: enriched });
  } catch (err) {
    req.log.error({ err }, "Failed to get customer");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch customer" });
  }
});

router.post("/", async (req, res) => {
  try {
    const Customer = await getCustomerModel();
    const { name, email, phone, dateOfBirth, addresses } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400).json({ error: "ValidationError", message: "Name is required" });
      return;
    }
    if (!phone || !/^\d{10}$/.test(String(phone).trim())) {
      res.status(400).json({ error: "ValidationError", message: "A valid 10-digit phone number is required" });
      return;
    }

    const phoneTrim = String(phone).trim();
    const emailTrim = email ? String(email).toLowerCase().trim() : "";

    const phoneClash = await Customer.findOne({ phone: phoneTrim });
    if (phoneClash) {
      res.status(400).json({ error: "DuplicatePhone", message: "A customer with this phone number already exists" });
      return;
    }
    if (emailTrim) {
      const existing = await Customer.findOne({ email: emailTrim });
      if (existing) {
        res.status(400).json({ error: "DuplicateEmail", message: "A customer with this email already exists" });
        return;
      }
    }

    const customer = await Customer.create({
      name: String(name).trim(),
      email: emailTrim || null,
      phone: phoneTrim,
      dateOfBirth: dateOfBirth ?? null,
      addresses: sanitizeAddresses(addresses),
      orders: [],
    });

    res.status(201).json({ customer: serializeCustomer(customer) });
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(400).json({ error: "DuplicateField", message: "A customer with this email or phone already exists" });
      return;
    }
    req.log.error({ err }, "Failed to create customer");
    res.status(500).json({ error: "InternalError", message: "Failed to create customer" });
  }
});

router.put("/:id", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const customer = await Customer.findById(req.params.id);
    if (!customer) { res.status(404).json({ error: "NotFound", message: "Customer not found" }); return; }
    const scopeKeys = await loadCustomerScopeKeys(req.scope);
    if (!isCustomerInScope(req.scope, scopeKeys, customer)) {
      res.status(404).json({ error: "NotFound", message: "Customer not found" }); return;
    }

    const { name, email, phone, dateOfBirth, addresses, walletBalance } = req.body;

    if (email !== undefined && email && String(email).toLowerCase().trim() !== String(customer.email ?? "")) {
      const existing = await Customer.findOne({ email: String(email).toLowerCase().trim(), _id: { $ne: customer._id } });
      if (existing) {
        res.status(400).json({ error: "DuplicateEmail", message: "A customer with this email already exists" });
        return;
      }
    }
    if (phone !== undefined && phone && String(phone).trim() !== String((customer as any).phone ?? "")) {
      if (!/^\d{10}$/.test(String(phone).trim())) {
        res.status(400).json({ error: "ValidationError", message: "Phone must be exactly 10 digits" });
        return;
      }
      const existing = await Customer.findOne({ phone: String(phone).trim(), _id: { $ne: customer._id } });
      if (existing) {
        res.status(400).json({ error: "DuplicatePhone", message: "A customer with this phone number already exists" });
        return;
      }
    }

    if (name !== undefined) customer.name = String(name).trim();
    if (email !== undefined) (customer as any).email = email ? String(email).toLowerCase().trim() : null;
    if (phone !== undefined) (customer as any).phone = String(phone).trim();
    if (dateOfBirth !== undefined) (customer as any).dateOfBirth = dateOfBirth;
    if (addresses !== undefined) (customer as any).addresses = sanitizeAddresses(addresses);
    if (walletBalance !== undefined) (customer as any).walletBalance = Math.max(0, Number(walletBalance) || 0);

    await customer.save();
    res.json({ customer: serializeCustomer(customer) });
  } catch (err) {
    req.log.error({ err }, "Failed to update customer");
    res.status(500).json({ error: "InternalError", message: "Failed to update customer" });
  }
});

// PATCH /api/customers/:id/wallet — add or subtract wallet balance
router.patch("/:id/wallet", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const { delta, reason } = req.body;
    const amount = Number(delta);
    if (!Number.isFinite(amount) || amount === 0) {
      res.status(400).json({ error: "InvalidAmount", message: "delta must be a non-zero finite number" }); return;
    }
    const customer = await Customer.findById(req.params.id) as any;
    if (!customer) { res.status(404).json({ error: "NotFound", message: "Customer not found" }); return; }
    const current = Number(customer.walletBalance) || 0;
    const newBalance = Math.max(0, current + amount);
    customer.walletBalance = newBalance;
    await customer.save();
    req.log?.info({ customerId: req.params.id, delta: amount, newBalance, reason }, "Wallet adjusted");
    res.json({ walletBalance: newBalance });
  } catch (err) {
    req.log?.error({ err }, "Failed to adjust wallet");
    res.status(500).json({ error: "InternalError", message: "Failed to adjust wallet" });
  }
});

router.delete("/:id", async (req: ScopedRequest, res) => {
  try {
    const Customer = await getCustomerModel();
    const customer = await Customer.findById(req.params.id);
    if (!customer) { res.status(404).json({ error: "NotFound", message: "Customer not found" }); return; }
    const scopeKeys = await loadCustomerScopeKeys(req.scope);
    if (!isCustomerInScope(req.scope, scopeKeys, customer)) {
      res.status(404).json({ error: "NotFound", message: "Customer not found" }); return;
    }
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: "Customer deleted successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete customer");
    res.status(500).json({ error: "InternalError", message: "Failed to delete customer" });
  }
});

export default router;
