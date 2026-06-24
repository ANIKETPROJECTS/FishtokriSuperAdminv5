import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Truck, Package, IndianRupee, Banknote, CreditCard, Wallet, RefreshCw,
  Calendar, ChevronRight, Users, AlertCircle, TrendingUp, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function getToken() { return localStorage.getItem("fishtokri_token") || ""; }
function getAdmin() {
  try { return JSON.parse(localStorage.getItem("fishtokri_admin") || "null"); } catch { return null; }
}

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`Failed: ${path}`);
  return res.json();
}

function formatRupees(n: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function today() { return new Date().toISOString().slice(0, 10); }
export function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n + 1); return d.toISOString().slice(0, 10);
}
export function thisMonthStart() {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export const MODE_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  cash:   { label: "Cash",   color: "text-green-700",  bg: "bg-green-50 border-green-200",  icon: <Banknote className="w-3.5 h-3.5" /> },
  upi:    { label: "UPI",    color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: <CreditCard className="w-3.5 h-3.5" /> },
  wallet: { label: "Wallet", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    icon: <Wallet className="w-3.5 h-3.5" /> },
  card:   { label: "Card",   color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: <CreditCard className="w-3.5 h-3.5" /> },
  bank:   { label: "Bank",   color: "text-sky-700",    bg: "bg-sky-50 border-sky-200",      icon: <IndianRupee className="w-3.5 h-3.5" /> },
  other:  { label: "Other",  color: "text-gray-700",   bg: "bg-gray-50 border-gray-200",    icon: <IndianRupee className="w-3.5 h-3.5" /> },
};

export function modeMeta(mode: string) {
  return MODE_META[(mode || "").toLowerCase()] ?? { label: mode, color: "text-gray-700", bg: "bg-gray-50 border-gray-200", icon: <IndianRupee className="w-3.5 h-3.5" /> };
}

export function ModeTag({ mode, amount }: { mode: string; amount: number }) {
  const m = modeMeta(mode);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium ${m.color} ${m.bg}`}>
      {m.icon}{m.label}: {formatRupees(amount)}
    </span>
  );
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700", "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700", "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700", "bg-rose-100 text-rose-700",
];
export function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
export function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function DateFilterBar({
  from, to, setFrom, setTo, applied, onApply,
}: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  applied: { from: string; to: string }; onApply: (f?: string, t?: string) => void;
}) {
  const PRESETS = [
    { label: "Today", f: today(), t: today() },
    { label: "Last 7 days", f: daysAgo(7), t: today() },
    { label: "Last 30 days", f: daysAgo(30), t: today() },
  ];
  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      {/* Preset chips — full width, tap-friendly */}
      <div className="flex gap-2">
        {PRESETS.map(({ label, f, t }) => (
          <button
            key={label}
            onClick={() => { setFrom(f); setTo(t); onApply(f, t); }}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              applied.from === f && applied.to === t
                ? "bg-brand-primary text-white"
                : "bg-white text-black border border-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date inputs — auto-apply on change */}
      <div className="flex gap-3 mt-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-black block mb-1">From</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); onApply(e.target.value, to); }}
            className="w-full text-sm h-9 font-medium text-black"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-black block mb-1">To</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); onApply(from, e.target.value); }}
            className="w-full text-sm h-9 font-medium text-black"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryStrip({ summary, personCount }: { summary: any; personCount: number }) {
  const modes = Object.entries(summary.byMode || {}) as [string, { count: number; amount: number }][];
  const walletExtra: number = summary.walletExtra || 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Deliveries</p>
        <p className="text-2xl font-bold text-brand-primary">{summary.totalOrders}</p>
        {personCount > 0 && <p className="text-xs text-gray-400 mt-0.5">{personCount} person{personCount !== 1 ? "s" : ""}</p>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Collected</p>
        <p className="text-2xl font-bold text-green-600">{formatRupees(summary.totalRevenue)}</p>
        {(summary.dueAmount || 0) > 0 && (
          <p className="text-xs text-red-500 mt-0.5">Due: {formatRupees(summary.dueAmount)}</p>
        )}
      </div>
      {walletExtra > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" /> Wallet Extra Collected
          </p>
          <p className="text-2xl font-bold text-blue-600">{formatRupees(walletExtra)}</p>
          <p className="text-xs text-blue-400 mt-0.5">Excess credited to wallets</p>
        </div>
      )}
      {modes.slice(0, walletExtra > 0 ? 2 : 3).map(([mode, data]) => {
        const m = modeMeta(mode);
        return (
          <div key={mode} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <span className={m.color}>{m.icon}</span> {m.label} Collected
            </p>
            <p className={`text-2xl font-bold ${m.color}`}>{formatRupees(data.amount)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{data.count} payment{data.count !== 1 ? "s" : ""}</p>
          </div>
        );
      })}
    </div>
  );
}

function PersonCard({ person, userProfile, onView }: { person: any; userProfile?: any; onView: () => void }) {
  const isPorter = person.personId === "porter_delivery";
  const ac = isPorter ? "bg-orange-100 text-orange-700" : avatarColor(person.personName);
  const ini = isPorter ? "🚚" : initials(person.personName);
  const modes = Object.entries(person.byMode || {}) as [string, { count: number; amount: number }][];
  const phone = userProfile?.phone;
  const hubNames: string[] = userProfile?.subHubNames ?? userProfile?.superHubNames ?? [];
  const isActive = userProfile?.status !== "Inactive";

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow ${isPorter ? "border-orange-300" : "border-gray-200"}`}>
      {/* Card header */}
      <div className={`p-4 flex items-start gap-3 ${isPorter ? "bg-orange-50" : ""}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${ac}`}>
          {!isPorter && userProfile?.profileImageUrl
            ? <img src={userProfile.profileImageUrl} alt={person.personName} className="w-full h-full rounded-full object-cover" />
            : ini}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold truncate ${isPorter ? "text-orange-800" : "text-gray-900"}`}>{person.personName}</p>
            {isPorter ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 bg-orange-100 text-orange-700">Express</span>
            ) : userProfile && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}>{isActive ? "Active" : "Inactive"}</span>
            )}
          </div>
          {isPorter
            ? <p className="text-xs text-orange-600 mt-0.5">All express/porter orders</p>
            : phone && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">📞 {phone}</p>}
          {!isPorter && hubNames.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">🏠 {hubNames.slice(0, 2).join(", ")}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-brand-primary">{person.orderCount}</p>
          <p className="text-xs text-gray-500">Orders</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2.5 text-center">
          <p className="text-sm font-bold text-green-600 truncate">{formatRupees(person.totalRevenue)}</p>
          <p className="text-xs text-gray-500">Collected</p>
        </div>
      </div>

      {/* Payment mode breakdown */}
      {modes.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {modes.map(([mode, data]) => (
            <ModeTag key={mode} mode={mode} amount={data.amount} />
          ))}
        </div>
      )}

      {/* Wallet extra collected */}
      {(person.walletExtra || 0) > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <Wallet className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-600 font-medium">Wallet Extra: {formatRupees(person.walletExtra)}</p>
        </div>
      )}

      {/* Due amount warning */}
      {(person.dueAmount || 0) > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-600 font-medium">Due: {formatRupees(person.dueAmount)}</p>
        </div>
      )}

      {/* View button */}
      <div className="mt-auto border-t border-gray-100 p-3">
        <button
          onClick={onView}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-brand-secondary hover:text-brand-primary hover:bg-gray-50 rounded-lg py-2 transition-colors"
        >
          View Full Report <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function DeliveryReportPage() {
  const admin = getAdmin();
  const isDeliveryPerson = admin?.role === "delivery_person";
  const isMasterAdmin = admin?.role === "master_admin";
  const [, setLocation] = useLocation();

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: today(), to: today() });

  const handleApply = (f?: string, t?: string) => setApplied({ from: f ?? from, to: t ?? to });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["delivery-report", applied.from, applied.to],
    queryFn: () => {
      const p = new URLSearchParams({ from: applied.from, to: applied.to });
      return apiFetch(`/api/delivery-report?${p}`);
    },
  });

  // Fetch user profiles for richer cards (master admin only)
  const { data: usersData } = useQuery({
    queryKey: ["delivery-persons-list"],
    queryFn: () => apiFetch(`/api/users?role=delivery_person`),
    enabled: isMasterAdmin,
  });

  const usersById = useMemo(() => {
    const map: Record<string, any> = {};
    (usersData?.users ?? []).forEach((u: any) => { map[u.id] = u; });
    return map;
  }, [usersData]);

  const summary = data?.summary ?? { totalOrders: 0, totalRevenue: 0, dueAmount: 0, byMode: {} };
  const byPerson: any[] = data?.byPerson ?? [];

  // For delivery person: redirect to their own detail page
  if (!isLoading && !isError && isDeliveryPerson && byPerson.length > 0) {
    const me = byPerson[0];
    setLocation(`/delivery-report/person/${me.personId}`);
    return null;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-primary" />
            Delivery Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Detailed delivery performance and revenue collection by person</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Date filter */}
      <DateFilterBar from={from} to={to} setFrom={setFrom} setTo={setTo} applied={applied} onApply={handleApply} />

      {/* Summary strip */}
      <SummaryStrip summary={summary} personCount={byPerson.length} />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center py-12 text-red-500 text-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60" />
          Failed to load report. Please try again.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && byPerson.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">No delivered orders found</p>
          <p className="text-sm mt-1">Try adjusting the date range</p>
        </div>
      )}

      {/* Person cards grid */}
      {!isLoading && !isError && byPerson.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Delivery Persons ({byPerson.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {byPerson.map((person) => (
              <PersonCard
                key={person.personId}
                person={person}
                userProfile={usersById[person.personId]}
                onView={() => setLocation(`/delivery-report/person/${person.personId}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Overall mode breakdown table */}
      {!isLoading && !isError && byPerson.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-primary" />
            <h3 className="text-sm font-bold text-gray-800">Overall Payment Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-100">
                  <th className="px-5 py-2.5 text-xs font-semibold text-gray-500">Payment Mode</th>
                  <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 text-center">Transactions</th>
                  <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 text-right">Amount Collected</th>
                  <th className="px-5 py-2.5 text-xs font-semibold text-gray-500 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(summary.byMode || {}) as [string, { count: number; amount: number }][]).map(([mode, data]) => {
                  const m = modeMeta(mode);
                  const pct = summary.totalRevenue > 0 ? ((data.amount / summary.totalRevenue) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={mode} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${m.color}`}>
                          {m.icon} {m.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-sm text-gray-600">{data.count}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-gray-800">{formatRupees(data.amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
