import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { loadScope, type ScopedRequest } from "../middlewares/scope.js";
import { getSubHubDbConnection } from "../db/sub-hub-connections.js";

const router = Router();
router.use(requireAuth as any);
router.use(loadScope as any);

async function getOrdersDb() {
  return getSubHubDbConnection("orders");
}

function buildDateFilter(from: string, to: string): Record<string, any> {
  if (!from && !to) return {};
  const dateFilter: any = {};
  if (from) dateFilter.$gte = from;
  if (to) dateFilter.$lte = to;
  return { deliveryDate: dateFilter };
}

const ORDER_PROJECTION = {
  _id: 1, orderId: 1, orderNumber: 1, customerName: 1, phone: 1, total: 1,
  paidAmount: 1, dueAmount: 1, payments: 1, paymentStatus: 1, status: 1,
  deliveryType: 1, assignedDeliveryPersonId: 1, assignedDeliveryPersonName: 1,
  createdAt: 1, deliveryDate: 1, subHubName: 1, deliveryArea: 1, items: 1, isExpress: 1,
};

interface ModeData { count: number; amount: number; }

function processOrders(orders: any[]) {
  const personMap = new Map<string, any>();

  for (const order of orders) {
    // Porter/express orders always group under the virtual "Porter Delivery" person
    const isPorter = !!order.isExpress || String(order.assignedDeliveryPersonId || "") === "porter_delivery";
    const personId = isPorter
      ? "porter_delivery"
      : String(order.assignedDeliveryPersonId || "unassigned");
    const personName = isPorter
      ? "Porter Delivery"
      : order.assignedDeliveryPersonName ||
        (order.deliveryType === "takeaway" ? "Takeaway (Counter)" : "Unassigned");

    if (!personMap.has(personId)) {
      personMap.set(personId, {
        personId,
        personName,
        orderCount: 0,
        totalRevenue: 0,
        dueAmount: 0,
        walletExtra: 0,
        byMode: {} as Record<string, ModeData>,
        orders: [] as any[],
      });
    }

    const person = personMap.get(personId)!;
    person.orderCount++;
    person.dueAmount += Number(order.dueAmount) || 0;

    const payments: any[] = Array.isArray(order.payments) ? order.payments : [];
    let nonWalletCollected = 0;
    for (const p of payments) {
      const mode = (p.mode || "other").toLowerCase();
      const amount = Number(p.amount) || 0;
      // Wallet payments = wallet balance used by customer (not physically collected).
      // Exclude from the delivery report's collected totals and mode breakdown.
      if (mode === "wallet") continue;
      if (!person.byMode[mode]) person.byMode[mode] = { count: 0, amount: 0 };
      (person.byMode[mode] as ModeData).count++;
      (person.byMode[mode] as ModeData).amount += amount;
      person.totalRevenue += amount;
      nonWalletCollected += amount;
    }

    // Extra physically collected beyond order total → credited to customer wallet
    const orderTotal = Number(order.total) || 0;
    const excess = Math.max(0, nonWalletCollected - orderTotal);
    person.walletExtra += excess;

    person.orders.push({
      id: String(order._id),
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      total: order.total,
      paidAmount: order.paidAmount,
      dueAmount: order.dueAmount,
      paymentStatus: order.paymentStatus,
      payments: payments.map((p: any) => ({ mode: p.mode, amount: p.amount, reference: p.reference })),
      status: order.status,
      deliveryType: order.deliveryType,
      createdAt: order.createdAt,
      subHubName: order.subHubName,
      deliveryArea: order.deliveryArea,
      itemCount: Array.isArray(order.items) ? order.items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0) : 0,
    });
  }

  return personMap;
}

function buildScopeFilter(req: ScopedRequest, personId?: string): Record<string, any> | null {
  const scope = req.scope;
  const filter: any = {};

  if (!scope || scope.isMaster) {
    if (personId && personId !== "unassigned") filter.assignedDeliveryPersonId = personId;
    return filter;
  }

  if (scope.role === "delivery_person") {
    const uid = req.admin?.adminId;
    if (!uid) return null;
    filter.assignedDeliveryPersonId = String(uid);
    return filter;
  }

  if (!scope.subHubIds || scope.subHubIds.length === 0) return null;
  filter.subHubId = { $in: scope.subHubIds };
  if (personId && personId !== "unassigned") filter.assignedDeliveryPersonId = personId;
  return filter;
}

// ─── GET /api/delivery-report ─────────────────────────────────────────────────
// ?from=YYYY-MM-DD  &to=YYYY-MM-DD  &personId=<id>
router.get("/", async (req: ScopedRequest, res) => {
  try {
    const conn = await getOrdersDb();
    const col = conn.db.collection("orders");
    const { from = "", to = "", personId = "" } = req.query as Record<string, string>;

    const scopeFilter = buildScopeFilter(req, personId || undefined);
    if (!scopeFilter) {
      res.json({ summary: { totalOrders: 0, totalRevenue: 0, dueAmount: 0, byMode: {} }, byPerson: [] });
      return;
    }

    const filter: any = {
      $or: [{ status: "delivered" }, { deliveryType: "takeaway" }],
      ...scopeFilter,
      ...buildDateFilter(from, to),
    };

    const orders = await col
      .find(filter, { projection: ORDER_PROJECTION })
      .sort({ createdAt: -1 })
      .toArray();

    const personMap = processOrders(orders);
    const byPersonArr = Array.from(personMap.values()).sort((a, b) => b.orderCount - a.orderCount);

    const globalByMode: Record<string, ModeData> = {};
    let totalRevenue = 0;
    let totalDue = 0;
    let totalWalletExtra = 0;

    for (const p of byPersonArr) {
      totalRevenue += p.totalRevenue;
      totalDue += p.dueAmount;
      totalWalletExtra += p.walletExtra || 0;
      for (const [mode, data] of Object.entries(p.byMode) as [string, ModeData][]) {
        if (!globalByMode[mode]) globalByMode[mode] = { count: 0, amount: 0 };
        globalByMode[mode].count += data.count;
        globalByMode[mode].amount += data.amount;
      }
    }

    res.json({
      summary: { totalOrders: orders.length, totalRevenue, dueAmount: totalDue, walletExtra: totalWalletExtra, byMode: globalByMode },
      byPerson: byPersonArr,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch delivery report");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch delivery report" });
  }
});

// ─── GET /api/delivery-report/person/:id ─────────────────────────────────────
// ?from=YYYY-MM-DD  &to=YYYY-MM-DD
router.get("/person/:id", async (req: ScopedRequest, res) => {
  try {
    const conn = await getOrdersDb();
    const col = conn.db.collection("orders");
    const { from = "", to = "" } = req.query as Record<string, string>;
    const targetPersonId = req.params.id;

    const scopeFilter = buildScopeFilter(req, targetPersonId);
    if (!scopeFilter) {
      res.json({
        person: { personId: targetPersonId, personName: "Unknown", orderCount: 0, totalRevenue: 0, dueAmount: 0, byMode: {}, orders: [] },
        summary: { totalOrders: 0, totalRevenue: 0, dueAmount: 0, byMode: {} },
      });
      return;
    }

    const filter: any = {
      $or: [{ status: "delivered" }, { deliveryType: "takeaway" }],
      ...scopeFilter,
      ...buildDateFilter(from, to),
    };

    const orders = await col
      .find(filter, { projection: ORDER_PROJECTION })
      .sort({ createdAt: -1 })
      .toArray();

    const personMap = processOrders(orders);

    // For delivery_person scope, personId may be their own ID, not targetPersonId
    const actualId =
      req.scope && !req.scope.isMaster && req.scope.role === "delivery_person"
        ? String(req.admin?.adminId ?? targetPersonId)
        : targetPersonId;

    const person = personMap.get(actualId) ?? {
      personId: actualId,
      personName: "No deliveries in range",
      orderCount: 0,
      totalRevenue: 0,
      dueAmount: 0,
      byMode: {},
      orders: [],
    };

    res.json({
      person,
      summary: {
        totalOrders: person.orderCount,
        totalRevenue: person.totalRevenue,
        dueAmount: person.dueAmount,
        byMode: person.byMode,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch person delivery report");
    res.status(500).json({ error: "InternalError", message: "Failed to fetch person delivery report" });
  }
});

export default router;
