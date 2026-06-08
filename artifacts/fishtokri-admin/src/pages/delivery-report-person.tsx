import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Truck, Package, Banknote, CreditCard, Wallet, RefreshCw,
  Search, X, Edit2, ToggleLeft, ToggleRight, TrendingUp,
  IndianRupee, AlertCircle, CheckCircle2, Phone, Mail,
  MapPin, Calendar, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DateFilterBar, ModeTag, modeMeta, avatarColor, initials, today, daysAgo } from "./delivery-report";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const FONT = "Poppins, sans-serif";

function getToken() { return localStorage.getItem("fishtokri_token") || ""; }
function getAdmin() {
  try { return JSON.parse(localStorage.getItem("fishtokri_admin") || "null"); } catch { return null; }
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

function formatRupees(n: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function formatDate(d: string | Date | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(d: string | Date | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    + " · "
    + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── Enhanced stat card ──────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent, iconBg, icon, fullWidth,
}: {
  label: string; value: string; sub?: string;
  accent: string; iconBg: string; icon: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-black/8 shadow-sm p-4 flex flex-col gap-1 ${fullWidth ? "col-span-2" : ""}`}
      style={{ fontFamily: FONT }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <span className={accent}>{icon}</span>
        </div>
        <p className="text-[11px] font-semibold text-black/50 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold leading-tight ${accent}`}>{value}</p>
      {sub && <p className="text-[12px] font-medium text-black/40 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Order card (mobile-first, Poppins, black text, no dropdown) ─────────────
function OrderCard({ order }: { order: any }) {
  const orderId = order.orderId || (order.orderNumber ? `#${order.orderNumber}` : ("#" + String(order.id || "").slice(-6).toUpperCase()));

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    delivered: { bg: "bg-green-500", text: "text-white", label: "Delivered" },
    takeaway:  { bg: "bg-blue-500",  text: "text-white", label: "Takeaway" },
    cancelled: { bg: "bg-red-500",   text: "text-white", label: "Cancelled" },
  };
  const PAY_STYLES: Record<string, { bg: string; text: string }> = {
    paid:    { bg: "bg-green-500", text: "text-white" },
    partial: { bg: "bg-amber-400", text: "text-white" },
    unpaid:  { bg: "bg-red-500",   text: "text-white" },
  };

  const ss = STATUS_STYLES[order.status] ?? { bg: "bg-black/10", text: "text-black", label: order.status };
  const ps = PAY_STYLES[order.paymentStatus ?? ""] ?? { bg: "bg-black/10", text: "text-black" };

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-4" style={{ fontFamily: FONT }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-black/40 tracking-wide mb-0.5">{orderId}</p>
          <p className="text-[17px] font-bold text-black leading-tight">{order.customerName || "—"}</p>
          {order.phone && (
            <p className="text-[13px] font-medium text-black/50 mt-0.5">{order.phone}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${ss.bg} ${ss.text}`}>
            {ss.label}
          </span>
          {order.paymentStatus && (
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${ps.bg} ${ps.text}`}>
              {order.paymentStatus}
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 mt-3">
        {order.createdAt && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-black/50">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(order.createdAt)}
          </span>
        )}
        {(order.deliveryArea || order.subHubName) && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-black/50 truncate">
            <Hash className="w-3.5 h-3.5 flex-shrink-0" />
            {order.deliveryArea || order.subHubName}
          </span>
        )}
      </div>

      {/* Payment tags + Total */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/6">
        <div className="flex flex-wrap gap-1.5">
          {Array.isArray(order.payments) && order.payments.length > 0
            ? order.payments.map((p: any, i: number) => <ModeTag key={i} mode={p.mode} amount={p.amount} />)
            : <span className="text-[12px] font-medium text-black/30">No payments</span>
          }
        </div>
        <span className="text-[17px] font-bold text-black ml-2">{formatRupees(order.total ?? 0)}</span>
      </div>

      {/* Wallet credit / debit from over- or under-collection */}
      {(() => {
        const pays: any[] = Array.isArray(order.payments) ? order.payments : [];
        const nonWalletTotal = pays.reduce((s: number, p: any) => {
          const m = String(p?.mode || "").toLowerCase();
          return m !== "wallet" ? s + (Number(p.amount) || 0) : s;
        }, 0);
        const orderTotal = Number(order.total) || 0;
        const excess = Math.round((nonWalletTotal - orderTotal) * 100) / 100;
        if (excess === 0) return null;
        return (
          <div className={`mt-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-semibold ${excess > 0 ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
            <Wallet className="w-3 h-3 flex-shrink-0" />
            {excess > 0
              ? `+${formatRupees(excess)} extra collected → credited to wallet`
              : `${formatRupees(Math.abs(excess))} short → debited from wallet`}
          </div>
        );
      })()}
    </div>
  );
}

// ── Edit profile dialog ───────────────────────────────────────────────────────
function EditProfileDialog({
  open, onClose, user, onSaved,
}: { open: boolean; onClose: () => void; user: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const mutation = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/users/${user.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "Profile updated" }); onSaved(); onClose(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Delivery Person Profile</DialogTitle>
          <DialogDescription>Update profile details for {user?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit number" className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-brand-primary hover:bg-brand-primary/90 text-white"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ name: name.trim(), phone: phone.trim(), email: email.trim() })}
          >
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mode icon/accent helpers ──────────────────────────────────────────────────
function modeAccent(mode: string): { accent: string; iconBg: string } {
  const map: Record<string, { accent: string; iconBg: string }> = {
    upi:    { accent: "text-purple-600", iconBg: "bg-purple-50" },
    cash:   { accent: "text-green-600",  iconBg: "bg-green-50" },
    wallet: { accent: "text-blue-600",   iconBg: "bg-blue-50" },
    card:   { accent: "text-orange-600", iconBg: "bg-orange-50" },
    bank:   { accent: "text-sky-600",    iconBg: "bg-sky-50" },
    other:  { accent: "text-gray-600",   iconBg: "bg-gray-50" },
  };
  return map[(mode || "").toLowerCase()] ?? { accent: "text-gray-600", iconBg: "bg-gray-50" };
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeliveryReportPersonPage() {
  const params = useParams<{ id: string }>();
  const personId = params.id;
  const [, setLocation] = useLocation();
  const admin = getAdmin();
  const isMasterAdmin = admin?.role === "master_admin";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: today(), to: today() });
  const handleApply = (f?: string, t?: string) => setApplied({ from: f ?? from, to: t ?? to });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "orders">("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["delivery-report-person", personId, applied.from, applied.to],
    queryFn: () => {
      const p = new URLSearchParams({ from: applied.from, to: applied.to });
      return apiFetch(`/api/delivery-report/person/${personId}?${p}`);
    },
    enabled: !!personId,
  });

  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ["delivery-persons-list"],
    queryFn: () => apiFetch(`/api/users?role=delivery_person`),
    enabled: isMasterAdmin,
  });

  const userProfile = useMemo(
    () => (usersData?.users ?? []).find((u: any) => u.id === personId),
    [usersData, personId],
  );

  const toggleMutation = useMutation({
    mutationFn: () => apiFetch(`/api/users/${personId}/toggle-status`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      refetchUsers();
      setConfirmToggle(false);
      queryClient.invalidateQueries({ queryKey: ["delivery-persons-list"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const person = data?.person;
  const summary = data?.summary ?? { totalOrders: 0, totalRevenue: 0, dueAmount: 0, byMode: {} };
  const orders: any[] = person?.orders ?? [];

  const allModes = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => (o.payments ?? []).forEach((p: any) => s.add((p.mode || "other").toLowerCase())));
    return Array.from(s);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        if (modeFilter !== "all") {
          const hasMode = (o.payments ?? []).some((p: any) => (p.mode || "other").toLowerCase() === modeFilter);
          if (!hasMode) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          return (
            (o.customerName || "").toLowerCase().includes(q) ||
            (o.phone || "").includes(q) ||
            (o.deliveryArea || "").toLowerCase().includes(q) ||
            String(o.orderNumber || "").includes(q) ||
            (o.id || "").slice(-6).toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, search, statusFilter, modeFilter]);

  const modeBreakdown = Object.entries(summary.byMode || {}) as [string, { count: number; amount: number }][];
  const totalPct = (amount: number) =>
    summary.totalRevenue > 0 ? ((amount / summary.totalRevenue) * 100).toFixed(1) : "0.0";

  const displayName = person?.personName ?? userProfile?.name ?? "Delivery Person";
  const isActive = userProfile?.status !== "Inactive";

  // First 2 payment modes for the 4-card row, rest go below
  const primaryModes = modeBreakdown.slice(0, 2);
  const extraModes = modeBreakdown.slice(2);

  return (
    <div className="space-y-4 max-w-2xl mx-auto w-full" style={{ fontFamily: FONT }}>
      {/* Date filter */}
      <DateFilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} applied={applied} onApply={handleApply} />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-black/30">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Loading report…</span>
        </div>
      )}

      {isError && (
        <div className="bg-white rounded-2xl border border-black/8 shadow-sm py-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400 opacity-70" />
          <p className="text-[15px] font-semibold text-black">Failed to load report</p>
          <button
            onClick={() => refetch()}
            className="mt-3 text-sm font-semibold text-brand-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* ── Stat cards ─────────────────────────────────────────────────── */}

          {/* Row 1: Total Orders + Total Collected (always shown) */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total Orders"
              value={String(summary.totalOrders)}
              sub={`in ${applied.from === applied.to ? "1 day" : "date range"}`}
              accent="text-brand-primary"
              iconBg="bg-red-50"
              icon={<Truck className="w-4 h-4" />}
            />
            <StatCard
              label="Total Collected"
              value={formatRupees(summary.totalRevenue)}
              sub={(summary.dueAmount || 0) > 0 ? `Due: ${formatRupees(summary.dueAmount)}` : "Fully collected"}
              accent="text-green-600"
              iconBg="bg-green-50"
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
          </div>

          {/* Row 2: First 2 payment modes side by side */}
          {primaryModes.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {primaryModes.map(([mode, mdata]) => {
                const m = modeMeta(mode);
                const a = modeAccent(mode);
                return (
                  <StatCard
                    key={mode}
                    label={`${m.label} Collected`}
                    value={formatRupees(mdata.amount)}
                    sub={`${mdata.count} transaction${mdata.count !== 1 ? "s" : ""}`}
                    accent={a.accent}
                    iconBg={a.iconBg}
                    icon={m.icon as any}
                  />
                );
              })}
            </div>
          )}

          {/* Row 3: Remaining payment modes (wallet etc.) — col-span-2 if alone, 2-col if multiple */}
          {extraModes.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {extraModes.map(([mode, mdata], idx) => {
                const m = modeMeta(mode);
                const a = modeAccent(mode);
                const isAlone = extraModes.length % 2 !== 0 && idx === extraModes.length - 1;
                return (
                  <StatCard
                    key={mode}
                    label={`${m.label} Collected`}
                    value={formatRupees(mdata.amount)}
                    sub={`${mdata.count} transaction${mdata.count !== 1 ? "s" : ""}`}
                    accent={a.accent}
                    iconBg={a.iconBg}
                    icon={m.icon as any}
                    fullWidth={isAlone}
                  />
                );
              })}
            </div>
          )}

          {/* ── Tabs ───────────────────────────────────────────────────────── */}
          <div className="flex gap-1 bg-black/5 rounded-2xl p-1">
            {(["overview", "orders"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${
                  activeTab === tab ? "bg-white text-black shadow-sm" : "text-black/40"
                }`}
              >
                {tab === "overview" ? "Overview" : `Orders (${orders.length})`}
              </button>
            ))}
          </div>

          {/* ── Overview tab ───────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-4">

              {/* Payment Mode Breakdown */}
              <div className="bg-white rounded-2xl border border-black/8 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-black/6 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-brand-primary" />
                  </div>
                  <h3 className="text-[15px] font-bold text-black">Payment Mode Breakdown</h3>
                </div>

                {modeBreakdown.length === 0 ? (
                  <div className="py-12 text-center">
                    <IndianRupee className="w-10 h-10 mx-auto mb-3 text-black/15" />
                    <p className="text-[14px] font-semibold text-black/30">No payment data for selected range</p>
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {modeBreakdown.map(([mode, mdata]) => {
                      const m = modeMeta(mode);
                      const a = modeAccent(mode);
                      const pct = parseFloat(totalPct(mdata.amount));
                      return (
                        <div key={mode} className="px-5 py-4">
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className={a.accent}>{m.icon}</span>
                              <span className={`text-[15px] font-bold ${a.accent}`}>{m.label}</span>
                            </div>
                            <span className="text-[16px] font-bold text-black">{formatRupees(mdata.amount)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-black/6 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-brand-primary transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[12px] font-semibold text-black/40 w-24 text-right flex-shrink-0">
                              {mdata.count} txn · {pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="px-5 py-4 bg-black/[0.02] flex items-center justify-between">
                      <span className="text-[14px] font-bold text-black">
                        Total · {modeBreakdown.reduce((s, [, d]) => s + d.count, 0)} transactions
                      </span>
                      <span className="text-[16px] font-bold text-black">{formatRupees(summary.totalRevenue)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Summary */}
              {orders.length > 0 && (
                <div className="bg-white rounded-2xl border border-black/8 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-black/6 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="text-[15px] font-bold text-black">Daily Summary</h3>
                  </div>
                  <div className="divide-y divide-black/5">
                    {(() => {
                      const byDay = new Map<string, { orders: number; collected: number; due: number }>();
                      orders.forEach((o) => {
                        const d = new Date(o.createdAt).toLocaleDateString("en-CA");
                        if (!byDay.has(d)) byDay.set(d, { orders: 0, collected: 0, due: 0 });
                        const day = byDay.get(d)!;
                        day.orders++;
                        day.collected += (o.payments ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
                        day.due += Number(o.dueAmount) || 0;
                      });
                      return Array.from(byDay.entries())
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .slice(0, 15)
                        .map(([date, stats]) => (
                          <div key={date} className="px-5 py-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[14px] font-bold text-black">
                                {new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
                              </p>
                              <p className="text-[12px] font-semibold text-black/40 mt-0.5">
                                {stats.orders} order{stats.orders !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-5 flex-shrink-0">
                              <div className="text-right">
                                <p className="text-[11px] font-semibold text-black/40 uppercase tracking-wide">Collected</p>
                                <p className="text-[14px] font-bold text-green-600">{formatRupees(stats.collected)}</p>
                              </div>
                              {stats.due > 0 && (
                                <div className="text-right">
                                  <p className="text-[11px] font-semibold text-black/40 uppercase tracking-wide">Due</p>
                                  <p className="text-[14px] font-bold text-red-500">{formatRupees(stats.due)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ));
                    })()}
                  </div>
                </div>
              )}

              {orders.length === 0 && (
                <div className="bg-white rounded-2xl border border-black/8 shadow-sm py-14 text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-black/15" />
                  <p className="text-[15px] font-bold text-black/30">No deliveries in this period</p>
                </div>
              )}
            </div>
          )}

          {/* ── Orders tab ─────────────────────────────────────────────────── */}
          {activeTab === "orders" && (
            <div className="space-y-3">

              {/* Filters card */}
              <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-4 space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
                  <input
                    type="text"
                    placeholder="Search customer, area, order #..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-11 pl-10 pr-10 text-[14px] font-medium text-black bg-black/[0.03] rounded-xl border-none outline-none placeholder:text-black/30"
                    style={{ fontFamily: FONT }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-black/60" />
                    </button>
                  )}
                </div>

                {/* Dropdowns row */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-11 border border-black/10 rounded-xl text-[13px] font-semibold px-3 text-black bg-white"
                    style={{ fontFamily: FONT }}
                  >
                    <option value="all">All Status</option>
                    <option value="delivered">Delivered</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                    className="h-11 border border-black/10 rounded-xl text-[13px] font-semibold px-3 text-black bg-white"
                    style={{ fontFamily: FONT }}
                  >
                    <option value="all">All Modes</option>
                    {allModes.map((m) => (
                      <option key={m} value={m}>{modeMeta(m).label}</option>
                    ))}
                  </select>
                </div>

                {/* Count */}
                <p className="text-[12px] font-semibold text-black/40 text-right">
                  {filteredOrders.length} of {orders.length} orders
                </p>
              </div>

              {/* Order cards */}
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-black/8 shadow-sm py-14 text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-black/15" />
                  <p className="text-[15px] font-bold text-black/30">No orders match your filters</p>
                  <button
                    onClick={() => { setSearch(""); setStatusFilter("all"); setModeFilter("all"); }}
                    className="mt-3 text-[13px] font-semibold text-brand-primary hover:underline"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <>
                  {filteredOrders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}

                  {/* Summary footer */}
                  <div className="bg-white rounded-2xl border border-black/8 shadow-sm px-5 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 mb-3">Summary</p>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                      <div>
                        <p className="text-[11px] font-semibold text-black/40">Orders</p>
                        <p className="text-[17px] font-bold text-black">{filteredOrders.length}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-black/40">Total Value</p>
                        <p className="text-[17px] font-bold text-black">
                          {formatRupees(filteredOrders.reduce((s, o) => s + (o.total ?? 0), 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-black/40">Collected</p>
                        <p className="text-[17px] font-bold text-green-600">
                          {formatRupees(filteredOrders.reduce((s, o) => s + ((o.payments ?? []).reduce((ps: number, p: any) => ps + (Number(p.amount) || 0), 0)), 0))}
                        </p>
                      </div>
                      {filteredOrders.reduce((s, o) => s + (Number(o.dueAmount) || 0), 0) > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-black/40">Due</p>
                          <p className="text-[17px] font-bold text-red-500">
                            {formatRupees(filteredOrders.reduce((s, o) => s + (Number(o.dueAmount) || 0), 0))}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Edit Profile dialog */}
      {editOpen && userProfile && (
        <EditProfileDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          user={userProfile}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["delivery-persons-list"] });
          }}
        />
      )}

      {/* Confirm toggle status dialog */}
      <Dialog open={confirmToggle} onOpenChange={(v) => !v && setConfirmToggle(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isActive ? "Deactivate" : "Activate"} Delivery Person</DialogTitle>
            <DialogDescription>
              {isActive
                ? `${displayName} will be deactivated and won't be able to log in.`
                : `${displayName} will be re-activated and can log in again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmToggle(false)}>Cancel</Button>
            <Button
              className={isActive ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
              disabled={toggleMutation.isPending}
              onClick={() => toggleMutation.mutate()}
            >
              {toggleMutation.isPending ? "Updating…" : (isActive ? "Deactivate" : "Activate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
