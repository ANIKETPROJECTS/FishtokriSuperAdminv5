import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Truck, MapPin, Search, SlidersHorizontal,
  X, Clock, CheckCircle2, XCircle, Phone, User, RefreshCw,
  ShoppingBag, History, CalendarDays, CircleDollarSign, Eye,
  Mail, Home, Hash, Tag, Wallet, Receipt, FileText, Store,
  Banknote, Smartphone, CreditCard, Landmark, Plus, Trash,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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

// ─── ORDER DETAIL DIALOG ──────────────────────────────────────────────────────

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

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#162B4D] flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-orange-500" /> Order #{String(order._id).slice(-6).toUpperCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1 text-sm">
          {/* Header strip */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              {isTakeaway && order.status !== "takeaway" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border text-emerald-600 bg-emerald-50 border-emerald-200">
                  <Store className="w-3 h-3" /> Takeaway
                </span>
              )}
            </div>
            <span className="text-[10px] text-gray-400">Created {formatDate(order.createdAt)}</span>
          </div>

          {/* Customer */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Customer</p>
            <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span className="font-semibold text-[#162B4D]">{order.customerName || "—"}</span></div>
            {order.phone && <div className="flex items-center gap-2 text-xs text-gray-600"><Phone className="w-3.5 h-3.5 text-gray-400" /><a href={`tel:${order.phone}`} className="hover:underline">{order.phone}</a></div>}
            {order.email && <div className="flex items-center gap-2 text-xs text-gray-600"><Mail className="w-3.5 h-3.5 text-gray-400" />{order.email}</div>}
          </div>

          {/* Delivery / Pickup */}
          {isTakeaway ? (
            <div className="bg-emerald-50/50 rounded-xl p-3 space-y-1 border border-emerald-100">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1"><Store className="w-3 h-3" /> Pickup from Hub</p>
              <p className="text-xs text-[#162B4D] font-semibold">{order.subHubName || order.pickupLocation || "—"}</p>
              {order.superHubName && <p className="text-[11px] text-gray-500">{order.superHubName}</p>}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Home className="w-3 h-3" /> Delivery Address {d.label && <span className="text-gray-500 normal-case font-medium">· {d.label}</span>}</p>
              {(recipientName || recipientPhone) && (
                <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-700">
                  {recipientName && <span className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400" /><span className="font-medium">{recipientName}</span></span>}
                  {recipientPhone && <a href={`tel:${recipientPhone}`} className="flex items-center gap-1 hover:underline"><Phone className="w-3 h-3 text-gray-400" />{recipientPhone}</a>}
                </div>
              )}
              {addressLines.length > 0 ? (
                <div className="flex items-start gap-2 text-xs text-gray-600">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-0.5">
                    {addressLines.map((ln, i) => <p key={i}>{ln}</p>)}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No delivery address on file</p>
              )}
              {d.instructions && <p className="text-[11px] text-amber-700 italic border-l-2 border-amber-200 pl-2">Note: {d.instructions}</p>}
            </div>
          )}

          {/* Schedule */}
          {(order.timeslotLabel || order.scheduledDate || order.deliveryDate) && (
            <div className="bg-indigo-50/40 rounded-xl p-3 border border-indigo-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" />
              <div className="text-xs">
                {(order.scheduledDate || order.deliveryDate) && <p className="text-[#162B4D] font-semibold">{formatDay(order.scheduledDate || order.deliveryDate)}</p>}
                {order.timeslotLabel && <p className="text-indigo-600">{order.timeslotLabel}</p>}
              </div>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Items ({(order.items ?? []).length})</p>
            <div className="space-y-1 border border-gray-100 rounded-xl p-2">
              {(order.items ?? []).map((i: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs border-b border-gray-100 last:border-0 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[#162B4D] truncate">{i.name}</p>
                    <p className="text-[10px] text-gray-400">{formatRupees(Number(i.price || 0))} × {i.quantity}{i.unit ? ` ${i.unit}` : ""}</p>
                  </div>
                  <span className="font-semibold text-[#162B4D]">{formatRupees(Number(i.price || 0) * Number(i.quantity || 1))}</span>
                </div>
              ))}
              {(!order.items || order.items.length === 0) && <p className="text-xs text-gray-400 text-center py-2">No items</p>}
            </div>
          </div>

          {/* Totals */}
          <div className="border border-gray-100 rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-gray-500">Subtotal</span><span className="text-[#162B4D]">{formatRupees(sub)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 inline-flex items-center gap-1"><Tag className="w-3 h-3 text-emerald-500" />Coupon Discount{couponCode ? ` (${couponCode})` : ""}</span>
                <span className="text-emerald-600">-{formatRupees(discount)}</span>
              </div>
            )}
            {slot > 0 && (
              <div className="flex justify-between text-xs"><span className="text-gray-500">Slot Charge</span><span className="text-[#162B4D]">{formatRupees(slot)}</span></div>
            )}
            <div className="flex justify-between text-sm border-t border-gray-100 pt-1.5 mt-1.5"><span className="font-bold text-[#162B4D]">Grand Total</span><span className="font-bold text-[#162B4D]">{formatRupees(total)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500 inline-flex items-center gap-1"><Wallet className="w-3 h-3" />Paid</span><span className="font-semibold text-green-600">{formatRupees(paid)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500 inline-flex items-center gap-1"><Receipt className="w-3 h-3" />Due</span><span className={`font-semibold ${due > 0 ? "text-amber-600" : "text-gray-400"}`}>{formatRupees(due)}</span></div>
            {order.paymentStatus && (
              <div className="flex justify-between text-[11px] pt-1"><span className="text-gray-400">Payment Status</span><span className="font-semibold uppercase tracking-wide text-gray-600">{order.paymentStatus}</span></div>
            )}
          </div>

          {/* Hub */}
          {(order.superHubName || order.subHubName) && (
            <div className="text-[11px] text-gray-500 inline-flex items-center gap-1.5"><Hash className="w-3 h-3 text-gray-400" />{[order.superHubName, order.subHubName].filter(Boolean).join(" → ")}</div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="border-l-2 border-amber-200 bg-amber-50/40 pl-2 py-1.5 pr-2 rounded-r">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1"><FileText className="w-3 h-3" />Order Notes</p>
              <p className="text-[11px] text-gray-700">{order.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-9">Close</Button>
          {nextStatuses.length > 0 && onUpdateStatus && (
            <Button
              onClick={() => { onUpdateStatus(order); onClose(); }}
              className="bg-[#1A56DB] hover:bg-[#1447B4] h-9"
            >
              <Truck className="w-3.5 h-3.5 mr-1" /> Update Status
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ORDERS LIST (shared by both tabs) ────────────────────────────────────────

function OrdersList({ mode }: { mode: "active" | "history" }) {
  const { toast } = useToast();
  const admin = getAdminData();

  const allowedStatuses = mode === "active" ? ACTIVE_STATUSES : HISTORY_STATUSES;

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [deliverPayOpen, setDeliverPayOpen] = useState(false);
  const [deliverPayStatus, setDeliverPayStatus] = useState<"unpaid" | "partial" | "paid">("paid");
  const [deliverPayEntries, setDeliverPayEntries] = useState<{ mode: string; amount: string; reference: string }[]>([]);
  const [deliverWalletTopup, setDeliverWalletTopup] = useState(true);

  const loadOrders = useCallback(async () => {
    if (!admin?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ assignedTo: admin.id, limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      else params.set("status", allowedStatuses.join(","));
      const data = await apiFetch(`/api/orders?${params}`);
      setOrders(data.orders ?? []);
    } catch { } finally { setLoading(false); }
  }, [admin?.id, statusFilter, allowedStatuses.join(",")]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const filtered = useMemo(() => orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.customerName?.toLowerCase().includes(q) ||
      o.phone?.includes(q) ||
      o.deliveryArea?.toLowerCase().includes(q) ||
      String(o._id).toLowerCase().includes(q.replace(/^#/, "")) ||
      (o.items ?? []).some((i: any) => i.name?.toLowerCase().includes(q));
  }), [orders, search]);

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
    if (!selectedOrder) return;
    const orderTotalAmount = orderTotal(selectedOrder);
    const existingPaid = Number(selectedOrder.paidAmount) || 0;
    const existingPayments: any[] = Array.isArray(selectedOrder.payments) ? selectedOrder.payments : [];

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
        ...(overpayment > 0 && deliverWalletTopup ? { walletTopup: overpayment } : {}),
      };
      await apiFetch(`/api/orders/${selectedOrder._id}`, { method: "PUT", body: JSON.stringify(payload) });
      const walletMsg = overpayment > 0 && deliverWalletTopup
        ? ` ₹${overpayment.toLocaleString("en-IN")} added to wallet.`
        : "";
      toast({ title: "Marked as delivered", description: (deliverPayStatus === "paid" ? "Payment recorded." : deliverPayStatus === "partial" ? "Partial payment recorded." : "No payment recorded.") + walletMsg });
      setDeliverPayOpen(false);
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
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer, phone, area, item or order #" className="pl-8 h-9 text-sm" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 mr-1" />
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All {mode === "active" ? "active" : "history"}</SelectItem>
            {allowedStatuses.filter((s) => STATUS_CONFIG[s]).map((s) => <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadOrders} className="h-9 gap-1.5 text-gray-500">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Summary cards */}
      {mode === "history" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center"><History className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Total Past Orders</p><p className="text-lg font-bold text-[#162B4D]">{summary.count}</p></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center"><CircleDollarSign className="w-4 h-4 text-green-600" /></div>
            <div><p className="text-xs text-gray-500">Revenue Collected</p><p className="text-lg font-bold text-[#162B4D]">{formatRupees(summary.totalRevenue)}</p></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center"><CalendarDays className="w-4 h-4 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Order Value</p><p className="text-lg font-bold text-[#162B4D]">{formatRupees(summary.totalValue)}</p></div>
          </div>
        </div>
      )}

      {/* Orders list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          {mode === "active" ? <Truck className="w-10 h-10 text-gray-200 mx-auto mb-3" /> : <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />}
          <p className="text-gray-400 font-medium">{mode === "active" ? "No active orders assigned to you" : "No past orders yet"}</p>
          <p className="text-xs text-gray-300 mt-1">{mode === "active" ? "Orders will appear here once admin assigns them" : "Completed and cancelled orders will appear here"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagedOrders.pageItems.map((o) => {
            const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            const total = orderTotal(o);
            const paid = Number(o.paidAmount || 0);
            const due = Math.max(0, total - paid);
            return (
              <div key={String(o._id)} className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 border`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[#162B4D] text-sm">{o.customerName}</p>
                        <span className="text-[10px] text-gray-400">#{String(o._id).slice(-6).toUpperCase()}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      {o.phone && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{o.phone}</p>}
                      {o.address && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 text-gray-400" />{o.address}</p>}
                      {o.deliveryArea && <p className="text-[10px] text-gray-400">{o.deliveryArea}</p>}
                      <p className="text-xs text-gray-500 mt-1 truncate">{(o.items ?? []).map((i: any) => i.name).join(", ")}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {o.timeslotLabel && <p className="text-[10px] text-indigo-500 font-medium">{o.timeslotLabel}</p>}
                        {mode === "history" && (
                          <p className="text-[10px] text-gray-400">Paid {formatRupees(paid)} {due > 0 && <span className="text-amber-500">• Due {formatRupees(due)}</span>}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="font-bold text-[#162B4D]">{formatRupees(total)}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(o.createdAt)}</p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setDetail(o)}
                        className="text-[11px] font-semibold text-gray-500 hover:text-[#1A56DB] bg-gray-50 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                      {(cfg.next?.length ?? 0) > 0 && (
                        <button
                          onClick={() => { setSelectedOrder(o); setEditStatus(o.status); }}
                          className="text-[11px] font-semibold text-[#1A56DB] bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
                        >
                          Update Status
                        </button>
                      )}
                    </div>
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

      {/* Update Status Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-[420px]">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#162B4D] flex items-center gap-2">
                  <Truck className="w-4 h-4 text-orange-500" /> Update Order Status
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-semibold text-[#162B4D] text-sm">{selectedOrder.customerName}</span>
                  </div>
                  {selectedOrder.address && (
                    <div className="flex items-start gap-2 text-xs text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />{selectedOrder.address}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 ml-5">{(selectedOrder.items ?? []).map((i: any) => i.name).join(", ")}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Current Status</p>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Change To</p>
                  <div className="flex gap-2 flex-wrap">
                    {(STATUS_CONFIG[selectedOrder.status]?.next ?? []).map((s) => {
                      const cfg = STATUS_CONFIG[s];
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={s}
                          onClick={() => setEditStatus(s)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${editStatus === s ? `${cfg.bg} ${cfg.color} border-current ring-2 ring-current/20` : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                        >
                          <Icon className="w-3.5 h-3.5" />{cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelectedOrder(null)} className="h-9">Cancel</Button>
                <Button
                  onClick={handleUpdateStatus}
                  disabled={saving || !editStatus || editStatus === selectedOrder.status}
                  className="bg-[#1A56DB] hover:bg-[#1447B4] h-9"
                >
                  {saving ? "Updating..." : "Confirm Update"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <OrderDetailDialog
        order={detail}
        onClose={() => setDetail(null)}
        onUpdateStatus={(o) => { setSelectedOrder(o); setEditStatus(o.status); }}
      />

      {/* Payment-on-deliver dialog */}
      <Dialog open={deliverPayOpen} onOpenChange={(open) => { if (!saving) setDeliverPayOpen(open); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Mark as Delivered
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (() => {
            const orderTotalValue = orderTotal(selectedOrder);
            const existingPaid = Number(selectedOrder.paidAmount) || 0;
            const remainingDue = Math.max(0, orderTotalValue - existingPaid);
            const totalCollectedDialog = existingPaid + (deliverPayStatus === "unpaid" ? 0 : deliverPayPaidTotal);
            const overpaymentDialog = Math.max(0, totalCollectedDialog - orderTotalValue);
            const newDue = Math.max(0, orderTotalValue - totalCollectedDialog);

            return (
              <div className="space-y-4">
                <div className="px-3 py-2 bg-gray-50 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[12px] text-gray-500">
                    <span>Order Total</span>
                    <span className="font-semibold text-gray-700">{formatRupees(orderTotalValue)}</span>
                  </div>
                  {existingPaid > 0 && (
                    <div className="flex items-center justify-between text-[12px] text-emerald-600">
                      <span>Already Paid</span>
                      <span>{formatRupees(existingPaid)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[12px] text-amber-600">
                    <span>Outstanding</span>
                    <span className="font-semibold">{formatRupees(remainingDue)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment Status</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: "unpaid", label: "Unpaid", color: "amber" },
                      { v: "partial", label: "Partial", color: "blue" },
                      { v: "paid", label: "Fully Paid", color: "emerald" },
                    ] as const).map((opt) => {
                      const active = deliverPayStatus === opt.v;
                      const colorMap: Record<string, string> = {
                        amber: active ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                        blue: active ? "border-blue-300 bg-blue-50 text-[#1A56DB]" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                        emerald: active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                      };
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
                          className={`h-9 rounded-xl border text-xs font-semibold transition-colors ${colorMap[opt.color]}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {deliverPayStatus !== "unpaid" && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Collected Payment</p>
                    {deliverPayEntries.map((entry, idx) => {
                      const ModeIcon = (PAYMENT_MODES.find((m) => m.value === entry.mode)?.Icon) || Tag;
                      return (
                        <div
                          key={idx}
                          className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl border border-gray-100 bg-gray-50/40"
                        >
                          <div className="col-span-5 relative">
                            <ModeIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <select
                              value={entry.mode}
                              onChange={(e) =>
                                setDeliverPayEntries((arr) =>
                                  arr.map((p, i) => (i === idx ? { ...p, mode: e.target.value } : p))
                                )
                              }
                              className="w-full h-9 pl-8 pr-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
                            >
                              {PAYMENT_MODES.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-6 relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
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
                              className="pl-6 h-9 text-sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setDeliverPayEntries((arr) => arr.filter((_, i) => i !== idx))}
                            disabled={deliverPayEntries.length === 1}
                            className="col-span-1 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Remove payment"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
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
                        className="h-8 text-xs gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add payment
                      </Button>
                      <div className="text-[11px] text-gray-500 flex items-center gap-3">
                        <span>Collecting: <span className="font-semibold text-gray-700">{formatRupees(deliverPayPaidTotal)}</span></span>
                        {overpaymentDialog === 0 && (
                          <span>
                            New due:{" "}
                            <span className={`font-semibold ${newDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                              {formatRupees(newDue)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {overpaymentDialog > 0 && (
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50">
                        <div className="flex items-center gap-2 min-w-0">
                          <Wallet className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-blue-800">Customer overpaid by {formatRupees(overpaymentDialog)}</p>
                            <p className="text-[11px] text-blue-600">Add extra to FishTokri Wallet?</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeliverWalletTopup((v) => !v)}
                          className={`flex-shrink-0 relative w-10 h-6 rounded-full transition-colors ${deliverWalletTopup ? "bg-blue-600" : "bg-gray-300"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${deliverWalletTopup ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverPayOpen(false)} disabled={saving} className="h-9">
              Cancel
            </Button>
            <Button
              onClick={handleDeliverWithPayment}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
            >
              {saving ? "Saving..." : "Mark as Delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function MyDeliveries() {
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
          <Truck className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-[#162B4D]">My Orders</h2>
          <p className="text-gray-500 text-sm mt-0.5">Manage active deliveries and review past orders.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white rounded-t-xl">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "active" ? "border-[#1A56DB] text-[#1A56DB] bg-blue-50/40" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          <Truck className="w-4 h-4" /> Active Orders
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "history" ? "border-[#1A56DB] text-[#1A56DB] bg-blue-50/40" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          <History className="w-4 h-4" /> Order History
        </button>
      </div>

      {activeTab === "active" ? <OrdersList mode="active" /> : <OrdersList mode="history" />}
    </div>
  );
}
