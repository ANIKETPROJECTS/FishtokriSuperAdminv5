import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet, Download, RefreshCw, Package, AlertCircle,
  ClipboardList, Boxes, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function getToken() { return localStorage.getItem("fishtokri_token") || ""; }
function getAdmin() {
  try { return JSON.parse(localStorage.getItem("fishtokri_admin") || "null"); } catch { return null; }
}

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return res.json();
}

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n + 1); return d.toISOString().slice(0, 10);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatRupees(n: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  unpaid: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-600",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  out_for_delivery: "bg-blue-100 text-blue-700",
  confirmed: "bg-purple-100 text-purple-700",
  pending: "bg-yellow-100 text-yellow-700",
  takeaway: "bg-orange-100 text-orange-700",
};

// ── Date filter bar ──────────────────────────────────────────────────────────
function DateFilterBar({
  from, to, setFrom, setTo, applied, onApply,
}: {
  from: string; to: string;
  setFrom: (v: string) => void; setTo: (v: string) => void;
  applied: { from: string; to: string };
  onApply: (f?: string, t?: string) => void;
}) {
  const PRESETS = [
    { label: "Today", f: today(), t: today() },
    { label: "Last 7 Days", f: daysAgo(7), t: today() },
    { label: "Last 30 Days", f: daysAgo(30), t: today() },
  ];
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex gap-2">
        {PRESETS.map(({ label, f, t }) => (
          <button
            key={label}
            onClick={() => { setFrom(f); setTo(t); onApply(f, t); }}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              applied.from === f && applied.to === t
                ? "bg-brand-primary text-white"
                : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 block mb-1">From</label>
          <Input type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); onApply(e.target.value, to); }}
            className="w-full text-sm h-9" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 block mb-1">To</label>
          <Input type="date" value={to}
            onChange={(e) => { setTo(e.target.value); onApply(from, e.target.value); }}
            className="w-full text-sm h-9" />
        </div>
      </div>
    </div>
  );
}

// ── Hub selector ─────────────────────────────────────────────────────────────
function HubSelector({
  subHubs, selectedSubHubId, onChange,
}: {
  subHubs: any[]; selectedSubHubId: string; onChange: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <label className="text-xs font-semibold text-gray-500 block mb-2">Sub Hub</label>
      <select
        value={selectedSubHubId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 h-9 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      >
        <option value="">— Select Sub Hub —</option>
        {subHubs.map((h) => (
          <option key={h.id || h._id} value={h.id || h._id}>{h.name}</option>
        ))}
      </select>
    </div>
  );
}

// ── ORDERS REPORT ────────────────────────────────────────────────────────────
function OrdersReport({ subHubs }: { subHubs: any[] }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: today(), to: today() });
  const [subHubId, setSubHubId] = useState("");

  const admin = getAdmin();
  const isSubHub = admin?.role === "sub_hub";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["day-end-orders", applied.from, applied.to, subHubId],
    queryFn: () => {
      const p = new URLSearchParams({ from: applied.from, to: applied.to });
      if (subHubId) p.set("subHubId", subHubId);
      return apiFetch(`/api/reports/day-end/orders?${p}`);
    },
  });

  const orders: any[] = data?.orders ?? [];

  const handleDownload = useCallback(() => {
    if (!orders.length) return;

    const rows: any[] = [];
    rows.push([
      "Invoice No", "Customer Name", "Phone", "Address",
      "Ordered Items", "Total Price (₹)", "Delivery Partner",
      "Payment Mode", "Payment Status", "Order Status",
      "Delivery Date", "Sub Hub",
    ]);

    for (const o of orders) {
      rows.push([
        o.invoiceNo,
        o.customerName,
        o.phone,
        o.address,
        o.itemsSummary,
        o.total,
        o.deliveryPerson,
        o.paymentMode,
        o.paymentStatus,
        o.status,
        o.deliveryDate || "—",
        o.subHubName,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 35 },
      { wch: 45 }, { wch: 16 }, { wch: 22 },
      { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders Report");
    const filename = `orders-report-${applied.from}-to-${applied.to}.xlsx`;
    XLSX.writeFile(wb, filename);
  }, [orders, applied]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DateFilterBar from={from} to={to} setFrom={setFrom} setTo={setTo}
            applied={applied} onApply={(f, t) => setApplied({ from: f ?? from, to: t ?? to })} />
        </div>
        {!isSubHub && subHubs.length > 0 && (
          <HubSelector subHubs={subHubs} selectedSubHubId={subHubId} onChange={setSubHubId} />
        )}
      </div>

      {/* Summary + Download */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <p className="text-xs font-semibold text-gray-500">Total Orders</p>
            <p className="text-xl font-bold text-brand-primary">{orders.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <p className="text-xs font-semibold text-gray-500">Total Revenue</p>
            <p className="text-xl font-bold text-green-600">
              {formatRupees(orders.reduce((s, o) => s + (o.total || 0), 0))}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!orders.length || isFetching}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="w-3.5 h-3.5" />
            Download Excel
          </Button>
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading orders…</span>
        </div>
      )}
      {isError && (
        <div className="text-center py-12 text-red-500 text-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" />
          Failed to load orders. Please try again.
        </div>
      )}
      {!isLoading && !isError && orders.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">No orders found for this period</p>
          <p className="text-sm mt-1">Try adjusting the date range or hub filter</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && orders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Invoice No</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Phone</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap min-w-[180px]">Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap min-w-[200px]">Items & Qty</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Delivery Partner</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Payment Mode</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Payment Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Order Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-brand-secondary bg-blue-50 px-2 py-1 rounded">
                        {o.invoiceNo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{o.customerName}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.phone}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">
                      <span className="line-clamp-2">{o.address}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {o.items.map((it: any, j: number) => (
                          <div key={j} className="text-xs text-gray-700">
                            <span className="font-medium">{it.name}</span>
                            <span className="text-gray-400"> × {it.quantity}{it.unit ? ` ${it.unit}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {formatRupees(o.total)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{o.deliveryPerson}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-gray-700">{o.paymentMode}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        STATUS_COLORS[(o.paymentStatus || "").toLowerCase()] || "bg-gray-100 text-gray-600"
                      }`}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${
                        ORDER_STATUS_COLORS[(o.status || "").toLowerCase()] || "bg-gray-100 text-gray-600"
                      }`}>
                        {(o.status || "").replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── INVENTORY REPORT ─────────────────────────────────────────────────────────
function InventoryReport({ subHubs }: { subHubs: any[] }) {
  const [subHubId, setSubHubId] = useState(subHubs[0]?.id || subHubs[0]?._id || "");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const admin = getAdmin();
  const isSubHub = admin?.role === "sub_hub";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["day-end-inventory", subHubId],
    queryFn: () => apiFetch(`/api/reports/day-end/inventory?subHubId=${subHubId}`),
    enabled: !!subHubId,
  });

  const products: any[] = data?.products ?? [];

  const toggleProduct = (id: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedProducts(new Set(products.map((p) => p.productId)));
  const collapseAll = () => setExpandedProducts(new Set());

  const handleDownload = useCallback(() => {
    if (!products.length) return;

    const rows: any[] = [];

    // Header
    rows.push([
      "Product Name", "Category", "Unit", "Price (₹)",
      "Batch No.", "Batch Qty", "Received Date", "Expiry Date",
      "Shelf Life (Days)", "Days Left", "Status", "Notes",
      "", "Product Total Qty",
    ]);

    for (const p of products) {
      const batches: any[] = p.batches ?? [];
      if (batches.length === 0) {
        rows.push([
          p.name, p.category, p.unit, p.price,
          "—", 0, "—", "—", "—", "—", p.status === "available" ? "Available" : "Unavailable", "—",
          "", p.totalQuantity,
        ]);
        continue;
      }

      batches.forEach((b, idx) => {
        const daysLeftLabel = b.daysLeft === null ? "No Expiry"
          : b.isExpired ? `Expired (${Math.abs(b.daysLeft)}d ago)`
          : `${b.daysLeft}d left`;

        rows.push([
          idx === 0 ? p.name : "",
          idx === 0 ? p.category : "",
          idx === 0 ? p.unit : "",
          idx === 0 ? p.price : "",
          b.batchNumber,
          b.quantity,
          b.receivedDate || "—",
          b.expiryDate || "—",
          b.shelfLifeDays ?? "—",
          daysLeftLabel,
          b.isExpired ? "Expired" : "Active",
          b.notes || "—",
          "",
          idx === batches.length - 1 ? p.totalQuantity : "",
        ]);
      });

      // Subtotal row
      rows.push([
        "", "", "", "",
        "↳ SUBTOTAL", p.totalQuantity, "", "", "", "", "", "",
        "", "",
      ]);
    }

    // Grand total
    const grandTotal = products.reduce((s, p) => s + p.totalQuantity, 0);
    rows.push([]);
    rows.push(["GRAND TOTAL (All Products)", "", "", "", "", grandTotal]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
      { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 22 },
      { wch: 2 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
    const subHubName = data?.subHub?.name || "inventory";
    XLSX.writeFile(wb, `${subHubName.replace(/\s+/g, "-")}-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [products, data]);

  const grandTotal = useMemo(() => products.reduce((s, p) => s + p.totalQuantity, 0), [products]);

  return (
    <div className="space-y-4">
      {/* Hub selector + controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {!isSubHub && subHubs.length > 0 ? (
          <div className="w-full sm:w-72">
            <HubSelector subHubs={subHubs} selectedSubHubId={subHubId} onChange={setSubHubId} />
          </div>
        ) : (
          <div />
        )}
        <div className="flex gap-2 flex-shrink-0">
          {products.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={expandAll} className="gap-1 text-xs">
                <ChevronDown className="w-3.5 h-3.5" /> Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} className="gap-1 text-xs">
                <ChevronRight className="w-3.5 h-3.5" /> Collapse All
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!products.length || isFetching || !subHubId}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="w-3.5 h-3.5" />
            Download Excel
          </Button>
        </div>
      </div>

      {/* No hub selected */}
      {!subHubId && (
        <div className="text-center py-20 text-gray-400">
          <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">Select a Sub Hub to view inventory</p>
        </div>
      )}

      {/* States */}
      {subHubId && isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading inventory…</span>
        </div>
      )}
      {subHubId && isError && (
        <div className="text-center py-12 text-red-500 text-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" />
          Failed to load inventory. Please try again.
        </div>
      )}
      {subHubId && !isLoading && !isError && products.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">No inventory products found for this hub</p>
        </div>
      )}

      {/* Summary strip */}
      {subHubId && !isLoading && !isError && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Products</p>
            <p className="text-2xl font-bold text-brand-primary">{products.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Stock</p>
            <p className="text-2xl font-bold text-gray-800">{grandTotal.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Out of Stock</p>
            <p className="text-2xl font-bold text-red-500">
              {products.filter((p) => p.activeQuantity === 0).length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiring Soon</p>
            <p className="text-2xl font-bold text-amber-500">
              {products.filter((p) =>
                p.batches.some((b: any) => !b.isExpired && b.daysLeft !== null && b.daysLeft <= 3)
              ).length}
            </p>
          </div>
        </div>
      )}

      {/* Inventory table */}
      {subHubId && !isLoading && !isError && products.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap w-8"></th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Product Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Unit</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap text-right">
                    Total Qty
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isExpanded = expandedProducts.has(p.productId);
                  const hasBatches = p.batches && p.batches.length > 0;
                  return (
                    <>
                      {/* Product row */}
                      <tr
                        key={p.productId}
                        className={`border-b border-gray-100 transition-colors ${
                          hasBatches ? "cursor-pointer hover:bg-blue-50/50" : "hover:bg-gray-50/50"
                        }`}
                        onClick={() => hasBatches && toggleProduct(p.productId)}
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {hasBatches ? (
                            isExpanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-gray-900">{p.name}</span>
                          {hasBatches && (
                            <span className="ml-2 text-xs text-gray-400 font-normal">
                              {p.batches.length} batch{p.batches.length !== 1 ? "es" : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{p.category}</td>
                        <td className="px-4 py-3 text-gray-500">{p.unit || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold text-base ${
                            p.activeQuantity === 0 ? "text-red-500" : "text-gray-900"
                          }`}>
                            {p.totalQuantity.toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            p.activeQuantity === 0
                              ? "bg-red-100 text-red-700"
                              : p.status === "available"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {p.activeQuantity === 0 ? "Out of Stock" : p.status === "available" ? "Available" : "Unavailable"}
                          </span>
                        </td>
                      </tr>

                      {/* Batch detail rows */}
                      {isExpanded && hasBatches && (
                        <>
                          {/* Batch header */}
                          <tr className="bg-blue-50/60 border-b border-blue-100">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-xs font-semibold text-blue-700">Batch No.</td>
                            <td className="px-4 py-2 text-xs font-semibold text-blue-700">Batch Qty</td>
                            <td className="px-4 py-2 text-xs font-semibold text-blue-700">Date Added</td>
                            <td className="px-4 py-2 text-xs font-semibold text-blue-700">Expiry Date</td>
                            <td className="px-4 py-2 text-xs font-semibold text-blue-700">Days Left</td>
                          </tr>

                          {p.batches.map((b: any, bi: number) => (
                            <tr key={bi} className="border-b border-blue-50 bg-blue-50/30 hover:bg-blue-50/60">
                              <td className="px-4 py-2.5"></td>
                              <td className="px-4 py-2.5">
                                <span className="text-xs font-mono font-semibold text-gray-700">
                                  {b.batchNumber || `Batch ${bi + 1}`}
                                </span>
                                {b.notes && (
                                  <p className="text-xs text-gray-400 mt-0.5">{b.notes}</p>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-sm font-bold ${
                                  b.isExpired ? "text-gray-400 line-through" : "text-gray-800"
                                }`}>
                                  {b.quantity.toLocaleString("en-IN")}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">
                                {formatDate(b.receivedDate)}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">
                                {b.expiryDate ? formatDate(b.expiryDate) : <span className="text-gray-400">No Expiry</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                {b.daysLeft === null ? (
                                  <span className="text-xs text-gray-400">—</span>
                                ) : b.isExpired ? (
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">
                                    Expired {Math.abs(b.daysLeft)}d ago
                                  </span>
                                ) : b.daysLeft <= 3 ? (
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                                    {b.daysLeft}d left ⚠️
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                                    {b.daysLeft}d left
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}

                          {/* Product subtotal row */}
                          <tr className="bg-brand-primary/5 border-b border-brand-primary/10">
                            <td className="px-4 py-2.5"></td>
                            <td className="px-4 py-2.5 text-xs font-bold text-brand-secondary" colSpan={1}>
                              ↳ {p.name} — Subtotal
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm font-bold text-brand-secondary">
                                {p.totalQuantity.toLocaleString("en-IN")} {p.unit}
                              </span>
                            </td>
                            <td colSpan={3} className="px-4 py-2.5 text-xs text-gray-500">
                              Active: {p.activeQuantity.toLocaleString("en-IN")} {p.unit}
                              {p.totalQuantity !== p.activeQuantity && (
                                <span className="ml-2 text-red-400">
                                  ({(p.totalQuantity - p.activeQuantity).toLocaleString("en-IN")} expired)
                                </span>
                              )}
                            </td>
                          </tr>
                        </>
                      )}
                    </>
                  );
                })}

                {/* Grand total row */}
                <tr className="bg-brand-secondary/5 border-t-2 border-brand-secondary/20">
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 font-bold text-brand-secondary text-sm" colSpan={3}>
                    OVERALL TOTAL — {data?.subHub?.name || "All Products"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-lg font-black text-brand-secondary">
                      {grandTotal.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-4"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
type Tab = "orders" | "inventory";

export default function DayEndReportPage() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const admin = getAdmin();
  const isMaster = admin?.role === "master_admin";
  const isSuperHub = admin?.role === "super_hub";

  // Fetch sub-hubs list for hub selector
  const { data: subHubsData } = useQuery({
    queryKey: ["sub-hubs-for-report"],
    queryFn: () => apiFetch("/api/sub-hubs"),
    enabled: isMaster || isSuperHub,
  });

  const subHubs: any[] = useMemo(() => {
    const raw = subHubsData?.subHubs ?? subHubsData?.data ?? [];
    return raw.map((h: any) => ({ id: h._id || h.id, name: h.name }));
  }, [subHubsData]);

  // For sub_hub role, use their own assigned sub hubs
  const adminSubHubs: any[] = useMemo(() => {
    if (!admin) return [];
    const ids: string[] = admin.subHubIds?.length
      ? admin.subHubIds
      : admin.subHubId
      ? [admin.subHubId]
      : [];
    return ids.map((id: string, i: number) => ({ id, name: admin.subHubNames?.[i] || `Sub Hub ${i + 1}` }));
  }, [admin]);

  const availableSubHubs = isMaster || isSuperHub ? subHubs : adminSubHubs;

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "orders", label: "Orders Report", icon: <ClipboardList className="w-4 h-4" /> },
    { key: "inventory", label: "Inventory Report", icon: <Boxes className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="w-5 h-5 text-brand-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Day End Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Orders and inventory summary — download in Excel format
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === key
                ? "bg-white text-brand-primary shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "orders" && <OrdersReport subHubs={availableSubHubs} />}
      {activeTab === "inventory" && <InventoryReport subHubs={availableSubHubs} />}
    </div>
  );
}
