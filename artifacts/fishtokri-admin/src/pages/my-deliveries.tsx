import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Truck, Search,
  X, Clock, CheckCircle2, XCircle, User, RefreshCw,
  ShoppingBag, History, CalendarDays, CircleDollarSign, Eye,
  Mail, Home, Hash, Tag, Wallet, Receipt, FileText, Store,
  Banknote, Smartphone, CreditCard, Landmark, Plus, Trash,
  MapPin, Phone,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar } from "@/components/pagination-bar";
import { usePaginated } from "@/hooks/use-paginated";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function getAdminData() {
  try { return JSON.parse(localStorage.getItem("fishtokri_admin") || "null"); } catch { return null; }
}
function getToken() { return localStorage.getItem("fishtokri_token") || ""; }
function getBase() { return import.meta.env.BASE_URL?.replace(/\/$/, "") || ""; }

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${getBase()}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: res.statusText })); throw new Error(e.message ?? "Request failed"); }
  return res.json();
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any; next?: string[] }> = {
  pending:          { label: "Pending",          color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",   icon: Clock,         next: ["confirmed", "out_for_delivery", "cancelled"] },
  confirmed:        { label: "Confirmed",        color: "text-blue-600",    bg: "bg-blue-50 border-blue-200",     icon: CheckCircle2,  next: ["out_for_delivery", "cancelled"] },
  out_for_delivery: { label: "Out for Delivery", color: "text-indigo-600",  bg: "bg-indigo-50 border-indigo-200", icon: Truck,         next: ["delivered", "cancelled"] },
  delivered:        { label: "Delivered",        color: "text-green-600",   bg: "bg-green-50 border-green-200",   icon: CheckCircle2,  next: [] },
  cancelled:        { label: "Cancelled",        color: "text-red-600",     bg: "bg-red-50 border-red-200",       icon: XCircle,       next: [] },
  takeaway:         { label: "Takeaway",         color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: Store,       next: ["delivered", "cancelled"] },
};

const ACTIVE_STATUSES  = ["pending", "confirmed", "out_for_delivery"];
const HISTORY_STATUSES = ["delivered", "cancelled"];

const PAYMENT_MODES = [
  { value: "cash", label: "Cash", Icon: Banknote },
  { value: "upi", label: "UPI", Icon: Smartphone },
  { value: "card", label: "Card", Icon: CreditCard },
  { value: "bank_transfer", label: "Bank Transfer", Icon: Landmark },
  { value: "wallet", label: "Wallet", Icon: Wallet },
  { value: "other", label: "Other", Icon: Tag },
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "text-gray-600", bg: "bg-gray-50 border-gray-200", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

const SOLID_STATUS: Record<string, { label: string; bg: string }> = {
  pending:          { label: "Pending",          bg: "bg-amber-500" },
  confirmed:        { label: "Confirmed",        bg: "bg-[#1A56DB]" },
  out_for_delivery: { label: "Out for Delivery", bg: "bg-indigo-600" },
  delivered:        { label: "Delivered",        bg: "bg-green-600" },
  cancelled:        { label: "Cancelled",        bg: "bg-red-500" },
  takeaway:         { label: "Takeaway",         bg: "bg-emerald-600" },
};

function SolidStatusBadge({ status }: { status: string }) {
  const cfg = SOLID_STATUS[status] ?? { label: status, bg: "bg-gray-500" };
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-lg ${cfg.bg} text-white tracking-wide`}>
      {cfg.label}
    </span>
  );
}

function formatDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatDay(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatRupees(n: number) { return `₹${Number(n || 0).toLocaleString("en-IN")}`; }

function itemsSubtotal(o: any) {
  return (o?.items ?? []).reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
}

function orderTotal(o: any) {
  if (o?.total !== undefined && o?.total !== null && !Number.isNaN(Number(o.total))) {
    return Number(o.total);
  }
  const sub = itemsSubtotal(o);
  const disc = Number(o?.discount || 0);
  const slot = Number(o?.slotCharge || 0);
  return Math.max(0, sub - disc + slot);
}

function buildAddressLines(o: any): string[] {
  const d = o?.deliveryAddressDetail || {};
  const lines: string[] = [];
  const part1 = [d.houseNo, d.building].filter(Boolean).join(", ");
  if (part1) lines.push(part1);
  const part2 = [d.street, d.area].filter(Boolean).join(", ");
  if (part2) lines.push(part2);
  if (d.landmark) lines.push(`Landmark: ${d.landmark}`);
  const part3 = [d.city, d.state, d.pincode].filter(Boolean).join(", ");
  if (part3) lines.push(part3);
  if (lines.length === 0 && o?.address) lines.push(o.address);
  if (lines.length === 0 && o?.deliveryArea) lines.push(o.deliveryArea);
  return lines;
}

// ─── ORDER DETAIL DIALOG (full-screen) ────────────────────────────────────────

function OrderDetailDialog({
  order,
  onClose,
  onUpdateStatus,
}: {
  order: any;
  onClose: () => void;
  onUpdateStatus?: (o: any) => void;
}) {
  if (!order) return null;
  const sub = itemsSubtotal(order);
  const discount = Number(order?.discount || 0);
  const slot = Number(order?.slotCharge || 0);
  const total = orderTotal(order);
  const paid = Number(order.paidAmount || 0);
  const due = Math.max(0, total - paid);
  const addressLines = buildAddressLines(order);
  const d = order?.deliveryAddressDetail || {};
  const recipientName = d.name || d.contactName || "";
  const recipientPhone = d.phone || d.contactPhone || "";
  const couponCode =
    order?.couponCode ||
    (Array.isArray(order?.coupons) && order.coupons[0]?.code) ||
    "";
  const isTakeaway = order?.deliveryType === "takeaway" || order?.status === "takeaway";
  const nextStatuses = (STATUS_CONFIG[order.status]?.next ?? []).filter((s) => STATUS_CONFIG[s]);
  const displayId = order.orderId || ("#" + String(order._id).slice(-6).toUpperCase());

  const paymentEntries: any[] = Array.isArray(order.payments) && order.payments.length > 0
    ? order.payments
    : order.paymentMode
      ? [{ mode: order.paymentMode, amount: paid, reference: "" }]
      : [];

  const paymentStatusColor = order.paymentStatus === "paid"
    ? "bg-green-500"
    : order.paymentStatus === "partial"
      ? "bg-amber-500"
      : order.paymentStatus === "unpaid"
        ? "bg-red-500"
        : "bg-black/20";

  const MODE_LABELS: Record<string, string> = {
    cash: "Cash", upi: "UPI", card: "Card",
    bank_transfer: "Bank Transfer", wallet: "Wallet", other: "Other",
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-white flex flex-col" style={{ fontFamily: "Poppins, sans-serif" }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-black/8 flex-shrink-0 bg-white">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-black/5 hover:bg-black/10 flex-shrink-0"
        >
          <X className="w-5 h-5 text-black" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-black leading-tight">Order Details</p>
          <p className="text-[11px] font-mono font-semibold text-black/50 leading-tight">{displayId}</p>
        </div>
        <SolidStatusBadge status={order.status} />
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto bg-[#F7F8FA]">
        <div className="p-4 space-y-3 pb-8">

          {/* ── Date + Takeaway ── */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-black">{formatDate(order.createdAt)}</span>
            {isTakeaway && order.status !== "takeaway" && (
              <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-600 text-white">
                Takeaway
              </span>
            )}
          </div>

          {/* ── Customer ── */}
          <div className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
            <p className="text-[10px] font-black text-black uppercase tracking-widest">Customer</p>

            <div className="flex items-center gap-3">
              <img src="/icon-user.png" alt="Customer" className="w-5 h-5 flex-shrink-0" />
              <span className="text-base font-bold text-black">{order.customerName || "—"}</span>
            </div>

            {order.phone && (
              <a href={`tel:${order.phone}`} className="flex items-center gap-3">
                <img src="/icon-phone.png" alt="Phone" className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-semibold text-black">{order.phone}</span>
              </a>
            )}

            {order.email && (
              <div className="flex items-center gap-3">
                <img src="/icon-email.png" alt="Email" className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium text-black">{order.email}</span>
              </div>
            )}
          </div>

          {/* ── Delivery Address / Pickup ── */}
          {isTakeaway ? (
            <div className="bg-emerald-50 rounded-2xl p-4 space-y-2 border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Pickup from Hub</p>
              <p className="text-sm font-bold text-black">{order.subHubName || order.pickupLocation || "—"}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
              <p className="text-[10px] font-black text-black uppercase tracking-widest">
                Delivery Address{d.label ? ` · ${d.label}` : ""}
              </p>

              {recipientName && (
                <div className="flex items-center gap-3">
                  <img src="/icon-user.png" alt="Recipient" className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-semibold text-black">{recipientName}</span>
                </div>
              )}

              {recipientPhone && (
                <a href={`tel:${recipientPhone}`} className="flex items-center gap-3">
                  <img src="/icon-phone.png" alt="Phone" className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-semibold text-black">{recipientPhone}</span>
                </a>
              )}

              {addressLines.length > 0 ? (
                <div className="flex items-start gap-3">
                  <img src="/icon-pin.png" alt="Location" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {addressLines.map((ln, i) => (
                      <p key={i} className="text-sm font-medium text-black leading-snug">{ln}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium text-black italic">No delivery address on file</p>
              )}

              {d.instructions && (
                <div className="border-l-4 border-amber-400 bg-amber-50 pl-3 py-2 rounded-r-lg mt-1">
                  <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-0.5">Delivery Note</p>
                  <p className="text-sm font-medium text-black">{d.instructions}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Schedule ── */}
          {(order.timeslotLabel || order.scheduledDate || order.deliveryDate) && (
            <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm">
              <img src="/icon-clock.png" alt="Time" className="w-5 h-5 flex-shrink-0" />
              <div>
                {(order.scheduledDate || order.deliveryDate) && (
                  <p className="text-sm font-bold text-black">{formatDay(order.scheduledDate || order.deliveryDate)}</p>
                )}
                {order.timeslotLabel && (
                  <p className="text-sm font-semibold text-black">{order.timeslotLabel}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Items ── */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-black text-black uppercase tracking-widest">
                Items ({(order.items ?? []).length})
              </p>
            </div>
            {(order.items ?? []).map((i: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between px-4 py-3 border-t border-black/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-black">{i.name}</p>
                  <p className="text-xs font-medium text-black mt-0.5">
                    {formatRupees(Number(i.price || 0))} × {i.quantity}{i.unit ? ` ${i.unit}` : ""}
                  </p>
                </div>
                <span className="font-bold text-black text-sm ml-4 flex-shrink-0">
                  {formatRupees(Number(i.price || 0) * Number(i.quantity || 1))}
                </span>
              </div>
            ))}
            {(!order.items || order.items.length === 0) && (
              <p className="text-sm font-medium text-black text-center py-6">No items</p>
            )}
          </div>

          {/* ── Payment ── */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <p className="text-[10px] font-black text-black uppercase tracking-widest">Payment</p>
              {order.paymentStatus && (
                <span className={`text-[11px] font-black text-white px-2.5 py-1 rounded-lg uppercase tracking-wide ${paymentStatusColor}`}>
                  {order.paymentStatus}
                </span>
              )}
            </div>

            {/* Subtotal */}
            <div className="flex justify-between items-center px-4 py-3 border-t border-black/5">
              <span className="text-sm font-medium text-black">Subtotal</span>
              <span className="text-sm font-semibold text-black">{formatRupees(sub)}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between items-center px-4 py-3 border-t border-black/5">
                <span className="text-sm font-semibold text-emerald-600">
                  Discount{couponCode ? ` · ${couponCode}` : ""}
                </span>
                <span className="text-sm font-bold text-emerald-600">−{formatRupees(discount)}</span>
              </div>
            )}

            {slot > 0 && (
              <div className="flex justify-between items-center px-4 py-3 border-t border-black/5">
                <span className="text-sm font-medium text-black">Slot Charge</span>
                <span className="text-sm font-semibold text-black">{formatRupees(slot)}</span>
              </div>
            )}

            {/* Grand total */}
            <div className="flex justify-between items-center px-4 py-4 border-t border-black/8 bg-black/[0.02]">
              <span className="text-base font-bold text-black">Grand Total</span>
              <span className="text-base font-bold text-black">{formatRupees(total)}</span>
            </div>

            {/* Paid / Due */}
            <div className="flex justify-between items-center px-4 py-3 border-t border-black/5">
              <span className="text-sm font-medium text-black">Paid</span>
              <span className="text-sm font-bold text-green-600">{formatRupees(paid)}</span>
            </div>
            {due > 0 && (
              <div className="flex justify-between items-center px-4 py-3 border-t border-black/5">
                <span className="text-sm font-medium text-black">Due</span>
                <span className="text-sm font-bold text-amber-600">{formatRupees(due)}</span>
              </div>
            )}

            {/* Payment mode(s) from backend */}
            {paymentEntries.length > 0 && (
              <div className="border-t border-black/8 mt-1">
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[10px] font-black text-black uppercase tracking-widest">Payment Mode</p>
                </div>
                {paymentEntries.map((p: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 border-t border-black/5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#1A56DB]/10 text-[#1A56DB] text-xs font-black">
                        {(MODE_LABELS[p.mode] || p.mode || "—").slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-black">{MODE_LABELS[p.mode] || p.mode}</p>
                        {p.reference && <p className="text-[11px] font-medium text-black">{p.reference}</p>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-black">{formatRupees(Number(p.amount) || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          {order.notes && (
            <div className="border-l-4 border-amber-400 bg-amber-50 pl-4 py-3 pr-4 rounded-r-2xl shadow-sm">
              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Order Notes</p>
              <p className="text-sm font-medium text-black">{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky bottom action ── */}
      {nextStatuses.length > 0 && onUpdateStatus && (
        <div className="px-4 py-4 border-t border-black/8 bg-white flex-shrink-0">
          <button
            onClick={() => { onUpdateStatus(order); onClose(); }}
            className="w-full h-12 rounded-2xl bg-[#1A56DB] hover:bg-[#1447B4] text-white text-base font-bold transition-colors active:scale-[0.98]"
          >
            Update Status
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

// ─── ORDERS LIST (shared by both tabs) ────────────────────────────────────────

function OrdersList({ mode, refreshKey, silentRefreshKey, onCountChange }: { mode: "active" | "history"; refreshKey: number; silentRefreshKey?: number; onCountChange?: (n: number) => void }) {
  const { toast } = useToast();
  const admin = getAdminData();

  const allowedStatuses = mode === "active" ? ACTIVE_STATUSES : HISTORY_STATUSES;

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [deliverPayOpen, setDeliverPayOpen] = useState(false);
  const [pendingDeliverOrder, setPendingDeliverOrder] = useState<any>(null);
  const [deliverPayStatus, setDeliverPayStatus] = useState<"unpaid" | "partial" | "paid">("paid");
  const [deliverPayEntries, setDeliverPayEntries] = useState<{ mode: string; amount: string; reference: string }[]>([]);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  const loadOrders = useCallback(async (silent = false) => {
    if (!admin?.id) return;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ assignedTo: admin.id, limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      else params.set("status", allowedStatuses.join(","));
      const data = await apiFetch(`/api/orders?${params}`);
      setOrders(data.orders ?? []);
    } catch { } finally { if (!silent) setLoading(false); }
  }, [admin?.id, statusFilter, allowedStatuses.join(",")]);

  useEffect(() => { loadOrders(false); }, [loadOrders, refreshKey]);
  useEffect(() => { if (silentRefreshKey) loadOrders(true); }, [silentRefreshKey]);

  const filtered = useMemo(() => orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.customerName?.toLowerCase().includes(q) ||
      o.phone?.includes(q) ||
      o.deliveryArea?.toLowerCase().includes(q) ||
      String(o._id).toLowerCase().includes(q.replace(/^#/, "")) ||
      (o.orderId || "").toLowerCase().includes(q.replace(/^#/, "")) ||
      (o.items ?? []).some((i: any) => i.name?.toLowerCase().includes(q));
  }), [orders, search]);

  useEffect(() => { onCountChange?.(filtered.length); }, [filtered.length, onCountChange]);

  const pagedOrders = usePaginated(filtered, 20, `${mode}|${search}|${statusFilter}`);

  const handleUpdateStatus = async () => {
    if (!selectedOrder || !editStatus) return;

    // When marking as delivered, prompt for payment collection unless already fully paid.
    if (editStatus === "delivered" && selectedOrder.paymentStatus !== "paid") {
      const total = orderTotal(selectedOrder);
      const alreadyPaid = Number(selectedOrder.paidAmount) || 0;
      const due = Math.max(0, total - alreadyPaid);
      setDeliverPayStatus("paid");
      setDeliverPayEntries([
        { mode: "cash", amount: String(due > 0 ? due : total), reference: "" },
      ]);
      setPendingDeliverOrder(selectedOrder);
      setSelectedOrder(null);
      setDeliverPayOpen(true);
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/orders/${selectedOrder._id}`, { method: "PUT", body: JSON.stringify({ status: editStatus }) });
      toast({ title: "Status updated successfully" });
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deliverPayPaidTotal = useMemo(
    () => deliverPayEntries.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [deliverPayEntries]
  );

  const handleDeliverWithPayment = async () => {
    const orderForPayment = pendingDeliverOrder || selectedOrder;
    if (!orderForPayment) return;
    const orderTotalAmount = orderTotal(orderForPayment);
    const existingPaid = Number(orderForPayment.paidAmount) || 0;
    const existingPayments: any[] = Array.isArray(orderForPayment.payments) ? orderForPayment.payments : [];

    if (deliverPayStatus !== "unpaid") {
      const validEntries = deliverPayEntries.filter((p) => p.mode && Number(p.amount) > 0);
      if (validEntries.length === 0) {
        toast({ title: "Add payment details", description: "Enter at least one payment with mode and amount.", variant: "destructive" });
        return;
      }
    }

    const totalCollected = existingPaid + (deliverPayStatus === "unpaid" ? 0 : deliverPayPaidTotal);
    const overpayment = Math.max(0, totalCollected - orderTotalAmount);
    const recordedPaidTotal = Math.min(totalCollected, orderTotalAmount);

    if (deliverPayStatus === "paid" && totalCollected < orderTotalAmount) {
      toast({ title: "Payment mismatch", description: `Total collected (${formatRupees(totalCollected)}) is less than order total (${formatRupees(orderTotalAmount)}).`, variant: "destructive" });
      return;
    }
    if (deliverPayStatus === "partial" && (totalCollected <= existingPaid || totalCollected >= orderTotalAmount)) {
      toast({ title: "Invalid partial payment", description: `Paid amount must be between ₹0 and ${formatRupees(orderTotalAmount)}.`, variant: "destructive" });
      return;
    }

    const newEntries = deliverPayStatus === "unpaid"
      ? []
      : deliverPayEntries.filter((p) => p.mode && Number(p.amount) > 0).map((p) => ({
          mode: p.mode,
          amount: Number(p.amount) || 0,
          reference: p.reference?.trim() || "",
        }));
    const mergedPayments = [...existingPayments, ...newEntries];

    setSaving(true);
    try {
      const payload: any = {
        status: "delivered",
        paymentStatus: deliverPayStatus,
        paidAmount: recordedPaidTotal,
        paymentMode: mergedPayments[0]?.mode,
        payments: mergedPayments,
      };
      const orderForPayment = pendingDeliverOrder || selectedOrder;
      await apiFetch(`/api/orders/${orderForPayment._id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: "Marked as delivered", description: deliverPayStatus === "paid" ? "Payment recorded." : deliverPayStatus === "partial" ? "Partial payment recorded." : "No payment recorded." });
      setDeliverPayOpen(false);
      setPendingDeliverOrder(null);
      setSelectedOrder(null);
      loadOrders();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Summary stats for the active tab
  const summary = useMemo(() => {
    const totalRevenue = filtered.reduce((s, o) => s + Number(o.paidAmount || 0), 0);
    const totalValue   = filtered.reduce((s, o) => s + orderTotal(o), 0);
    return { count: filtered.length, totalRevenue, totalValue };
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* Toolbar — search + filter icon */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, phone, area, order #"
            className="pl-10 h-10 text-sm rounded-xl border-gray-200 text-black placeholder:text-black/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter icon button with dropdown */}
        <div className="relative flex-shrink-0" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
              statusFilter ? "border-black bg-black" : "border-gray-200 bg-white"
            }`}
            title="Filter by status"
          >
            <img
              src="/icon-filter.png"
              alt="Filter"
              className="w-4 h-4"
              style={{ filter: statusFilter ? "invert(1)" : "none" }}
            />
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-12 z-50 bg-white border border-gray-100 rounded-2xl shadow-xl min-w-[180px] overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-bold text-black uppercase tracking-wider">Filter by Status</p>
              </div>
              {[{ v: "", label: `All ${mode === "active" ? "active" : "history"}` }, ...allowedStatuses.filter((s) => STATUS_CONFIG[s]).map((s) => ({ v: s, label: STATUS_CONFIG[s].label }))].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => { setStatusFilter(opt.v); setFilterOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                    (statusFilter || "") === opt.v
                      ? "bg-black text-white"
                      : "text-black hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <Skeleton className="h-4 w-2/3 rounded-lg" />
              <Skeleton className="h-3 w-1/2 rounded-lg" />
              <Skeleton className="h-3 w-3/4 rounded-lg" />
              <Skeleton className="h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center px-6">
          {mode === "active"
            ? <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-20" />
            : <History className="w-12 h-12 mx-auto mb-4 opacity-20" />}
          <p className="text-black font-semibold text-base">
            {mode === "active" ? "No active orders" : "No past orders yet"}
          </p>
          <p className="text-sm text-black/50 mt-1 font-normal">
            {mode === "active" ? "Orders assigned to you will appear here" : "Completed and cancelled orders will appear here"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedOrders.pageItems.map((o) => {
            const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
            const total = orderTotal(o);
            const paid = Number(o.paidAmount || 0);
            const due = Math.max(0, total - paid);
            const displayId = o.orderId || ("#" + String(o._id).slice(-6).toUpperCase());

            const borderColorMap: Record<string, string> = {
              pending:          "border-l-amber-400",
              confirmed:        "border-l-blue-500",
              out_for_delivery: "border-l-indigo-500",
              delivered:        "border-l-green-500",
              cancelled:        "border-l-red-400",
              takeaway:         "border-l-emerald-500",
            };
            const leftBorder = borderColorMap[o.status] ?? "border-l-gray-300";

            const addressText = (() => {
              const parts: string[] = [];
              const d = o.deliveryAddressDetail || {};
              const part1 = [d.houseNo, d.building].filter(Boolean).join(", ");
              if (part1) parts.push(part1);
              const part2 = [d.street, d.area].filter(Boolean).join(", ");
              if (part2) parts.push(part2);
              const part3 = [d.city, d.state, d.pincode].filter(Boolean).join(", ");
              if (part3) parts.push(part3);
              if (parts.length === 0 && o.address) parts.push(o.address);
              if (parts.length === 0 && o.deliveryArea) parts.push(o.deliveryArea);
              return parts.join(" · ");
            })();

            return (
              <div
                key={String(o._id)}
                className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${leftBorder} shadow-sm overflow-hidden`}
              >
                <div className="p-4 space-y-3">
                  {/* Row 1: Order ID first, then status badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-black/50">{displayId}</span>
                    <SolidStatusBadge status={o.status} />
                  </div>

                  {/* Row 2: Customer name + date (left) | amount (right) */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-black text-base leading-tight">{o.customerName}</p>
                      <p className="text-xs font-medium text-black/50 mt-0.5">{formatDate(o.createdAt)}</p>
                    </div>
                    <p className="font-bold text-black text-lg leading-tight flex-shrink-0">{formatRupees(total)}</p>
                  </div>

                  {/* Info rows with custom icons */}
                  <div className="space-y-2">
                    {o.phone && (
                      <a href={`tel:${o.phone}`} className="flex items-center gap-2.5">
                        <img src="/icon-phone.png" alt="Phone" className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-semibold text-black">{o.phone}</span>
                      </a>
                    )}
                    {addressText && (
                      <div className="flex items-start gap-2.5">
                        <img src="/icon-pin.png" alt="Location" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="text-sm font-medium text-black leading-snug">{addressText}</span>
                      </div>
                    )}
                    {o.timeslotLabel && (
                      <div className="flex items-center gap-2.5">
                        <img src="/icon-clock.png" alt="Time" className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-semibold text-black">{o.timeslotLabel}</span>
                      </div>
                    )}
                    {mode === "history" && paid > 0 && (
                      <p className="text-xs font-medium text-black/60 pl-6">
                        Paid {formatRupees(paid)}{due > 0 ? <span className="text-amber-600 font-semibold"> · Due {formatRupees(due)}</span> : null}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t border-black/5">
                    <button
                      onClick={() => setDetail(o)}
                      className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold text-black bg-black/5 hover:bg-black/10 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    {(cfg.next?.length ?? 0) > 0 && (
                      <button
                        onClick={() => { setSelectedOrder(o); setEditStatus(o.status); }}
                        className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold text-white bg-[#1A56DB] hover:bg-[#1447B4] transition-colors"
                      >
                        Update Status
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={pagedOrders.page}
        pages={pagedOrders.pages}
        total={pagedOrders.total}
        onChange={pagedOrders.setPage}
        label="orders"
      />

      {/* Update Status — full-screen overlay */}
      {selectedOrder && createPortal(
        <div className="fixed inset-0 z-[200] bg-white flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-black/8 flex-shrink-0 bg-white">
            <button
              onClick={() => setSelectedOrder(null)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-black/5 hover:bg-black/10 flex-shrink-0"
            >
              <X className="w-5 h-5 text-black" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-black leading-tight">Update Status</p>
              <p className="text-xs font-mono font-bold text-black/40 leading-tight">
                {selectedOrder.orderId || ("#" + String(selectedOrder._id).slice(-6).toUpperCase())}
              </p>
            </div>
            <SolidStatusBadge status={selectedOrder.status} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">

              {/* Order info card */}
              <div className="bg-black/[0.03] rounded-2xl p-4 space-y-2">
                <p className="text-base font-bold text-black">{selectedOrder.customerName}</p>
                {selectedOrder.phone && (
                  <div className="flex items-center gap-2.5">
                    <img src="/icon-phone.png" alt="Phone" className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-semibold text-black">{selectedOrder.phone}</span>
                  </div>
                )}
                {(selectedOrder.address || selectedOrder.deliveryArea) && (
                  <div className="flex items-start gap-2.5">
                    <img src="/icon-pin.png" alt="Location" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-black font-medium leading-snug">
                      {selectedOrder.address || selectedOrder.deliveryArea}
                    </span>
                  </div>
                )}
                {selectedOrder.timeslotLabel && (
                  <div className="flex items-center gap-2.5">
                    <img src="/icon-clock.png" alt="Time" className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-semibold text-black">{selectedOrder.timeslotLabel}</span>
                  </div>
                )}
              </div>

              {/* Change to section */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-black/40 uppercase tracking-widest">Update Order To</p>
                <div className="space-y-2">
                  {(STATUS_CONFIG[selectedOrder.status]?.next ?? []).map((s) => {
                    const solidCfg = SOLID_STATUS[s] ?? { label: s, bg: "bg-gray-500" };
                    const isSelected = editStatus === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setEditStatus(s)}
                        className={`w-full flex items-center justify-between px-4 h-14 rounded-2xl border-2 text-sm font-bold transition-all ${
                          isSelected
                            ? `${solidCfg.bg} border-transparent text-white`
                            : "border-black/8 bg-white text-black hover:border-black/20"
                        }`}
                      >
                        <span>{solidCfg.label}</span>
                        {isSelected && <CheckCircle2 className="w-5 h-5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky bottom */}
          <div className="px-4 py-4 border-t border-black/8 bg-white flex-shrink-0 flex gap-3">
            <button
              onClick={() => setSelectedOrder(null)}
              className="flex-1 h-12 rounded-2xl border-2 border-black/10 text-black font-bold text-sm hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateStatus}
              disabled={saving || !editStatus || editStatus === selectedOrder.status}
              className="flex-[2] h-12 rounded-2xl bg-[#1A56DB] hover:bg-[#1447B4] text-white font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {saving ? "Updating…" : "Confirm Update"}
            </button>
          </div>
        </div>,
        document.body
      )}

      <OrderDetailDialog
        order={detail}
        onClose={() => setDetail(null)}
        onUpdateStatus={(o) => { setSelectedOrder(o); setEditStatus(o.status); }}
      />

      {/* Payment-on-deliver — full-screen overlay */}
      {deliverPayOpen && (pendingDeliverOrder || selectedOrder) && createPortal(
        (() => {
          const activeOrder = pendingDeliverOrder || selectedOrder;
          const orderTotalValue = orderTotal(activeOrder);
          const existingPaid = Number(activeOrder.paidAmount) || 0;
          const remainingDue = Math.max(0, orderTotalValue - existingPaid);
          const newPaidTotal = existingPaid + (deliverPayStatus === "unpaid" ? 0 : deliverPayPaidTotal);
          const newDue = Math.max(0, orderTotalValue - newPaidTotal);

          const closeDialog = () => {
            if (saving) return;
            setDeliverPayOpen(false);
            setPendingDeliverOrder(null);
          };

          return (
            <div className="fixed inset-0 z-[300] flex flex-col bg-white" style={{ fontFamily: "Poppins, sans-serif" }}>
              {/* ── Header ── */}
              <div className="bg-[#162B4D] px-5 pt-6 pb-5 flex-shrink-0">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-2">
                  {activeOrder.orderId || ("#" + String(activeOrder._id).slice(-6).toUpperCase())}
                </p>
                <h1 className="text-2xl font-bold text-white leading-tight">Mark as Delivered</h1>
                <p className="text-sm font-medium text-white/70 mt-1">{activeOrder.customerName}</p>

                {/* Order totals */}
                <div className="mt-4 flex gap-3">
                  <div className="flex-1 bg-white/10 rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-0.5">Order Total</p>
                    <p className="text-lg font-bold text-white">{formatRupees(orderTotalValue)}</p>
                  </div>
                  <div className="flex-1 bg-[#F05B4E]/80 rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-semibold text-white/70 uppercase tracking-wider mb-0.5">Outstanding</p>
                    <p className="text-lg font-bold text-white">{formatRupees(remainingDue)}</p>
                  </div>
                </div>
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                {/* Payment Status */}
                <div>
                  <p className="text-[11px] font-bold text-black uppercase tracking-widest mb-3">Payment Status</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: "unpaid",  label: "Unpaid",     bg: "#F59E0B" },
                      { v: "partial", label: "Partial",    bg: "#3B82F6" },
                      { v: "paid",    label: "Fully Paid", bg: "#10B981" },
                    ] as const).map((opt) => {
                      const active = deliverPayStatus === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => {
                            setDeliverPayStatus(opt.v);
                            if (opt.v === "unpaid") {
                              setDeliverPayEntries([]);
                            } else if (deliverPayEntries.length === 0) {
                              setDeliverPayEntries([
                                { mode: "cash", amount: opt.v === "paid" ? String(remainingDue) : "", reference: "" },
                              ]);
                            } else if (opt.v === "paid") {
                              setDeliverPayEntries((arr) =>
                                arr.length === 1 ? [{ ...arr[0], amount: String(remainingDue) }] : arr
                              );
                            }
                          }}
                          style={active ? { background: opt.bg } : {}}
                          className={`h-12 rounded-2xl text-sm font-bold transition-all active:scale-95 ${
                            active
                              ? "text-white shadow-md"
                              : "bg-black/5 text-black border-2 border-transparent hover:border-black/10"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment entries */}
                {deliverPayStatus !== "unpaid" && (
                  <div>
                    <p className="text-[11px] font-bold text-black uppercase tracking-widest mb-3">Collected Payment</p>
                    <div className="space-y-3">
                      {deliverPayEntries.map((entry, idx) => {
                        const ModeIcon = (PAYMENT_MODES.find((m) => m.value === entry.mode)?.Icon) || Tag;
                        return (
                          <div key={idx} className="flex items-center gap-2 p-3 rounded-2xl border-2 border-black/8 bg-black/[0.02]">
                            <div className="flex-1 relative">
                              <ModeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40 pointer-events-none" />
                              <select
                                value={entry.mode}
                                onChange={(e) =>
                                  setDeliverPayEntries((arr) =>
                                    arr.map((p, i) => (i === idx ? { ...p, mode: e.target.value } : p))
                                  )
                                }
                                className="w-full h-11 pl-10 pr-3 text-sm font-semibold text-black border-none rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-black/20 shadow-sm"
                              >
                                {PAYMENT_MODES.map((m) => (
                                  <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-black/40">₹</span>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                value={entry.amount}
                                onChange={(e) =>
                                  setDeliverPayEntries((arr) =>
                                    arr.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p))
                                  )
                                }
                                placeholder="Amount"
                                className="pl-7 h-11 text-sm font-semibold text-black border-none rounded-xl shadow-sm"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setDeliverPayEntries((arr) => arr.filter((_, i) => i !== idx))}
                              disabled={deliverPayEntries.length === 1}
                              className="w-10 h-10 flex items-center justify-center rounded-xl text-black/30 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add payment + summary */}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setDeliverPayEntries((arr) => [
                            ...arr,
                            {
                              mode: "cash",
                              amount: Math.max(0, remainingDue - deliverPayPaidTotal) > 0
                                ? String(remainingDue - deliverPayPaidTotal)
                                : "",
                              reference: "",
                            },
                          ])
                        }
                        className="flex items-center gap-1.5 px-4 h-10 rounded-2xl border-2 border-dashed border-black/20 text-sm font-semibold text-black hover:border-black/40 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add payment
                      </button>
                      <div className="text-right text-sm">
                        <p className="font-semibold text-black">Collecting {formatRupees(deliverPayPaidTotal)}</p>
                        <p className={`text-xs font-bold ${newDue > 0 ? "text-[#F59E0B]" : "text-[#10B981]"}`}>
                          Due after: {formatRupees(newDue)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="px-5 py-4 border-t-2 border-black/5 bg-white flex gap-3 flex-shrink-0">
                <button
                  onClick={closeDialog}
                  disabled={saving}
                  className="flex-1 h-13 rounded-2xl border-2 border-black/10 text-black font-bold text-sm hover:bg-black/5 transition-colors disabled:opacity-40"
                  style={{ height: "52px" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeliverWithPayment}
                  disabled={saving}
                  className="flex-[2] rounded-2xl text-white font-bold text-base transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                  style={{ background: "#10B981", height: "52px" }}
                >
                  {saving ? "Saving…" : "Mark as Delivered"}
                </button>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function MyDeliveries() {
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [refreshKey, setRefreshKey] = useState(0);
  const [silentPollKey, setSilentPollKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("page-header-slot");
    setHeaderSlot(el as HTMLElement | null);
  }, []);

  // Auto-poll every 30 seconds silently (no blank screen)
  useEffect(() => {
    const id = setInterval(() => {
      setSilentPollKey((k) => k + 1);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <>
      {/* Inject title + refresh button into sticky header via portal */}
      {headerSlot && createPortal(
        <div className="flex items-center w-full min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-black leading-tight truncate">My Orders</p>
            <p className="text-[11px] text-black/50 font-normal leading-tight hidden sm:block truncate">
              Manage active deliveries and review past orders.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80 active:scale-95 transition-all ml-2"
            title="Refresh orders"
          >
            <img
              src="/icon-refresh.png"
              alt="Refresh"
              className={`w-9 h-9 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>,
        headerSlot,
      )}

      <div className="space-y-4 max-w-2xl mx-auto w-full">
        {/* Tabs */}
        <div className="flex bg-black/5 rounded-2xl p-1 gap-1">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
              activeTab === "active"
                ? "bg-white text-black shadow-sm"
                : "text-black/50 hover:text-black"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Active Orders
            {activeCount !== null && activeCount > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black ${
                activeTab === "active" ? "bg-[#1A56DB] text-white" : "bg-black/15 text-black"
              }`}>
                {activeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
              activeTab === "history"
                ? "bg-white text-black shadow-sm"
                : "text-black/50 hover:text-black"
            }`}
          >
            <History className="w-4 h-4" /> Order History
          </button>
        </div>

        {activeTab === "active"
          ? <OrdersList mode="active" refreshKey={refreshKey} silentRefreshKey={silentPollKey} onCountChange={setActiveCount} />
          : <OrdersList mode="history" refreshKey={refreshKey} silentRefreshKey={silentPollKey} />}
      </div>
    </>
  );
}
