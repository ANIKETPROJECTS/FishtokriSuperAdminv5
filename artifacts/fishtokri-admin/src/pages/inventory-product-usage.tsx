import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Building2, Lock, ChevronRight, Package,
  ShoppingCart, RotateCcw, Wrench, SlidersHorizontal,
  ArrowDownCircle, ArrowUpCircle, Calendar,
  Layers, TrendingDown, TrendingUp, Activity,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/pagination-bar";
import { usePaginated } from "@/hooks/use-paginated";

function getToken() { return localStorage.getItem("fishtokri_token") ?? ""; }

async function apiFetch(path: string, options: RequestInit = {}) {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Request failed");
  return data;
}

type Movement = {
  _id: string;
  type: "order_deduct" | "order_restore" | "adjustment";
  productId: string;
  productName: string;
  unit?: string;
  change: number;
  balance: number;
  orderId?: string;
  orderRef?: string;
  invoiceId?: string;
  customerName?: string;
  batchNumbers?: string;
  subReason?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
};

type SubReasonMeta = { label: string; tone: string };
function getSubReasonMeta(m: Movement): SubReasonMeta | null {
  if (m.type === "adjustment") return { label: "Manual Adjustment", tone: "bg-blue-50 text-blue-700" };
  if (m.type === "order_deduct" || m.type === "order_restore") {
    switch (m.subReason) {
      case "order_placed":   return { label: "Order Deduction", tone: "bg-red-50 text-red-700" };
      case "order_cancelled": return { label: "Order Cancelled", tone: "bg-emerald-50 text-emerald-700" };
      case "order_deleted":  return { label: "Order Deleted", tone: "bg-orange-50 text-orange-700" };
      case "items_changed":  return m.type === "order_restore"
        ? { label: "Items Changed", tone: "bg-emerald-50 text-emerald-700" }
        : { label: "Items Changed", tone: "bg-amber-50 text-amber-700" };
      default: return m.type === "order_deduct"
        ? { label: "Order Deduction", tone: "bg-red-50 text-red-700" }
        : { label: "Order Restore", tone: "bg-emerald-50 text-emerald-700" };
    }
  }
  return null;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function LockedHubBadge({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hidden sm:inline">{label}</span>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
        <Building2 className="w-3.5 h-3.5 text-[#364F9F] flex-shrink-0" />
        <span className="text-sm font-semibold text-[#162B4D]">{name}</span>
        <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 ml-0.5" />
      </div>
    </div>
  );
}

const TYPE_META = {
  order_deduct: {
    label: "Order Deduction",
    short: "Order Deduct",
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    tone: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-400",
  },
  order_restore: {
    label: "Order Restore / Cancel",
    short: "Order Restore",
    icon: <RotateCcw className="w-3.5 h-3.5" />,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-400",
  },
  adjustment: {
    label: "Manual Adjustment",
    short: "Adjustment",
    icon: <Wrench className="w-3.5 h-3.5" />,
    tone: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-400",
  },
};

export default function InventoryProductUsage() {
  const params = useParams<{ productId: string }>();
  const [, navigate] = useLocation();
  const productId = params.productId;

  const qs = new URLSearchParams(window.location.search);
  const subHubId = qs.get("subHubId") ?? "";
  const subHubName = qs.get("subHubName") ?? "Sub Hub";
  const superHubName = qs.get("superHubName") ?? "Super Hub";
  const productName = qs.get("productName") ?? "Product";
  const batchNumber = qs.get("batchNumber") ?? "";
  // If a specific batch was clicked, only show movements from that batch's creation time onward
  const batchCreatedAt = qs.get("batchCreatedAt") ?? "";
  const batchFromMs = batchCreatedAt ? new Date(batchCreatedAt).getTime() : null;

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!subHubId || !productId) return;
    setLoading(true);
    apiFetch(`/api/inventory/movements?subHubId=${subHubId}&productId=${productId}&limit=500`)
      .then((d) => setMovements(d.movements ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subHubId, productId]);

  // When viewing a specific batch, restrict to movements on/after that batch's creation date
  const batchMovements = batchFromMs
    ? movements.filter((m) => new Date(m.createdAt).getTime() >= batchFromMs)
    : movements;

  const filtered = batchMovements.filter((m) => {
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.orderRef ?? "").toLowerCase().includes(q) ||
      (m.reason ?? "").toLowerCase().includes(q) ||
      (m.notes ?? "").toLowerCase().includes(q)
    );
  });

  const paged = usePaginated(filtered, 25, `${typeFilter}|${search}`);

  // Summary stats — scoped to batchMovements (batch-specific if batchCreatedAt was passed)
  const totalDeducted = batchMovements
    .filter((m) => m.type === "order_deduct")
    .reduce((s, m) => s + Math.abs(m.change), 0);
  const totalRestored = batchMovements
    .filter((m) => m.type === "order_restore")
    .reduce((s, m) => s + Math.abs(m.change), 0);
  const totalAdjusted = batchMovements
    .filter((m) => m.type === "adjustment")
    .reduce((s, m) => s + m.change, 0);

  const latestBalance = batchMovements.length > 0 ? batchMovements[0].balance : null;

  // Group by date for timeline labels
  function getDayLabel(iso: string) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  // Header portal
  const headerSlot = document.getElementById("page-header-slot");
  const headerContent = (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => {
            const backParams = new URLSearchParams({
              subHubId,
              superHubId: qs.get("superHubId") ?? "",
              subHubName,
              superHubName,
              productName,
            });
            navigate(`/inventory/products/${productId}?${backParams.toString()}`);
          }}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1A56DB] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
        <button
          onClick={() => {
            const backParams = new URLSearchParams({
              subHubId,
              superHubId: qs.get("superHubId") ?? "",
              subHubName,
              superHubName,
              productName,
            });
            navigate(`/inventory/products/${productId}?${backParams.toString()}`);
          }}
          className="text-xs text-gray-500 hover:text-[#1A56DB] transition-colors flex-shrink-0 truncate max-w-[120px]"
        >
          {productName}
        </button>
        <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#F05B4E]" />
          <p className="text-sm font-bold text-[#162B4D]">
            Usage History{batchNumber ? ` — ${batchNumber}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <LockedHubBadge label="Super Hub" name={superHubName} />
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        <LockedHubBadge label="Sub Hub" name={subHubName} />
      </div>
    </div>
  );

  return (
    <>
      {headerSlot && createPortal(headerContent, headerSlot)}

      <div className="space-y-5">
        {/* Product + batch context card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-[#162B4D]/5 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-[#162B4D]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#162B4D] text-base">{productName}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 flex-wrap">
                <Layers className="w-3 h-3 flex-shrink-0" />
                {batchNumber ? (
                  <span className="font-semibold text-[#162B4D]">Batch: {batchNumber}</span>
                ) : (
                  <span>All batches</span>
                )}
                <span className="mx-1 text-gray-200">·</span>
                <Building2 className="w-3 h-3 flex-shrink-0" />
                {superHubName} → {subHubName}
              </p>
              {batchCreatedAt && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-2 inline-flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 flex-shrink-0" />
                  Showing movements from{" "}
                  <span className="font-semibold">{fmtDate(batchCreatedAt)}</span> onwards
                  {movements.length > batchMovements.length && (
                    <span className="text-amber-500">
                      · {movements.length - batchMovements.length} earlier movement{movements.length - batchMovements.length !== 1 ? "s" : ""} excluded
                    </span>
                  )}
                </p>
              )}
            </div>
            {latestBalance !== null && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center flex-shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Balance After Last Event</p>
                <p className="text-xl font-bold text-[#162B4D]">{latestBalance}</p>
              </div>
            )}
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Events</p>
              <SlidersHorizontal className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-2xl font-bold text-[#162B4D]">{batchMovements.length}</p>
            {batchCreatedAt && movements.length !== batchMovements.length && (
              <p className="text-[10px] text-gray-400 mt-0.5">{movements.length} total for product</p>
            )}
          </div>
          <div className="bg-red-50 rounded-xl border border-red-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Consumed by Orders</p>
              <TrendingDown className="w-4 h-4 text-red-300" />
            </div>
            <p className="text-2xl font-bold text-red-700">{totalDeducted}</p>
            <p className="text-[10px] text-red-400 mt-0.5">{movements.filter((m) => m.type === "order_deduct").length} order events</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Restored (Cancels)</p>
              <TrendingUp className="w-4 h-4 text-emerald-300" />
            </div>
            <p className="text-2xl font-bold text-emerald-700">{totalRestored}</p>
            <p className="text-[10px] text-emerald-500 mt-0.5">{movements.filter((m) => m.type === "order_restore").length} restore events</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Net Adjustment</p>
              <ArrowUpCircle className="w-4 h-4 text-blue-300" />
            </div>
            <p className={`text-2xl font-bold ${totalAdjusted >= 0 ? "text-blue-700" : "text-orange-600"}`}>
              {totalAdjusted >= 0 ? "+" : ""}{totalAdjusted}
            </p>
            <p className="text-[10px] text-blue-400 mt-0.5">{movements.filter((m) => m.type === "adjustment").length} adjustment events</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <SlidersHorizontal className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ref, reason, or notes..."
              className="pl-9 h-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-10 w-full sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              <SelectItem value="order_deduct">Order Deductions only</SelectItem>
              <SelectItem value="order_restore">Order Restores only</SelectItem>
              <SelectItem value="adjustment">Manual Adjustments only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Main table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#F05B4E]" />
              <p className="text-sm font-bold text-[#162B4D]">Movement Log</p>
              <span className="text-xs text-gray-400">— newest first</span>
            </div>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">When</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Change</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-[#1A56DB] border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-gray-400">Loading usage history...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Activity className="w-8 h-8 text-gray-200" />
                        <p className="text-sm font-semibold text-gray-500">No movements found</p>
                        <p className="text-xs text-gray-400">
                          {movements.length === 0
                            ? "No stock movements have been recorded for this product yet."
                            : "No movements match your current filters."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (() => {
                  const rows: React.ReactNode[] = [];
                  let lastDay = "";
                  for (const m of paged.pageItems) {
                    const day = getDayLabel(m.createdAt);
                    if (day !== lastDay) {
                      lastDay = day;
                      rows.push(
                        <tr key={`day-${day}-${m._id}`} className="bg-gray-50/60">
                          <td colSpan={5} className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{day}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const meta = TYPE_META[m.type] ?? TYPE_META.adjustment;
                    const reasonMeta = getSubReasonMeta(m);
                    const isPositive = m.change >= 0;
                    rows.push(
                      <tr key={m._id} className="hover:bg-gray-50/40">
                        {/* When */}
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold w-fit border ${meta.tone}`}>
                              {meta.icon}{meta.short}
                            </span>
                            {m.subReason === "items_changed" && (
                              <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Due to Order Edit</span>
                            )}
                          </div>
                        </td>

                        {/* Order */}
                        <td className="px-4 py-3 min-w-[220px]">
                          {m.orderRef ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-[#364F9F] bg-blue-50 px-2 py-0.5 rounded-md">
                                  {m.invoiceId ?? m.orderRef}
                                </span>
                                {reasonMeta && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${reasonMeta.tone}`}>
                                    {reasonMeta.label}
                                  </span>
                                )}
                              </div>
                              {m.customerName && (
                                <p className="text-xs text-gray-500">{m.customerName}</p>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-gray-500">Manual Adjustment</span>
                              {(m.reason || m.notes) && (
                                <p className="text-xs font-semibold text-[#162B4D]">{m.reason || m.notes}</p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Change */}
                        <td className={`px-4 py-3 text-right font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                          <div className="flex items-center justify-end gap-1">
                            {isPositive
                              ? <ArrowUpCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              : <ArrowDownCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            }
                            {isPositive ? "+" : ""}{m.change}
                          </div>
                        </td>

                        {/* Balance */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-sm text-[#162B4D]">{m.balance}</span>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={paged.page}
            pages={paged.pages}
            total={paged.total}
            onChange={paged.setPage}
            label="events"
          />
        </div>
      </div>
    </>
  );
}
