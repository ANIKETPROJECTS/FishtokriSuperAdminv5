import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Truck, Package, Banknote, CreditCard, Wallet, RefreshCw,
  Search, X, Edit2, ToggleLeft, ToggleRight, TrendingUp, ChevronUp,
  ChevronDown, IndianRupee, AlertCircle, CheckCircle2, Phone, Mail,
  MapPin, Calendar, Hash, Filter,
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

function formatDateTime(d: string | Date | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    + " · "
    + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(d: string | Date | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Order row in the history table ────────────────────────────────────────────
function OrderRow({ order, idx }: { order: any; idx: number }) {
  const [open, setOpen] = useState(false);
  const STATUS_COLORS: Record<string, string> = {
    delivered: "bg-green-100 text-green-700",
    takeaway: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const PAY_COLORS: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    partial: "bg-yellow-100 text-yellow-700",
    unpaid: "bg-red-100 text-red-700",
  };
  const sc = STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600";
  const pc = PAY_COLORS[order.paymentStatus ?? ""] ?? "bg-gray-100 text-gray-600";

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50/60 transition-colors cursor-pointer ${
          idx % 2 === 0 ? "" : "bg-gray-50/30"
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2.5 px-3 text-xs font-mono text-gray-500 whitespace-nowrap">
          #{order.orderNumber ?? String(order.id).slice(-6).toUpperCase()}
        </td>
        <td className="py-2.5 px-3">
          <p className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{order.customerName || "—"}</p>
          {order.phone && <p className="text-xs text-gray-400">{order.phone}</p>}
        </td>
        <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell">
          {order.deliveryArea || order.subHubName || "—"}
        </td>
        <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">
          {formatDate(order.createdAt)}
        </td>
        <td className="py-2.5 px-3 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">
          {formatRupees(order.total ?? 0)}
        </td>
        <td className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell">
          <div className="flex flex-wrap gap-1 justify-end">
            {Array.isArray(order.payments) && order.payments.map((p: any, i: number) => (
              <ModeTag key={i} mode={p.mode} amount={p.amount} />
            ))}
            {(!order.payments || order.payments.length === 0) && <span className="text-xs text-gray-400">—</span>}
          </div>
        </td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${sc}`}>
              {order.status === "takeaway" ? "Takeaway" : order.status}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${pc}`}>
              {order.paymentStatus ?? "—"}
            </span>
            {open ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {open && (
        <tr className="border-b border-gray-100 bg-blue-50/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-gray-400 font-medium mb-0.5">Date & Time</p>
                <p className="text-gray-700">{formatDateTime(order.createdAt)}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium mb-0.5">Order Total</p>
                <p className="text-gray-700 font-semibold">{formatRupees(order.total)}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium mb-0.5">Paid Amount</p>
                <p className="text-gray-700 font-semibold">{formatRupees(order.paidAmount ?? 0)}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium mb-0.5">Due Amount</p>
                <p className={`font-semibold ${(order.dueAmount || 0) > 0 ? "text-red-600" : "text-gray-700"}`}>
                  {formatRupees(order.dueAmount ?? 0)}
                </p>
              </div>
              {order.deliveryArea && (
                <div>
                  <p className="text-gray-400 font-medium mb-0.5">Delivery Area</p>
                  <p className="text-gray-700">{order.deliveryArea}</p>
                </div>
              )}
              {order.subHubName && (
                <div>
                  <p className="text-gray-400 font-medium mb-0.5">Hub</p>
                  <p className="text-gray-700">{order.subHubName}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-gray-400 font-medium mb-1">Payment Breakdown</p>
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(order.payments) && order.payments.map((p: any, i: number) => (
                    <span key={i} className="inline-flex flex-col items-start">
                      <ModeTag mode={p.mode} amount={p.amount} />
                      {p.reference && <span className="text-gray-400 text-[10px] ml-1 mt-0.5">Ref: {p.reference}</span>}
                    </span>
                  ))}
                  {(!order.payments || order.payments.length === 0) && <span className="text-gray-400">No payments recorded</span>}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Edit profile dialog (master admin only) ───────────────────────────────────
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

// ── Main person detail page ───────────────────────────────────────────────────
export default function DeliveryReportPersonPage() {
  const params = useParams<{ id: string }>();
  const personId = params.id;
  const [, setLocation] = useLocation();
  const admin = getAdmin();
  const isMasterAdmin = admin?.role === "master_admin";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: daysAgo(30), to: today() });
  const handleApply = () => setApplied({ from, to });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [activeTab, setActiveTab] = useState<"overview" | "orders">("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);

  // Fetch person report
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["delivery-report-person", personId, applied.from, applied.to],
    queryFn: () => {
      const p = new URLSearchParams({ from: applied.from, to: applied.to });
      return apiFetch(`/api/delivery-report/person/${personId}?${p}`);
    },
    enabled: !!personId,
  });

  // Fetch user profile (master admin only)
  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ["delivery-persons-list"],
    queryFn: () => apiFetch(`/api/users?role=delivery_person`),
    enabled: isMasterAdmin,
  });

  const userProfile = useMemo(
    () => (usersData?.users ?? []).find((u: any) => u.id === personId),
    [usersData, personId],
  );

  // Toggle status mutation
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
          const hasMOde = (o.payments ?? []).some((p: any) => (p.mode || "other").toLowerCase() === modeFilter);
          if (!hasMOde) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          return (
            (o.customerName || "").toLowerCase().includes(q) ||
            (o.phone || "").includes(q) ||
            (o.deliveryArea || "").toLowerCase().includes(q) ||
            String(o.orderNumber || "").includes(q) ||
            o.id.slice(-6).toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return sortDir === "desc" ? tb - ta : ta - tb;
      });
  }, [orders, search, statusFilter, modeFilter, sortDir]);

  const displayName = person?.personName ?? userProfile?.name ?? "Delivery Person";
  const ac = avatarColor(displayName);
  const ini = initials(displayName);
  const isActive = userProfile?.status !== "Inactive";
  const hubNames: string[] = userProfile?.subHubNames ?? userProfile?.superHubNames ?? [];

  const modeBreakdown = Object.entries(summary.byMode || {}) as [string, { count: number; amount: number }][];
  const totalPct = (amount: number) =>
    summary.totalRevenue > 0 ? ((amount / summary.totalRevenue) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLocation("/delivery-report")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Delivery Report
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-800 truncate">{displayName}</span>
      </div>

      {/* Person profile header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${ac}`}>
            {userProfile?.profileImageUrl
              ? <img src={userProfile.profileImageUrl} alt={displayName} className="w-full h-full rounded-2xl object-cover" />
              : ini}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">
                Delivery Person
              </span>
              {userProfile && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {isActive ? "● Active" : "○ Inactive"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {userProfile?.phone && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Phone className="w-3.5 h-3.5" /> {userProfile.phone}
                </span>
              )}
              {userProfile?.email && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Mail className="w-3.5 h-3.5" /> {userProfile.email}
                </span>
              )}
              {hubNames.length > 0 && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="w-3.5 h-3.5" /> {hubNames.join(", ")}
                </span>
              )}
              {userProfile?.createdAt && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Calendar className="w-3.5 h-3.5" /> Joined {formatDate(userProfile.createdAt)}
                </span>
              )}
            </div>
          </div>

          {/* CRUD actions (master admin only) */}
          {isMasterAdmin && userProfile && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-8"
                onClick={() => setEditOpen(true)}
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Profile
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`gap-1.5 text-xs h-8 ${isActive ? "text-amber-600 border-amber-200 hover:bg-amber-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}
                onClick={() => setConfirmToggle(true)}
              >
                {isActive
                  ? <><ToggleLeft className="w-3.5 h-3.5" />Deactivate</>
                  : <><ToggleRight className="w-3.5 h-3.5" />Activate</>}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Date filter */}
      <DateFilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} applied={applied} onApply={handleApply} />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      )}

      {isError && (
        <div className="text-center py-12 text-red-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm">Failed to load report. Please try again.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Stats strip — 2-col on mobile */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total Orders"
              value={String(summary.totalOrders)}
              sub={`in ${applied.from === applied.to ? "1 day" : "date range"}`}
              color="text-brand-primary"
              icon={<Truck className="w-4 h-4" />}
            />
            <StatCard
              label="Total Collected"
              value={formatRupees(summary.totalRevenue)}
              sub={(summary.dueAmount || 0) > 0 ? `Due: ${formatRupees(summary.dueAmount)}` : "Fully collected"}
              color="text-green-600"
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
            {modeBreakdown.slice(0, 2).map(([mode, data]) => {
              const m = modeMeta(mode);
              return (
                <StatCard
                  key={mode}
                  label={`${m.label} Collected`}
                  value={formatRupees(data.amount)}
                  sub={`${data.count} transaction${data.count !== 1 ? "s" : ""}`}
                  color={m.color}
                  icon={m.icon as any}
                />
              );
            })}
          </div>

          {/* Tabs — full width on mobile */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(["overview", "orders"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {tab === "overview" ? "Overview" : `Orders (${orders.length})`}
              </button>
            ))}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center justify-center w-9 rounded-lg text-gray-400 hover:text-gray-600 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* ── Overview tab ─────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Payment mode breakdown — mobile-first card list */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-primary" />
                  <h3 className="text-sm font-bold text-gray-800">Payment Mode Breakdown</h3>
                </div>
                {modeBreakdown.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm">No payment data for selected range</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {modeBreakdown.map(([mode, data]) => {
                      const m = modeMeta(mode);
                      const pct = totalPct(data.amount);
                      return (
                        <div key={mode} className="px-4 py-3.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`flex items-center gap-1.5 text-sm font-semibold ${m.color}`}>
                              {m.icon} {m.label}
                            </span>
                            <span className="text-sm font-bold text-gray-800">{formatRupees(data.amount)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
                              {data.count} txn · {pct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">
                        Total · {modeBreakdown.reduce((s, [, d]) => s + d.count, 0)} transactions
                      </span>
                      <span className="text-sm font-bold text-gray-800">{formatRupees(summary.totalRevenue)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily summary — mobile-first card list */}
              {orders.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-primary" />
                    <h3 className="text-sm font-bold text-gray-800">Daily Summary</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
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
                          <div key={date} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800">
                                {new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {stats.orders} order{stats.orders !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <div className="text-right">
                                <p className="text-xs text-gray-400">Collected</p>
                                <p className="text-sm font-semibold text-green-600">{formatRupees(stats.collected)}</p>
                              </div>
                              {stats.due > 0 && (
                                <div className="text-right">
                                  <p className="text-xs text-gray-400">Due</p>
                                  <p className="text-sm font-semibold text-red-500">{formatRupees(stats.due)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Orders tab — mobile-first card list ──────────────────────── */}
          {activeTab === "orders" && (
            <div className="space-y-3">
              {/* Filters */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Search customer, area, order #..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="flex-1 min-w-[110px] h-9 border border-gray-200 rounded-lg text-sm px-2 text-gray-700 bg-white"
                  >
                    <option value="all">All Status</option>
                    <option value="delivered">Delivered</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                    className="flex-1 min-w-[110px] h-9 border border-gray-200 rounded-lg text-sm px-2 text-gray-700 bg-white"
                  >
                    <option value="all">All Modes</option>
                    {allModes.map((m) => (
                      <option key={m} value={m}>{modeMeta(m).label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSortDir((v) => v === "desc" ? "asc" : "desc")}
                    className="h-9 flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 text-sm text-gray-600 bg-white flex-shrink-0"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {sortDir === "desc" ? "Newest" : "Oldest"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-right">
                  {filteredOrders.length} of {orders.length} orders
                </p>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No orders match your filters</p>
                  <button
                    onClick={() => { setSearch(""); setStatusFilter("all"); setModeFilter("all"); }}
                    className="text-xs text-brand-primary mt-2 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  {filteredOrders.map((order) => {
                    const STATUS_COLORS: Record<string, string> = {
                      delivered: "bg-green-100 text-green-700",
                      takeaway: "bg-blue-100 text-blue-700",
                      cancelled: "bg-red-100 text-red-700",
                    };
                    const PAY_COLORS: Record<string, string> = {
                      paid: "bg-green-100 text-green-700",
                      partial: "bg-yellow-100 text-yellow-700",
                      unpaid: "bg-red-100 text-red-700",
                    };
                    return (
                      <div key={order.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-gray-400">
                              #{order.orderNumber ?? String(order.id).slice(-6).toUpperCase()}
                            </p>
                            <p className="text-sm font-semibold text-gray-800 mt-0.5">{order.customerName || "—"}</p>
                            {order.phone && <p className="text-xs text-gray-400">{order.phone}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {order.status === "takeaway" ? "Takeaway" : order.status}
                            </span>
                            {order.paymentStatus && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PAY_COLORS[order.paymentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                                {order.paymentStatus}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {order.createdAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(order.createdAt)}
                            </span>
                          )}
                          {(order.deliveryArea || order.subHubName) && (
                            <span className="flex items-center gap-1 truncate">
                              <Hash className="w-3 h-3" />
                              {order.deliveryArea || order.subHubName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(order.payments) && order.payments.map((p: any, i: number) => (
                              <ModeTag key={i} mode={p.mode} amount={p.amount} />
                            ))}
                            {(!order.payments || order.payments.length === 0) && (
                              <span className="text-xs text-gray-400">No payments</span>
                            )}
                          </div>
                          <span className="text-base font-bold text-gray-800 flex-shrink-0 ml-2">
                            {formatRupees(order.total ?? 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Summary footer */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap gap-3 text-sm">
                    <span className="text-gray-500">
                      <strong className="text-gray-800">{filteredOrders.length}</strong> orders
                    </span>
                    <span className="text-gray-500">
                      Total: <strong className="text-gray-800">
                        {formatRupees(filteredOrders.reduce((s, o) => s + (o.total ?? 0), 0))}
                      </strong>
                    </span>
                    <span className="text-gray-500">
                      Collected: <strong className="text-green-600">
                        {formatRupees(filteredOrders.reduce((s, o) => s + ((o.payments ?? []).reduce((ps: number, p: any) => ps + (Number(p.amount) || 0), 0)), 0))}
                      </strong>
                    </span>
                    {filteredOrders.reduce((s, o) => s + (Number(o.dueAmount) || 0), 0) > 0 && (
                      <span className="text-gray-500">
                        Due: <strong className="text-red-500">
                          {formatRupees(filteredOrders.reduce((s, o) => s + (Number(o.dueAmount) || 0), 0))}
                        </strong>
                      </span>
                    )}
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
