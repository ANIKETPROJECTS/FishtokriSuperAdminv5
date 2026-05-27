import { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Plus, Search, Edit2, Trash2, Mail, Phone, Calendar,
  ArrowUpDown, SlidersHorizontal, X, LayoutGrid, LayoutList,
  MapPin, ShoppingBag, ChevronLeft, ChevronRight, Users,
  Home, Clock, CheckCircle2, ClipboardList, Package,
  CreditCard, Truck, UserRound, ChevronDown, ChevronUp, Tag, Wallet, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import iconView from "@/assets/icon-view.png";
import iconEdit from "@/assets/icon-edit.png";
import iconDelete from "@/assets/icon-delete.png";

function MaskIcon({ src, color = "#1A56DB", className = "w-4 h-4" }: { src: string; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block ${className}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

function getToken() {
  return localStorage.getItem("fishtokri_token") || "";
}

function getBase() {
  return import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
}

const CUSTOMERS_QUERY_KEY = ["customers"] as const;
const ACTIVE_ORDER_STATUSES = new Set(["pending", "confirmed", "out_for_delivery"]);

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  walletBalance?: number;
  addresses: any[];
  orders: any[];
  usedCoupons?: any[];
  activeCoupons?: any[];
  currentOrders?: any[];
  orderHistory?: any[];
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

interface CustomersResponse {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
}

async function fetchCustomers(params: {
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<CustomersResponse> {
  const base = getBase();
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${base}/api/customers?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json();
}

async function fetchCustomer(id: string): Promise<Customer> {
  const base = getBase();
  const res = await fetch(`${base}/api/customers/${id}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Failed to fetch customer");
  return json.customer;
}

async function createCustomer(data: Partial<Customer>): Promise<Customer> {
  const base = getBase();
  const res = await fetch(`${base}/api/customers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to create customer");
  return json.customer;
}

async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  const base = getBase();
  const res = await fetch(`${base}/api/customers/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to update customer");
  return json.customer;
}

async function deleteCustomer(id: string): Promise<void> {
  const base = getBase();
  const res = await fetch(`${base}/api/customers/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.message || "Failed to delete customer");
  }
}

async function adjustCustomerWallet(id: string, delta: number, reason?: string): Promise<{ walletBalance: number }> {
  const base = getBase();
  const res = await fetch(`${base}/api/customers/${id}/wallet`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ delta, reason }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to adjust wallet");
  return json;
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
}

function formatDate(dateStr: any) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(dateStr);
  }
}

function formatDateTime(dateStr: any) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(dateStr);
  }
}

function formatRupees(value: any) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString("en-IN")}`;
}

function normalize(value: any) {
  return String(value ?? "").trim().toLowerCase();
}

function getCustomerLocation(customer: Customer) {
  const addr = customer.addresses?.[0];
  if (!addr) return { pincode: null, city: null, name: null };
  return {
    pincode: addr.pincode || addr.zipCode || null,
    city: addr.city || null,
    name: addr.name || null,
  };
}

function getCustomerTotalSpend(customer: Customer) {
  const { all } = splitOrders(customer);
  return all.reduce((sum: number, order: any) => sum + getOrderTotal(order), 0);
}

function getCustomerTotalOrders(customer: Customer) {
  return splitOrders(customer).all.length;
}

function getOrderId(order: any) {
  return String(order?._id ?? order?.id ?? order?.orderId ?? order?.orderNumber ?? "");
}

function getOrderTotal(order: any) {
  if (order?.total !== undefined) return Number(order.total) || 0;
  if (order?.totalAmount !== undefined) return Number(order.totalAmount) || 0;
  if (order?.amount !== undefined) return Number(order.amount) || 0;
  return (order?.items ?? []).reduce((sum: number, item: any) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
}

function getStatusStyle(status: any) {
  const value = normalize(status);
  if (["delivered", "completed", "paid"].includes(value)) return "bg-green-50 text-green-700 border-green-200";
  if (["cancelled", "canceled", "failed", "rejected"].includes(value)) return "bg-red-50 text-red-700 border-red-200";
  if (["out_for_delivery", "shipped", "dispatch", "dispatched"].includes(value)) return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (["confirmed", "preparing", "processing"].includes(value)) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function splitOrders(customer: Customer) {
  const rawOrders = Array.isArray(customer.orders) ? customer.orders : [];
  const current = Array.isArray(customer.currentOrders) ? customer.currentOrders : rawOrders.filter((o) => ACTIVE_ORDER_STATUSES.has(normalize(o?.status)));
  const history = Array.isArray(customer.orderHistory) ? customer.orderHistory : rawOrders.filter((o) => !ACTIVE_ORDER_STATUSES.has(normalize(o?.status)));
  const all = (current.length + history.length) > 0 ? [...current, ...history] : rawOrders;
  return { current, history, all };
}

function stringifyValue(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function addressText(address: any) {
  if (!address) return "—";
  if (typeof address === "string") return address;
  const parts = [
    address.name, address.label, address.type,
    address.houseNo, address.house, address.flatNo, address.apartment,
    address.building, address.street, address.addressLine1, address.addressLine2,
    address.area, address.landmark, address.city, address.state,
    address.pincode, address.zipCode,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : JSON.stringify(address, null, 2);
}

function statusLabel(status: any) {
  return String(status || "unknown").replace(/_/g, " ");
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("createdAt_desc");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);

  const [filterOrders, setFilterOrders] = useState<"all" | "has" | "none">("all");
  const [filterEmail, setFilterEmail] = useState<"all" | "yes" | "no">("all");
  const [filterAddr, setFilterAddr] = useState<"all" | "yes" | "no">("all");
  const [filterJoinedFrom, setFilterJoinedFrom] = useState("");
  const [filterJoinedTo, setFilterJoinedTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const LIMIT = 10;
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    searchTimeout[1](
      setTimeout(() => {
        setDebouncedSearch(val);
        setPage(1);
      }, 400)
    );
  }, [searchTimeout]);

  const queryKey = [...CUSTOMERS_QUERY_KEY, debouncedSearch, sort, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchCustomers({ search: debouncedSearch, sort, page, limit: LIMIT }),
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (filterOrders === "has") result = result.filter((c) => splitOrders(c).all.length > 0);
    if (filterOrders === "none") result = result.filter((c) => splitOrders(c).all.length === 0);
    if (filterEmail === "yes") result = result.filter((c) => !!c.email?.trim());
    if (filterEmail === "no") result = result.filter((c) => !c.email?.trim());
    if (filterAddr === "yes") result = result.filter((c) => (c.addresses?.length ?? 0) > 0);
    if (filterAddr === "no") result = result.filter((c) => (c.addresses?.length ?? 0) === 0);
    if (filterJoinedFrom) result = result.filter((c) => new Date(c.createdAt) >= new Date(filterJoinedFrom));
    if (filterJoinedTo) result = result.filter((c) => new Date(c.createdAt) <= new Date(filterJoinedTo + "T23:59:59"));
    return result;
  }, [customers, filterOrders, filterEmail, filterAddr, filterJoinedFrom, filterJoinedTo]);

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      toast({ title: "Customer deleted" });
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      setDeleteCustomerId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const hasFilters = !!(
    debouncedSearch || sort !== "createdAt_desc" ||
    filterOrders !== "all" || filterEmail !== "all" ||
    filterAddr !== "all" || filterJoinedFrom || filterJoinedTo
  );

  const clearFilters = () => {
    setSearch(""); setDebouncedSearch(""); setSort("createdAt_desc");
    setFilterOrders("all"); setFilterEmail("all"); setFilterAddr("all");
    setFilterJoinedFrom(""); setFilterJoinedTo(""); setPage(1);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
  };

  if (detailCustomerId) {
    return (
      <CustomerDetailPage
        customerId={detailCustomerId}
        onBack={() => setDetailCustomerId(null)}
        onEdit={(customer) => { setDetailCustomerId(null); openEdit(customer); }}
        onDelete={(customer) => { setDetailCustomerId(null); setDeleteCustomerId(customer.id); }}
      />
    );
  }

  const headerSlot = document.getElementById("page-header-slot");

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }}>
      {headerSlot && createPortal(
        <div className="flex items-center justify-between w-full min-w-0">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[#162B4D] leading-tight">Customers</h1>
            <p className="text-xs text-gray-500 leading-tight hidden sm:block">
              Manage all registered customers with saved addresses, current orders and order history.
            </p>
          </div>
          <span className="text-3xl font-bold text-[#162B4D] flex-shrink-0 ml-4">{total}</span>
        </div>,
        headerSlot,
      )}

      <div className="flex items-center justify-between gap-4 mb-5">
        <div />
        <Button
          onClick={() => { setEditingCustomer(null); setIsModalOpen(true); }}
          className="bg-[#1A56DB] hover:bg-[#1447B4] text-white h-9 px-4 text-sm font-semibold flex-shrink-0"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Customer
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-white border-gray-200 h-9 text-sm text-black"
          />
          {search && (
            <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-40 text-sm border-gray-200 bg-white text-black">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt_desc">Newest first</SelectItem>
            <SelectItem value="createdAt_asc">Oldest first</SelectItem>
            <SelectItem value="name_asc">Name (A → Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z → A)</SelectItem>
            <SelectItem value="email_asc">Email (A → Z)</SelectItem>
            <SelectItem value="email_desc">Email (Z → A)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterOrders} onValueChange={(v: any) => { setFilterOrders(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36 text-sm border-gray-200 bg-white text-black">
            <ShoppingBag className="w-3.5 h-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
            <SelectValue placeholder="Orders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            <SelectItem value="has">Has orders</SelectItem>
            <SelectItem value="none">No orders yet</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterEmail} onValueChange={(v: any) => { setFilterEmail(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-32 text-sm border-gray-200 bg-white text-black">
            <Mail className="w-3.5 h-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
            <SelectValue placeholder="Email" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any email</SelectItem>
            <SelectItem value="yes">Has email</SelectItem>
            <SelectItem value="no">No email</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAddr} onValueChange={(v: any) => { setFilterAddr(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36 text-sm border-gray-200 bg-white text-black">
            <MapPin className="w-3.5 h-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
            <SelectValue placeholder="Address" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any address</SelectItem>
            <SelectItem value="yes">Has address</SelectItem>
            <SelectItem value="no">No address</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => setShowDateFilters((v) => !v)}
          className={`h-9 px-3 flex items-center gap-1.5 text-sm border rounded-md transition-colors ${showDateFilters || filterJoinedFrom || filterJoinedTo ? "border-[#1A56DB] bg-blue-50 text-[#1A56DB]" : "border-gray-200 bg-white text-black hover:bg-gray-50"}`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Joined
        </button>

        {showDateFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={filterJoinedFrom} onChange={(e) => { setFilterJoinedFrom(e.target.value); setPage(1); }} className="h-9 w-36 text-sm border-gray-200 bg-white text-black" />
            <span className="text-xs text-black">to</span>
            <Input type="date" value={filterJoinedTo} onChange={(e) => { setFilterJoinedTo(e.target.value); setPage(1); }} className="h-9 w-36 text-sm border-gray-200 bg-white text-black" />
          </div>
        )}

        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-[#1A56DB] hover:underline font-medium flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-black font-medium">{filteredCustomers.length} of {total}</span>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button onClick={() => setViewMode("list")} className={`w-8 h-8 flex items-center justify-center transition-colors ${viewMode === "list" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`} title="List view">
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode("grid")} className={`w-8 h-8 flex items-center justify-center transition-colors ${viewMode === "grid" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`} title="Grid view">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <EmptyState search={debouncedSearch} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCustomers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                onView={() => setDetailCustomerId(c.id)}
                onEdit={() => openEdit(c)}
                onDelete={() => setDeleteCustomerId(c.id)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-20 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-black font-medium">{debouncedSearch ? `No customers found for "${debouncedSearch}".` : "No customers found."}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-semibold text-black uppercase tracking-wide">
                  <th className="px-3 py-4 text-left">Customer</th>
                  <th className="px-3 py-4 text-left">Contact</th>
                  <th className="px-3 py-4 text-left">Location</th>
                  <th className="px-3 py-4 text-right">Total Spend</th>
                  <th className="px-3 py-4 text-center">Total Orders</th>
                  <th className="px-3 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredCustomers.map((c) => {
                  const loc = getCustomerLocation(c);
                  const totalSpend = getCustomerTotalSpend(c);
                  const totalOrders = getCustomerTotalOrders(c);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-4">
                        <p className="font-semibold text-black text-sm">{c.name || "—"}</p>
                        <p className="text-xs text-black mt-0.5">{formatDate(c.createdAt)}</p>
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-sm font-medium text-black">{c.phone || "N.A"}</p>
                        <p className="text-xs text-black mt-0.5">{c.email || "N.A"}</p>
                        <p className="text-xs text-black mt-0.5">{c.dateOfBirth || "N.A"}</p>
                      </td>
                      <td className="px-3 py-4">
                        {loc.pincode || loc.city || loc.name ? (
                          <>
                            {loc.pincode && <p className="text-sm font-medium text-black">{loc.pincode}</p>}
                            {loc.city && <p className="text-xs text-black mt-0.5">{loc.city}</p>}
                            {loc.name && <p className="text-xs text-black mt-0.5">{loc.name}</p>}
                          </>
                        ) : (
                          <span className="text-sm text-black">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4 text-right">
                        <span className="text-sm font-medium text-black">{formatRupees(totalSpend)}</span>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <span className="text-sm text-black">{totalOrders}</span>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailCustomerId(c.id)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
                            title="View details"
                          >
                            <MaskIcon src={iconView} color="#1A56DB" className="w-[18px] h-[18px]" />
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
                          </button>
                          <button
                            onClick={() => setDeleteCustomerId(c.id)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <MaskIcon src={iconDelete} color="#E02424" className="w-[18px] h-[18px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-black">Page {page} of {totalPages} &mdash; {total} customers</p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPage(1)} disabled={page === 1} className="h-8 w-8 p-0 text-xs text-black">«</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-8 px-3 text-sm text-black">
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />Prev
            </Button>
            <span className="h-8 px-3 flex items-center justify-center text-sm font-semibold text-black bg-white border border-gray-200 rounded-md min-w-[36px]">{page}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 px-3 text-sm text-black">
              Next<ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(totalPages)} disabled={page === totalPages} className="h-8 w-8 p-0 text-xs text-black">»</Button>
          </div>
        </div>
      )}

      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={editingCustomer}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY })}
      />
      <DeleteCustomerDialog
        customerId={deleteCustomerId}
        onClose={() => setDeleteCustomerId(null)}
        onConfirm={() => { if (deleteCustomerId) deleteMutation.mutate(deleteCustomerId); }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function CountBadge({ count, activeColor, historyColor }: { count: number; activeColor?: boolean; historyColor?: boolean }) {
  if (count === 0) return <span className="text-sm text-black">0</span>;
  const cls = activeColor
    ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
    : historyColor
    ? "bg-amber-50 text-amber-700 border border-amber-100"
    : "bg-blue-50 text-blue-700 border border-blue-100";
  return (
    <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {count}
    </span>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="py-20 text-center">
      <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-black font-medium">{search ? `No customers match "${search}"` : "No customers yet."}</p>
    </div>
  );
}

function CustomerCard({ customer: c, onView, onEdit, onDelete }: { customer: Customer; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const { current, history } = splitOrders(c);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div>
        <p className="font-semibold text-black text-sm">{c.name || "—"}</p>
        <p className="text-xs text-black mt-0.5">{formatDate(c.createdAt)}</p>
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium text-black">{c.phone || "N.A"}</div>
        <div className="text-xs text-black">{c.email || "N.A"}</div>
        <div className="text-xs text-black">{c.dateOfBirth || "N.A"}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Addrs" value={c.addresses?.length ?? 0} />
        <MiniStat label="Active" value={current.length} />
        <MiniStat label="History" value={history.length} />
      </div>
      <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-1">
        <button onClick={onView} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors" title="View details">
          <MaskIcon src={iconView} color="#1A56DB" className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onEdit} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors" title="Edit">
          <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onDelete} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors" title="Delete">
          <MaskIcon src={iconDelete} color="#E02424" className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <p className="text-sm font-bold text-black">{value}</p>
      <p className="text-[10px] text-black truncate">{label}</p>
    </div>
  );
}

function WalletTopupModal({
  customer,
  open,
  onClose,
  onSuccess,
}: {
  customer: Customer;
  open: boolean;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}) {
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: ({ delta, reason }: { delta: number; reason: string }) =>
      adjustCustomerWallet(customer.id, delta, reason || undefined),
    onSuccess: (data) => {
      toast({
        title: type === "credit" ? "Wallet credited" : "Wallet debited",
        description: `${type === "credit" ? "Added" : "Deducted"} ₹${Math.abs(Number(amount)).toLocaleString("en-IN")}. New balance: ₹${Number(data.walletBalance).toLocaleString("en-IN")}`,
      });
      onSuccess(data.walletBalance);
      handleClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setAmount("");
    setReason("");
    setError("");
    setType("credit");
    onClose();
  };

  const handleSubmit = () => {
    const num = Number(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }
    if (type === "debit" && num > (Number(customer.walletBalance) || 0)) {
      setError(`Cannot deduct more than the current balance (₹${Number(customer.walletBalance).toLocaleString("en-IN")}).`);
      return;
    }
    setError("");
    const delta = type === "credit" ? num : -num;
    mutation.mutate({ delta, reason });
  };

  const currentBalance = Number(customer.walletBalance) || 0;
  const numAmount = Number(amount) || 0;
  const previewBalance = type === "credit" ? currentBalance + numAmount : Math.max(0, currentBalance - numAmount);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-black flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-500" />
            Adjust Wallet — {customer.name || "Customer"}
          </DialogTitle>
          <DialogDescription>
            Credit or debit the customer's wallet balance directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <Wallet className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-[11px] text-blue-600 font-medium">Current Wallet Balance</p>
              <p className="text-lg font-bold text-blue-700">₹{currentBalance.toLocaleString("en-IN")}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-black">Transaction Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setType("credit"); setError(""); }}
                className={`h-9 rounded-lg border text-xs font-semibold transition-colors ${
                  type === "credit"
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-emerald-200 hover:text-emerald-600"
                }`}
              >
                + Credit (Add)
              </button>
              <button
                type="button"
                onClick={() => { setType("debit"); setError(""); }}
                className={`h-9 rounded-lg border text-xs font-semibold transition-colors ${
                  type === "debit"
                    ? "bg-red-500 border-red-500 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-red-200 hover:text-red-600"
                }`}
              >
                − Debit (Deduct)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-black">Amount (₹) <span className="text-red-500">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">₹</span>
              <Input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(""); }}
                placeholder="0"
                className={`pl-7 ${error ? "border-red-400" : ""}`}
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-black">Reason / Note <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Refund, Promotional credit, Adjustment…"
            />
          </div>

          {numAmount > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs">
              <span className="text-gray-500">New balance after {type === "credit" ? "credit" : "debit"}</span>
              <span className={`text-sm font-bold ${type === "credit" ? "text-emerald-600" : "text-red-600"}`}>
                ₹{previewBalance.toLocaleString("en-IN")}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !amount}
            className={type === "credit" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
          >
            {mutation.isPending ? "Processing…" : type === "credit" ? "Credit Wallet" : "Debit Wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailPage({
  customerId, onBack, onEdit, onDelete,
}: {
  customerId: string;
  onBack: () => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}) {
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => fetchCustomer(customerId),
    enabled: !!customerId,
  });

  // Auto-refresh every 30 seconds, same cadence as orders page.
  useEffect(() => {
    const id = setInterval(() => { refetch(); }, 30000);
    return () => clearInterval(id);
  }, [refetch]);

  const fullCustomer = data ?? null;
  const { current, history, all } = useMemo(
    () => (fullCustomer ? splitOrders(fullCustomer) : { current: [], history: [], all: [] }),
    [fullCustomer]
  );
  const totalSpend = all.reduce((sum: number, order: any) => sum + getOrderTotal(order), 0);

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }}>
      {fullCustomer && walletModalOpen && (
        <WalletTopupModal
          customer={fullCustomer}
          open={walletModalOpen}
          onClose={() => setWalletModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
            setWalletModalOpen(false);
          }}
        />
      )}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-[#1A56DB] hover:text-[#1447B4] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Customers
        </button>
        <div className="flex items-center gap-2">
          {fullCustomer && (
            <>
              <button
                onClick={() => setWalletModalOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-gray-200 bg-white text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
              >
                <Wallet className="w-[14px] h-[14px]" />
                Wallet
              </button>
              <button
                onClick={() => onEdit(fullCustomer)}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-gray-200 bg-white text-black hover:bg-blue-50 hover:border-blue-200 hover:text-[#1A56DB] transition-colors"
              >
                <MaskIcon src={iconEdit} color="#1A56DB" className="w-[14px] h-[14px]" />
                Edit Customer
              </button>
              <button
                onClick={() => onDelete(fullCustomer)}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-gray-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                <MaskIcon src={iconDelete} color="#E02424" className="w-[14px] h-[14px]" />
                Delete
              </button>
            </>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-[#1A56DB] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <div className="grid grid-cols-5 gap-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4">
          Failed to load customer details. Please go back and try again.
        </div>
      ) : !fullCustomer ? null : (
        <div className="space-y-4">
          {/* Profile header card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 flex flex-wrap items-start gap-4">
              <Avatar className="h-14 w-14 flex-shrink-0">
                <AvatarFallback className={`text-lg font-bold ${getAvatarColor(fullCustomer.name || "?")}`}>
                  {fullCustomer.name ? getInitials(fullCustomer.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-[#162B4D]">{fullCustomer.name || "Unnamed customer"}</h2>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#F05B4E]" />{fullCustomer.phone || "N.A"}</span>
                  <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" />{fullCustomer.email || "N.A"}</span>
                  {fullCustomer.dateOfBirth && (
                    <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />DOB: {fullCustomer.dateOfBirth}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">Customer since {formatDate(fullCustomer.createdAt)}</p>
              </div>
            </div>
            {/* Stats strip — no card backgrounds, just dividers */}
            <div className="border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-gray-100">
              <SummaryCard label="Addresses" value={fullCustomer.addresses?.length ?? 0} icon={Home} color="text-[#364F9F]" />
              <SummaryCard label="Active Orders" value={current.length} icon={Clock} color="text-indigo-500" />
              <SummaryCard label="Order History" value={history.length} icon={CheckCircle2} color="text-emerald-500" />
              <SummaryCard label="All Orders" value={all.length} icon={ClipboardList} color="text-amber-500" />
              <SummaryCard label="Total Spend" value={formatRupees(totalSpend)} icon={CreditCard} color="text-[#F05B4E]" />
              <SummaryCard label="Wallet Balance" value={formatRupees(Number(fullCustomer.walletBalance) || 0)} icon={Wallet} color="text-blue-500" />
            </div>
          </div>

          {/* Personal details */}
          <DetailSection title="Personal & Account Details" icon={UserRound}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <InfoRow label="Name" value={fullCustomer.name} />
              <InfoRow label="Phone" value={fullCustomer.phone} />
              <InfoRow label="Email" value={fullCustomer.email} />
              <InfoRow label="Date of Birth" value={fullCustomer.dateOfBirth} />
              <InfoRow label="Created" value={formatDateTime(fullCustomer.createdAt)} />
              <InfoRow label="Updated" value={formatDateTime(fullCustomer.updatedAt)} />
            </div>
          </DetailSection>

          {/* Addresses */}
          <DetailSection title={`Saved Addresses (${fullCustomer.addresses?.length ?? 0})`} icon={MapPin}>
            {fullCustomer.addresses?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fullCustomer.addresses.map((address: any, index: number) => (
                  <AddressCard key={index} address={address} index={index} />
                ))}
              </div>
            ) : <EmptyPanel text="No saved addresses found for this customer." />}
          </DetailSection>

          {/* Active Orders */}
          <CollapsibleDetailSection title={`Active Orders (${current.length})`} icon={Clock} defaultOpen={current.length > 0 && current.length <= 5}>
            <OrderList orders={current} empty="No active orders found for this customer." />
          </CollapsibleDetailSection>

          {/* Order History */}
          <CollapsibleDetailSection title={`Order History (${history.length})`} icon={ShoppingBag} defaultOpen={history.length > 0 && history.length <= 5}>
            <OrderList orders={history} empty="No completed or past orders found for this customer." />
          </CollapsibleDetailSection>

          {/* Active Coupons — locked in pending/in-progress orders */}
          <CollapsibleDetailSection title={`Active Coupons (${fullCustomer.activeCoupons?.length ?? 0})`} icon={Tag} defaultOpen={!!fullCustomer.activeCoupons?.length}>
            <ActiveCouponsList coupons={fullCustomer.activeCoupons ?? []} />
          </CollapsibleDetailSection>

          {/* Used Coupons */}
          <CollapsibleDetailSection title={`Used Coupons (${fullCustomer.usedCoupons?.length ?? 0})`} icon={Tag} defaultOpen>
            <UsedCouponsList coupons={fullCustomer.usedCoupons ?? []} />
          </CollapsibleDetailSection>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: any; icon: any; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-4 px-2 gap-0.5">
      <Icon className={`w-4 h-4 ${color} mb-1`} />
      <p className="text-xl font-bold text-[#162B4D]">{value}</p>
      <p className="text-[11px] text-gray-500 font-medium text-center">{label}</p>
    </div>
  );
}

function DetailSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h4 className="flex items-center gap-2 text-sm font-bold text-black mb-4">
        <Icon className="w-4 h-4 text-[#1A56DB]" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function CollapsibleDetailSection({ title, icon: Icon, children, defaultOpen = true }: { title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 p-5 text-left">
        <h4 className="flex items-center gap-2 text-sm font-bold text-black">
          <Icon className="w-4 h-4 text-[#1A56DB]" />{title}
        </h4>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function ActiveCouponsList({ coupons }: { coupons: any[] }) {
  if (!coupons.length) {
    return <p className="text-xs text-gray-400 py-2">No coupons currently locked in active orders.</p>;
  }
  return (
    <div className="space-y-2">
      {coupons.map((c: any, i: number) => {
        const code = c.couponCode || c.code || "—";
        const title = c.couponTitle || c.title || "";
        const orderId = c.orderId || "";
        const appliedAt = c.appliedAt ? new Date(c.appliedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
        return (
          <div key={i} className="rounded-xl border border-amber-100 bg-amber-50 p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Tag className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-block bg-amber-100 text-amber-800 text-sm font-bold px-2.5 py-0.5 rounded-lg tracking-wider font-mono border border-amber-200">{code}</span>
                <span className="inline-block bg-amber-50 text-amber-700 text-[11px] font-medium px-2 py-0.5 rounded-full border border-amber-200">Locked — order in progress</span>
              </div>
              {title && <p className="text-xs text-gray-600">{title}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
                {orderId && <span>Order: <span className="font-mono text-gray-700">{String(orderId).slice(-8).toUpperCase()}</span></span>}
                {appliedAt && <span>Applied: {appliedAt}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UsedCouponsList({ coupons }: { coupons: any[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("used_desc");
  const [locationFilter, setLocationFilter] = useState("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const allLocations = useMemo(() => {
    const s = new Set<string>();
    coupons.forEach((c) => { const loc = c.location || c.subHub || c.area || ""; if (loc) s.add(loc); });
    return Array.from(s);
  }, [coupons]);

  const filtered = useMemo(() => {
    let result = coupons;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => {
        const code = (c.code || c.couponCode || "").toLowerCase();
        const loc = (c.location || c.subHub || c.area || "").toLowerCase();
        return code.includes(q) || loc.includes(q);
      });
    }
    if (locationFilter !== "all") result = result.filter((c) => (c.location || c.subHub || c.area || "") === locationFilter);
    result = [...result].sort((a, b) => {
      if (sort === "code_asc") return (a.code || a.couponCode || "").localeCompare(b.code || b.couponCode || "");
      if (sort === "recent") return new Date(b.usedAt || b.lastUsedAt || 0).getTime() - new Date(a.usedAt || a.lastUsedAt || 0).getTime();
      return new Date(b.usedAt || b.lastUsedAt || 0).getTime() - new Date(a.usedAt || a.lastUsedAt || 0).getTime();
    });
    return result;
  }, [coupons, search, sort, locationFilter]);

  if (!coupons.length) return <EmptyPanel text="No coupons used by this customer." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search coupons..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-[#1A56DB] text-black" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="h-7 px-2 text-xs border border-gray-200 rounded-lg bg-white text-black outline-none focus:ring-1 focus:ring-[#1A56DB]">
          <option value="recent">Recently used</option>
          <option value="code_asc">Code (A → Z)</option>
        </select>
        {allLocations.length > 0 && (
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-lg bg-white text-black outline-none focus:ring-1 focus:ring-[#1A56DB]">
            <option value="all">All locations</option>
            {allLocations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        )}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white ml-auto">
          <button onClick={() => setLayout("grid")} className={`w-7 h-7 flex items-center justify-center transition-colors ${layout === "grid" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`}><LayoutGrid className="w-3 h-3" /></button>
          <button onClick={() => setLayout("list")} className={`w-7 h-7 flex items-center justify-center transition-colors ${layout === "list" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`}><LayoutList className="w-3 h-3" /></button>
        </div>
      </div>
      {filtered.length === 0 ? <EmptyPanel text="No coupons match your search." /> : (
        <div className={layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-2"}>
          {filtered.map((coupon: any, index: number) => {
            const code = coupon.code || coupon.couponCode || "—";
            const location = coupon.location || coupon.subHub || coupon.area || "";
            const lastUsedAt = coupon.usedAt || coupon.lastUsedAt || coupon.lastUsed || "";
            return (
              <div key={index} className="rounded-xl border border-gray-100 bg-white p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5"><Tag className="w-4 h-4 text-green-600" /></div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block bg-green-50 text-green-700 text-sm font-bold px-2.5 py-1 rounded-lg tracking-wider font-mono border border-green-100">{code}</span>
                  </div>
                  {location && <div className="flex items-center gap-1 text-xs text-black"><MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" /><span>{location}</span></div>}
                  {lastUsedAt && <div className="flex items-center gap-1 text-xs text-black"><Clock className="w-3 h-3 flex-shrink-0" /><span>Last used: {formatDateTime(lastUsedAt)}</span></div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length < coupons.length && <p className="text-xs text-black text-center">Showing {filtered.length} of {coupons.length} coupons</p>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-black opacity-50">{label}</p>
      <p className="text-sm font-medium text-black mt-1 break-words whitespace-pre-wrap">{stringifyValue(value)}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-white py-8 text-center text-sm text-black">{text}</div>;
}

function AddressCard({ address, index }: { address: any; index: number }) {
  if (!address) return null;
  if (typeof address === "string") {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><MapPin className="w-4 h-4 text-blue-600" /></div>
        <p className="text-sm text-black">{address}</p>
      </div>
    );
  }
  const label = address.label || address.type || `Address ${index + 1}`;
  const contactName = address.name || address.contactName || "";
  const phone = address.phone || address.contactPhone || address.mobile || "";
  const houseNo = address.houseNo || address.flatNo || address.house || address.apartment || "";
  const building = address.building || address.buildingName || address.society || "";
  const street = address.street || address.streetName || address.road || address.addressLine1 || "";
  const area = address.area || address.locality || address.neighbourhood || "";
  const landmark = address.landmark || "";
  const city = address.city || "";
  const state = address.state || "";
  const pincode = address.pincode || address.zipCode || address.zip || "";
  const instructions = address.instructions || address.deliveryInstructions || "";
  const addressLines = [
    [houseNo, building].filter(Boolean).join(", "),
    [street, area].filter(Boolean).join(", "),
    landmark ? `Near ${landmark}` : "",
    [city, state, pincode].filter(Boolean).join(", "),
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5"><MapPin className="w-4 h-4 text-blue-600" /></div>
        <div className="min-w-0 flex-1">
          <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full mb-2 capitalize">{label}</span>
          {contactName && <p className="text-sm font-semibold text-black">{contactName}</p>}
          {phone && <p className="text-xs text-black mt-0.5">{phone}</p>}
          <div className="mt-2 space-y-0.5">{addressLines.map((line, i) => <p key={i} className="text-sm text-black">{line}</p>)}</div>
          {instructions && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-100">Delivery note: {instructions}</p>}
        </div>
      </div>
    </div>
  );
}

const ORDER_SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
  { value: "status_asc", label: "Status (A → Z)" },
];

function OrderList({ orders, empty }: { orders: any[]; empty: string }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [layout, setLayout] = useState<"list" | "grid">("list");

  const allStatuses = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => { if (o.status) s.add(normalize(o.status)); });
    return Array.from(s);
  }, [orders]);

  const filtered = useMemo(() => {
    let result = orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) => {
        const ref = shortOrderRef(o, 0).toLowerCase();
        const items = (Array.isArray(o.items) ? o.items : []).map((i: any) => (i.name || i.productName || "").toLowerCase()).join(" ");
        const addr = addressText(o.deliveryAddress || o.address || "").toLowerCase();
        return ref.includes(q) || items.includes(q) || addr.includes(q) || normalize(o.status).includes(q);
      });
    }
    if (statusFilter !== "all") result = result.filter((o) => normalize(o.status) === statusFilter);
    result = [...result].sort((a, b) => {
      if (sort === "date_asc") return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (sort === "amount_desc") return getOrderTotal(b) - getOrderTotal(a);
      if (sort === "amount_asc") return getOrderTotal(a) - getOrderTotal(b);
      if (sort === "status_asc") return normalize(a.status).localeCompare(normalize(b.status));
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return result;
  }, [orders, search, sort, statusFilter]);

  if (!orders.length) return <EmptyPanel text={empty} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-[#1A56DB] text-black" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="h-7 px-2 text-xs border border-gray-200 rounded-lg bg-white text-black outline-none focus:ring-1 focus:ring-[#1A56DB]">
          {ORDER_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-7 px-2 text-xs border border-gray-200 rounded-lg bg-white text-black outline-none focus:ring-1 focus:ring-[#1A56DB]">
          <option value="all">All statuses</option>
          {allStatuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white ml-auto">
          <button onClick={() => setLayout("list")} className={`w-7 h-7 flex items-center justify-center transition-colors ${layout === "list" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`}><LayoutList className="w-3 h-3" /></button>
          <button onClick={() => setLayout("grid")} className={`w-7 h-7 flex items-center justify-center transition-colors ${layout === "grid" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`}><LayoutGrid className="w-3 h-3" /></button>
        </div>
      </div>
      {filtered.length === 0 ? <EmptyPanel text="No orders match your search or filters." /> : layout === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((order, index) => <OrderCardCompact key={getOrderId(order) || index} order={order} index={index} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order, index) => <OrderCard key={getOrderId(order) || index} order={order} index={index} />)}
        </div>
      )}
      {filtered.length < orders.length && <p className="text-xs text-black text-center">Showing {filtered.length} of {orders.length} orders</p>}
    </div>
  );
}

function shortOrderRef(order: any, index: number) {
  const id = getOrderId(order);
  if (order.orderNumber) return `#${order.orderNumber}`;
  if (id && id.length >= 8) return `#${id.slice(-8).toUpperCase()}`;
  return `Order ${index + 1}`;
}

function getOrderBillAddress(order: any): string {
  const addr = order.deliveryAddress || order.address;
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  const parts = [
    addr.houseNo || addr.flatNo || addr.house || addr.building,
    addr.street || addr.addressLine1 || addr.area || addr.locality,
    addr.landmark ? `Near ${addr.landmark}` : "",
    addr.city,
    addr.pincode || addr.zipCode,
  ].filter(Boolean);
  return parts.join(", ");
}

function OrderCardCompact({ order, index }: { order: any; index: number }) {
  const ref = shortOrderRef(order, index);
  const items = Array.isArray(order.items) ? order.items : [];
  const totalAmt = Number(order.total ?? order.grandTotal ?? order.totalAmount ?? getOrderTotal(order));
  const subHubName = order.subHubName ?? order.subHub ?? order.location ?? "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Invoice header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-gray-100">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Tax Invoice</p>
          <p className="text-xs font-bold text-[#162B4D]">FishTokri{subHubName ? ` · ${subHubName}` : ""}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-bold text-[#364F9F]">{ref}</p>
          <p className="text-[10px] text-gray-400">{formatDateTime(order.createdAt ?? order.orderDate)}</p>
        </div>
      </div>
      <div className="px-5 py-3 flex items-center justify-between gap-2">
        <span className={`inline-flex border items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${getStatusStyle(order.status)}`}>{statusLabel(order.status)}</span>
        <span className="text-sm font-bold text-[#162B4D]">{formatRupees(totalAmt)}</span>
      </div>
      {items.length > 0 && (
        <div className="px-5 pb-3">
          <p className="text-[10px] text-gray-400 truncate">{items.map((i: any) => i.name || i.productName || "Item").join(", ")}</p>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, index }: { order: any; index: number }) {
  const ref = shortOrderRef(order, index);
  const items = Array.isArray(order.items) ? order.items : [];
  const grandTotal = order.total ?? order.grandTotal ?? order.totalAmount;
  const subtotal = order.subtotal ?? order.subTotal;
  const deliveryFee = order.deliveryFee ?? order.deliveryCharge ?? null;
  const slotCharge = order.slotCharge ?? order.timeslotCharge ?? null;
  const instantDelivery = order.instantDeliveryCharge ?? order.instantDelivery ?? null;
  const couponDiscount = Number(order.couponDiscount ?? order.discount ?? 0);
  const couponCode = (
    order.couponCode
    ?? (Array.isArray(order.couponCodes) && order.couponCodes.length ? order.couponCodes.join(", ") : null)
    ?? order.coupon
    ?? ""
  );
  const tax = order.tax ?? order.gst ?? order.taxAmount ?? null;
  const notes = order.notes ?? order.orderNotes ?? "";
  const billName = order.customerName ?? order.name ?? "";
  const billPhone = order.phone ?? order.customerPhone ?? order.mobile ?? "";
  const billAddr = getOrderBillAddress(order);
  const paymentMethod = order.paymentMethod ?? order.paymentMode ?? order.payment ?? "";
  const paymentStatus = order.paymentStatus ?? "";
  const paidAmount = Number(order.paidAmount ?? order.paid ?? 0);
  const totalAmt = Number(grandTotal ?? getOrderTotal(order));
  const dueAmount = order.dueAmount != null ? Number(order.dueAmount) : Math.max(0, totalAmt - paidAmount);
  const subHubName = order.subHubName ?? order.subHub ?? order.location ?? "";
  const isPaid = paymentStatus && normalize(paymentStatus) === "paid";
  const isUnpaid = paymentStatus && ["unpaid", "pending", "due"].includes(normalize(paymentStatus));

  const computedSubtotal = subtotal != null
    ? Number(subtotal)
    : items.reduce((s: number, i: any) => s + (Number(i.price ?? 0) * Number(i.quantity ?? 1)), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Invoice header ── */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-gray-100">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Tax Invoice</p>
          <p className="text-xs text-gray-500 mt-0.5">FishTokri{subHubName ? ` · ${subHubName}` : ""}</p>
        </div>
        <div className="text-right flex items-start gap-3">
          <div>
            <p className="text-sm font-bold text-[#364F9F]">{ref}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(order.createdAt ?? order.orderDate)}</p>
          </div>
          <span className={`inline-flex border items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize flex-shrink-0 ${getStatusStyle(order.status)}`}>{statusLabel(order.status)}</span>
        </div>
      </div>

      {/* ── Bill To ── */}
      {(billName || billPhone || billAddr) && (
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Bill To</p>
          {billName && <p className="text-sm font-bold text-[#162B4D]">{billName}</p>}
          {billPhone && <p className="text-xs text-gray-500 mt-0.5">{billPhone}</p>}
          {billAddr && <p className="text-xs text-gray-500 mt-0.5">{billAddr}</p>}
        </div>
      )}

      {/* ── Items table ── */}
      {items.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 pb-2 border-b border-dashed border-gray-200">
            <span className="flex-1">Item</span>
            <span className="w-10 text-center">Qty</span>
            <span className="w-20 text-right">Rate</span>
            <span className="w-20 text-right">Amount</span>
          </div>
          <div className="space-y-2">
            {items.map((item: any, i: number) => {
              const name = item.name ?? item.productName ?? item.title ?? `Item ${i + 1}`;
              const qty = Number(item.quantity ?? 1);
              const rate = Number(item.price ?? item.rate ?? item.unitPrice ?? 0);
              const amount = Number(item.total ?? item.amount ?? (rate * qty));
              return (
                <div key={i} className="flex items-start text-sm">
                  <span className="flex-1 text-[#162B4D] font-medium pr-2">{name}</span>
                  <span className="w-10 text-center text-gray-600">{qty}</span>
                  <span className="w-20 text-right text-gray-600">{formatRupees(rate)}</span>
                  <span className="w-20 text-right font-medium text-[#162B4D]">{formatRupees(amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Totals breakdown ── */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatRupees(computedSubtotal)}</span>
        </div>
        {deliveryFee != null && (
          <div className="flex justify-between text-gray-600">
            <span>Delivery Fee</span>
            <span className={Number(deliveryFee) === 0 ? "text-emerald-600 font-medium" : ""}>{Number(deliveryFee) === 0 ? "FREE" : formatRupees(deliveryFee)}</span>
          </div>
        )}
        {slotCharge != null && Number(slotCharge) > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Slot Charge</span>
            <span>+ {formatRupees(slotCharge)}</span>
          </div>
        )}
        {instantDelivery != null && Number(instantDelivery) > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Instant Delivery</span>
            <span>+ {formatRupees(instantDelivery)}</span>
          </div>
        )}
        {couponDiscount > 0 && (
          <div className="flex justify-between text-emerald-600 font-medium">
            <span>Coupon Discount{couponCode ? ` (${couponCode})` : ""}</span>
            <span>−{formatRupees(couponDiscount)}</span>
          </div>
        )}
        {tax != null && (
          <div className="flex justify-between text-gray-600">
            <span>GST {typeof tax === "number" && tax <= 30 ? `(${tax}%)` : ""}</span>
            <span>{typeof tax === "number" && tax <= 30 ? "Included" : formatRupees(tax)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 font-bold text-[#162B4D]">
          <span>Grand Total</span>
          <span className="text-[#F05B4E]">{formatRupees(totalAmt)}</span>
        </div>
      </div>

      {/* ── Payment ── */}
      {(paymentMethod || paymentStatus) && (
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Payment</p>
            {paymentStatus && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : isUnpaid ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{paymentStatus}</span>
            )}
          </div>
          {paymentMethod && <p className="text-xs text-gray-500 mb-3">{paymentMethod}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Paid</p>
              <p className="text-base font-bold text-[#162B4D] mt-0.5">{formatRupees(paidAmount)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Due</p>
              <p className={`text-base font-bold mt-0.5 ${dueAmount > 0 ? "text-[#F05B4E]" : "text-[#162B4D]"}`}>{formatRupees(dueAmount)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {notes && (
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="rounded-lg bg-[#162B4D] text-white px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Order Notes</p>
            <p className="text-xs">{notes}</p>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="px-5 py-3 text-center">
        <p className="text-[11px] text-gray-400">Thank you for shopping with FishTokri!</p>
      </div>
    </div>
  );
}

type AddressDraft = {
  label: string; type: string; name: string; phone: string;
  building: string; street: string; area: string;
  pincode: string; instructions: string; isDefault: boolean;
};

function emptyAddress(): AddressDraft {
  return { label: "Home", type: "house", name: "", phone: "", building: "", street: "", area: "", pincode: "", instructions: "", isDefault: false };
}

function addressFromExisting(a: any): AddressDraft {
  const existingHouse = a?.houseNo ?? a?.flatNo ?? a?.house ?? a?.apartment ?? "";
  const existingBuilding = a?.building ?? a?.buildingName ?? a?.society ?? "";
  return {
    label: a?.label ?? a?.type ?? "Home",
    type: a?.type ?? "house",
    name: a?.name ?? a?.contactName ?? "",
    phone: a?.phone ?? a?.contactPhone ?? a?.mobile ?? "",
    building: [existingHouse, existingBuilding].filter(Boolean).join(", "),
    street: a?.street ?? a?.streetName ?? a?.road ?? a?.addressLine1 ?? "",
    area: a?.area ?? a?.locality ?? a?.neighbourhood ?? "",
    pincode: a?.pincode ?? a?.zipCode ?? a?.zip ?? "",
    instructions: a?.instructions ?? a?.deliveryInstructions ?? "",
    isDefault: !!a?.isDefault,
  };
}

function CustomerModal({ isOpen, onClose, customer, onSuccess }: {
  isOpen: boolean; onClose: () => void; customer: Customer | null; onSuccess: () => void;
}) {
  const isEditing = !!customer;
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [walletBalance, setWalletBalance] = useState("");
  const [addresses, setAddresses] = useState<AddressDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = useCallback(() => {
    setName(customer?.name ?? ""); setEmail(customer?.email ?? "");
    setPhone(customer?.phone ?? ""); setDob(customer?.dateOfBirth ?? "");
    setWalletBalance(String(Number(customer?.walletBalance) || 0));
    setAddresses(Array.isArray(customer?.addresses) && customer!.addresses.length ? customer!.addresses.map(addressFromExisting) : []);
    setErrors({});
  }, [customer]);

  useEffect(() => { if (isOpen) reset(); }, [isOpen, reset]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => createCustomer(data),
    onSuccess: () => { toast({ title: "Customer created successfully" }); onSuccess(); onClose(); },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => updateCustomer(customer!.id, data),
    onSuccess: () => { toast({ title: "Customer updated successfully" }); onSuccess(); onClose(); },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const updateAddress = (idx: number, patch: Partial<AddressDraft>) => {
    setAddresses((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!phone.trim()) e.phone = "Phone is required";
    else if (!/^\d{10}$/.test(phone.trim())) e.phone = "Phone must be exactly 10 digits";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Invalid email format";
    if (dob.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) e.dob = "Use YYYY-MM-DD format";
    addresses.forEach((a, i) => {
      const hasAny = a.name || a.phone || a.building || a.street || a.area || a.pincode;
      if (hasAny) {
        if (!a.name.trim()) e[`addr_${i}_name`] = "Full name is required";
        if (!a.phone.trim()) e[`addr_${i}_phone`] = "Phone is required";
        else if (!/^\d{10}$/.test(a.phone.trim())) e[`addr_${i}_phone`] = "Phone must be 10 digits";
        if (!a.building.trim()) e[`addr_${i}_building`] = "Building / Flat No is required";
        if (!a.area.trim()) e[`addr_${i}_area`] = "Area / Suburb is required";
        if (!a.pincode.trim()) e[`addr_${i}_pincode`] = "Pincode required";
        else if (!/^\d{6}$/.test(a.pincode.trim())) e[`addr_${i}_pincode`] = "Pincode must be 6 digits";
      }
    });
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) { toast({ title: "Please fix the highlighted errors", variant: "destructive" }); return; }
    const cleanAddresses = addresses
      .map((a) => {
        const out: Record<string, any> = {};
        (Object.keys(a) as (keyof AddressDraft)[]).forEach((k) => {
          const v = a[k];
          if (typeof v === "string") { if (v.trim()) out[k] = v.trim(); } else if (v) out[k] = v;
        });
        return out;
      })
      .filter((a) => Object.keys(a).filter((k) => k !== "label" && k !== "type").length > 0);
    const payload: any = { name: name.trim(), email: email.trim(), phone: phone.trim(), dateOfBirth: dob.trim(), addresses: cleanAddresses };
    if (isEditing) {
      payload.walletBalance = Math.max(0, Number(walletBalance) || 0);
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-black">{isEditing ? "Edit Customer" : "Add Customer"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the customer's profile, contact info and saved addresses." : "Capture the customer's full profile, contact info and one or more delivery addresses."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <section className="rounded-xl border border-gray-100 bg-gray-50/40 p-4">
            <h4 className="text-sm font-bold text-black mb-3 flex items-center gap-2">
              <UserRound className="w-4 h-4 text-[#1A56DB]" />Personal details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Full name" required error={errors.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={errors.name ? "border-red-400" : ""} />
              </Field>
              <Field label="Phone" required error={errors.phone}>
                <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit number" className={errors.phone ? "border-red-400" : ""} />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className={errors.email ? "border-red-400" : ""} />
              </Field>
              <Field label="Date of birth" error={errors.dob}>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={errors.dob ? "border-red-400" : ""} />
              </Field>
              {isEditing && (
                <Field label="Wallet Balance (₹)">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={walletBalance}
                      onChange={(e) => setWalletBalance(e.target.value)}
                      placeholder="0"
                      className="pl-6"
                    />
                  </div>
                </Field>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-100 bg-gray-50/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-black flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1A56DB]" />Addresses ({addresses.length})
              </h4>
              <Button type="button" size="sm" variant="outline" onClick={() => setAddresses((prev) => [...prev, emptyAddress()])} className="h-8 gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" />Add address
              </Button>
            </div>
            {addresses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white py-6 text-center text-xs text-black">
                No addresses yet. Click "Add address" to add one or more delivery locations.
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((a, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wide text-black">Address {i + 1}</span>
                        {a.isDefault && <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">Default</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {!a.isDefault && <button type="button" onClick={() => setAddresses((prev) => prev.map((x, j) => ({ ...x, isDefault: j === i })))} className="text-[11px] text-[#1A56DB] hover:underline font-medium">Make default</button>}
                        <button type="button" onClick={() => setAddresses((prev) => prev.filter((_, j) => j !== i))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-black hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors" title="Remove address">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Full Name" required={!!(a.name || a.phone || a.building || a.street || a.area || a.pincode)} error={errors[`addr_${i}_name`]}>
                        <Input value={a.name} onChange={(e) => updateAddress(i, { name: e.target.value })} placeholder="Recipient name" className={errors[`addr_${i}_name`] ? "border-red-400" : ""} />
                      </Field>
                      <Field label="Phone" required={!!(a.name || a.phone || a.building || a.street || a.area || a.pincode)} error={errors[`addr_${i}_phone`]}>
                        <Input value={a.phone} onChange={(e) => updateAddress(i, { phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile" className={errors[`addr_${i}_phone`] ? "border-red-400" : ""} />
                      </Field>
                      <Field label="Building / Flat No" required={!!(a.name || a.phone || a.building || a.street || a.area || a.pincode)} error={errors[`addr_${i}_building`]}>
                        <Input value={a.building} onChange={(e) => updateAddress(i, { building: e.target.value })} placeholder="Wing A, Flat 302, Building Name" className={errors[`addr_${i}_building`] ? "border-red-400" : ""} />
                      </Field>
                      <Field label="Street / Locality">
                        <Input value={a.street} onChange={(e) => updateAddress(i, { street: e.target.value })} placeholder="Street name or society" />
                      </Field>
                      <Field label="Area / Suburb" required={!!(a.name || a.phone || a.building || a.street || a.area || a.pincode)} error={errors[`addr_${i}_area`]}>
                        <Input value={a.area} onChange={(e) => updateAddress(i, { area: e.target.value })} placeholder="e.g. Thane West" className={errors[`addr_${i}_area`] ? "border-red-400" : ""} />
                      </Field>
                      <Field label="Pincode" required={!!(a.name || a.phone || a.building || a.street || a.area || a.pincode)} error={errors[`addr_${i}_pincode`]}>
                        <Input value={a.pincode} onChange={(e) => updateAddress(i, { pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6-digit pincode" className={errors[`addr_${i}_pincode`] ? "border-red-400" : ""} />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Address Type">
                          <Select value={a.label || "Home"} onValueChange={(v) => updateAddress(i, { label: v, type: v.toLowerCase() })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Home">Home</SelectItem>
                              <SelectItem value="Work">Work</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <div className="md:col-span-2">
                        <Field label="Delivery Instructions">
                          <Input value={a.instructions} onChange={(e) => updateAddress(i, { instructions: e.target.value })} placeholder="Leave at door, ring bell twice, etc." />
                        </Field>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="bg-[#1A56DB] hover:bg-[#1447B4] text-white">
            {isPending ? "Saving..." : isEditing ? "Save Changes" : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-black">{label} {required && <span className="text-red-500">*</span>}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function DeleteCustomerDialog({ customerId, onClose, onConfirm, isPending }: {
  customerId: string | null; onClose: () => void; onConfirm: () => void; isPending: boolean;
}) {
  return (
    <Dialog open={!!customerId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-black">Delete Customer</DialogTitle>
          <DialogDescription>This will permanently remove the customer. This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>{isPending ? "Deleting..." : "Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
