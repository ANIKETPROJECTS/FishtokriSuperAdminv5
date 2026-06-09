import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Package, Building2, Lock, ChevronRight,
  Calendar, Clock, Hash, Layers, CheckCircle2, AlertTriangle, XCircle,
  Activity, ShoppingCart, RotateCcw, Wrench,
} from "lucide-react";

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

type Batch = {
  id: string;
  batchNumber: string;
  quantity: number;
  shelfLifeDays: number | null;
  receivedDate: string | null;
  expiryDate: string | null;
  notes: string;
  createdAt?: string | null;
};

type Product = {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  price: number;
  quantity: number;
  status: string;
  imageUrl: string;
  batches?: Batch[];
};

type Movement = {
  _id: string;
  type: "order_deduct" | "order_restore" | "adjustment";
  change: number;
  balance: number;
  createdAt: string;
};

type BatchTab = "live" | "expired" | "completed";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (!iso.includes("T")) return datePart;
  const timePart = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${datePart} · ${timePart}`;
}
function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function getBatchStatus(b: Batch): "live" | "expired" | "completed" {
  if (b.quantity <= 0) return "completed";
  if (!b.expiryDate) return "live";
  const dl = daysUntil(b.expiryDate);
  if (dl !== null && dl < 0) return "expired";
  return "live";
}

function LockedHubBadge({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hidden sm:inline">{label}</span>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 min-w-0">
        <Building2 className="w-3.5 h-3.5 text-[#364F9F] flex-shrink-0" />
        <span className="text-sm font-semibold text-[#162B4D] truncate">{name}</span>
        <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 ml-0.5" />
      </div>
    </div>
  );
}

export default function InventoryProductDetail() {
  const params = useParams<{ productId: string }>();
  const [, navigate] = useLocation();
  const productId = params.productId;

  const qs = new URLSearchParams(window.location.search);
  const subHubId = qs.get("subHubId") ?? "";
  const superHubId = qs.get("superHubId") ?? "";
  const subHubName = qs.get("subHubName") ?? "Sub Hub";
  const superHubName = qs.get("superHubName") ?? "Super Hub";
  const productName = qs.get("productName") ?? "";

  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [activeTab, setActiveTab] = useState<BatchTab>("live");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!subHubId || !productId) return;
    setLoadingProduct(true);
    apiFetch(`/api/inventory/products?subHubId=${subHubId}`)
      .then((d) => {
        const found = (d.products ?? []).find((p: Product) => p.id === productId);
        if (found) setProduct(found);
        else setError("Product not found.");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProduct(false));
  }, [subHubId, productId]);

  useEffect(() => {
    if (!subHubId || !productId) return;
    setLoadingMovements(true);
    apiFetch(`/api/inventory/movements?subHubId=${subHubId}&productId=${productId}&limit=200`)
      .then((d) => setMovements(d.movements ?? []))
      .catch(() => {})
      .finally(() => setLoadingMovements(false));
  }, [subHubId, productId]);

  const allBatches: Batch[] = product?.batches ?? [];
  const liveBatches = useMemo(() => allBatches.filter((b) => getBatchStatus(b) === "live"), [allBatches]);
  const expiredBatches = useMemo(() => allBatches.filter((b) => getBatchStatus(b) === "expired"), [allBatches]);
  const completedBatches = useMemo(() => allBatches.filter((b) => getBatchStatus(b) === "completed"), [allBatches]);
  const tabBatches = activeTab === "live" ? liveBatches : activeTab === "expired" ? expiredBatches : completedBatches;

  const totalLiveQty = liveBatches.reduce((s, b) => s + b.quantity, 0);

  function goToUsage(b?: Batch) {
    const usageParams = new URLSearchParams({
      subHubId,
      superHubId,
      subHubName,
      superHubName,
      productName: product?.name ?? productName,
      ...(b
        ? {
            batchId: b.id,
            batchNumber: b.batchNumber || "",
            // Pass the batch creation time so usage page can filter to batch-era only
            batchCreatedAt: b.createdAt ?? b.receivedDate ?? "",
          }
        : {}),
    });
    navigate(`/inventory/products/${productId}/usage?${usageParams.toString()}`);
  }

  // Header portal
  const headerSlot = document.getElementById("page-header-slot");
  const headerContent = (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => navigate("/inventory/products")}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1A56DB] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Inventory</span>
        </button>
        <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
        <p className="text-sm font-bold text-[#162B4D] truncate">
          {product?.name ?? productName ?? "Product Detail"}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <LockedHubBadge label="Super Hub" name={superHubName} />
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        <LockedHubBadge label="Sub Hub" name={subHubName} />
      </div>
    </div>
  );

  if (loadingProduct) {
    return (
      <>
        {headerSlot && createPortal(headerContent, headerSlot)}
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#1A56DB] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading product details...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        {headerSlot && createPortal(headerContent, headerSlot)}
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <XCircle className="w-10 h-10 text-red-300" />
          <p className="text-sm font-semibold text-gray-600">{error || "Product not found"}</p>
          <button onClick={() => navigate("/inventory/products")} className="text-sm text-[#1A56DB] hover:underline">
            ← Back to Inventory
          </button>
        </div>
      </>
    );
  }

  const stockTone =
    product.quantity <= 0 ? "bg-red-50 text-red-700 border-red-200"
    : product.quantity < 5 ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";

  return (
    <>
      {headerSlot && createPortal(headerContent, headerSlot)}

      <div className="space-y-5">
        {/* Product Header Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start gap-5">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-20 h-20 rounded-xl object-cover border border-gray-100 flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Package className="w-8 h-8 text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-[#162B4D]">{product.name}</h1>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {product.category}{product.subCategory && ` / ${product.subCategory}`}
                    {product.unit && <span className="ml-2 text-gray-300">· {product.unit}</span>}
                  </p>
                </div>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${stockTone}`}>
                  {product.status === "available" ? "Available" : product.status || "—"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Price</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">₹{product.price}</p>
                </div>
                <div className="rounded-xl p-3 border"
                  style={{
                    backgroundColor: product.quantity <= 0 ? "#fef2f2" : product.quantity < 5 ? "#fffbeb" : "#f0fdf4",
                    borderColor: product.quantity <= 0 ? "#fecaca" : product.quantity < 5 ? "#fde68a" : "#bbf7d0",
                  }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Live Stock</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">
                    {totalLiveQty} <span className="text-xs font-normal text-gray-400">{product.unit}</span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stock Value</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">₹{(product.price * totalLiveQty).toFixed(0)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Batches</p>
                  <p className="text-lg font-bold text-[#162B4D] mt-0.5">{allBatches.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage History Quick-link banner */}
        <button
          onClick={() => goToUsage()}
          className="w-full bg-gradient-to-r from-[#F05B4E]/5 to-[#364F9F]/5 border border-[#364F9F]/15 hover:border-[#364F9F]/30 rounded-2xl p-4 flex items-center justify-between group transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#162B4D]/5 flex items-center justify-center flex-shrink-0">
              <Activity className="w-4.5 h-4.5 text-[#162B4D]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-[#162B4D]">View Full Usage History</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {loadingMovements ? "Loading..." : `${movements.length} total movements — order deductions, restores, and manual adjustments`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {!loadingMovements && (
              <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1 text-red-500">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  {movements.filter((m) => m.type === "order_deduct").length}
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {movements.filter((m) => m.type === "order_restore").length}
                </span>
                <span className="flex items-center gap-1 text-blue-600">
                  <Wrench className="w-3.5 h-3.5" />
                  {movements.filter((m) => m.type === "adjustment").length}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 text-[#1A56DB] text-sm font-semibold group-hover:gap-2 transition-all">
              Open Usage Log
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </button>

        {/* Batches Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tab header */}
          <div className="border-b border-gray-100 px-6 pt-4">
            <div className="flex items-center gap-1">
              <TabButton
                active={activeTab === "live"}
                onClick={() => setActiveTab("live")}
                count={liveBatches.length}
                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                label="Live Batches"
                activeColor="text-emerald-700 border-emerald-500"
                countColor="bg-emerald-100 text-emerald-700"
              />
              <TabButton
                active={activeTab === "expired"}
                onClick={() => setActiveTab("expired")}
                count={expiredBatches.length}
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                label="Expired Batches"
                activeColor="text-red-700 border-red-500"
                countColor="bg-red-100 text-red-700"
              />
              <TabButton
                active={activeTab === "completed"}
                onClick={() => setActiveTab("completed")}
                count={completedBatches.length}
                icon={<XCircle className="w-3.5 h-3.5" />}
                label="Completed Batches"
                activeColor="text-gray-700 border-gray-500"
                countColor="bg-gray-100 text-gray-600"
              />
            </div>
          </div>

          {/* Tab description */}
          <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100">
            <p className="text-xs text-gray-400">
              {activeTab === "live" && "Batches with remaining stock and valid expiry. These are available for orders."}
              {activeTab === "expired" && "Batches that have passed their expiry date and still have remaining stock."}
              {activeTab === "completed" && "Batches fully consumed — all stock has been used or adjusted to zero."}
            </p>
          </div>

          {/* Batch table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch #</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Shelf Life</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tabBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      No {activeTab} batches found
                    </td>
                  </tr>
                ) : tabBatches.map((b) => {
                  const status = getBatchStatus(b);
                  const dl = daysUntil(b.expiryDate);

                  const statusEl =
                    status === "live"
                      ? dl !== null && dl <= 7
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" />
                            Expiring {dl === 0 ? "today" : `in ${dl}d`}
                          </span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Live
                          </span>
                      : status === "expired"
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" />
                          Expired {dl !== null ? `${Math.abs(dl)}d ago` : ""}
                        </span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                          <XCircle className="w-3 h-3" />
                          Consumed
                        </span>;

                  return (
                    <tr key={b.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-[#364F9F]/10 flex items-center justify-center flex-shrink-0">
                            <Layers className="w-3.5 h-3.5 text-[#364F9F]" />
                          </div>
                          <div>
                            <p className="font-semibold text-[#162B4D] text-sm">{b.batchNumber || "Auto-assigned"}</p>
                            {b.createdAt && <p className="text-[10px] text-gray-400">Added {fmtDate(b.createdAt)}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-sm ${b.quantity > 0 ? "text-[#162B4D]" : "text-gray-400"}`}>
                          {b.quantity}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{product.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-300" />
                          {fmtDate(b.receivedDate)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-300" />
                          <span className={
                            dl === null ? "text-gray-400"
                            : dl < 0 ? "text-red-600 font-semibold"
                            : dl <= 7 ? "text-amber-600 font-semibold"
                            : "text-gray-600"
                          }>
                            {fmtDateTime(b.expiryDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {b.shelfLifeDays != null ? (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3 text-gray-300" />
                            {b.shelfLifeDays}d
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">{statusEl}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px] truncate">
                        {b.notes || <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => goToUsage(b)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#162B4D]/5 text-[#162B4D] hover:bg-[#1A56DB] hover:text-white transition-all border border-transparent hover:border-[#1A56DB]"
                        >
                          <Activity className="w-3 h-3" />
                          Usage
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Movement summary stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total Movements" value={movements.length} icon={<Activity className="w-4 h-4 text-gray-400" />} />
          <SummaryCard label="Order Deductions" value={movements.filter((m) => m.type === "order_deduct").length} icon={<ShoppingCart className="w-4 h-4 text-red-400" />} />
          <SummaryCard label="Order Restores" value={movements.filter((m) => m.type === "order_restore").length} icon={<RotateCcw className="w-4 h-4 text-emerald-400" />} />
          <SummaryCard label="Manual Adjustments" value={movements.filter((m) => m.type === "adjustment").length} icon={<Wrench className="w-4 h-4 text-blue-400" />} />
        </div>
      </div>
    </>
  );
}

function TabButton({
  active, onClick, count, icon, label, activeColor, countColor,
}: {
  active: boolean; onClick: () => void; count: number; icon: React.ReactNode;
  label: string; activeColor: string; countColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px
        ${active ? `${activeColor} bg-transparent` : "text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-200"}`}
    >
      {icon}
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${active ? countColor : "bg-gray-100 text-gray-500"}`}>
        {count}
      </span>
    </button>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
        {icon}
      </div>
      <p className="text-xl font-bold text-[#162B4D] mt-1">{value}</p>
    </div>
  );
}
