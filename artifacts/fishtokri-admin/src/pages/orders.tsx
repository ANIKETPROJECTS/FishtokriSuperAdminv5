import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search, X, RefreshCw, ClipboardList, Clock, CheckCircle2, XCircle,
  Truck, Package, ChevronLeft, ChevronRight, Eye, MapPin,
  Phone, User, SlidersHorizontal, ArrowUpDown, UserCheck,
  ShoppingBag, Building2, AlertCircle, ChevronDown, Check,
  Pencil, Trash2, Plus, Store, Home, Trash, Mail, Calendar, Tag, Ticket, Zap,
  Wallet, CreditCard, Banknote, Smartphone, Landmark, FileText, Printer, MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import iconView from "@/assets/icon-view.png";
import iconEdit from "@/assets/icon-edit.png";
import iconDelete from "@/assets/icon-delete.png";
import recycleIcon from "@/assets/recycling-symbol.png";
import iconUser from "@/assets/icon-user.png";
import iconPhoneCall from "@/assets/icon-phone-call.png";
import iconPin from "@/assets/icon-pin.png";
import iconGrocery from "@/assets/icon-grocery.png";
import iconWallet from "@/assets/icon-wallet.png";
import iconMotorbike from "@/assets/icon-motorbike.png";
import iconGroup from "@/assets/icon-group.png";
import iconClipboardCheck from "@/assets/icon-clipboard-check.png";
import { BRAND_COLORS } from "@/lib/brand";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getCurrentAdminScope } from "@/lib/api";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import "react-day-picker/style.css";

/**
 * Tinted PNG icon — uses CSS mask-image so the provided black PNG silhouettes
 * can be re-coloured with the brand palette (e.g. #F05B4E).
 */
function MaskIcon({ src, color = BRAND_COLORS.primary, className = "w-4 h-4" }: { src: string; color?: string; className?: string }) {
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

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${getBase()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

// ─── STATUS CONFIG ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending:   { label: "Pending",   color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",   icon: Clock },
  confirmed: { label: "Confirmed", color: "text-blue-600",    bg: "bg-blue-50 border-blue-200",     icon: CheckCircle2 },
  out_for_delivery: { label: "Out for Delivery", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", icon: Truck },
  takeaway:  { label: "Takeaway",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: ShoppingBag },
  delivered: { label: "Delivered", color: "text-green-600",   bg: "bg-green-50 border-green-200",   icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "text-red-600",     bg: "bg-red-50 border-red-200",       icon: XCircle },
};

const ACTIVE_STATUSES = ["pending", "confirmed", "out_for_delivery"];
const HISTORY_STATUSES = ["delivered", "cancelled"];
const ALL_STATUSES = Object.keys(STATUS_CONFIG);

// Takeaway orders are treated as completed and shown in History.
function isHistoryOrder(o: any) {
  return HISTORY_STATUSES.includes(o?.status) || o?.deliveryType === "takeaway";
}

// For takeaway orders that are still in the active flow (pending/confirmed/preparing/out_for_delivery),
// show a single "Takeaway" badge so it's clear there's no delivery involved. Once delivered or cancelled,
// the actual final status is shown.
function displayStatus(status: string, deliveryType?: string) {
  if (deliveryType === "takeaway" && ACTIVE_STATUSES.includes(status)) return "takeaway";
  return status;
}

function StatusBadge({ status, deliveryType }: { status: string; deliveryType?: string }) {
  const eff = displayStatus(status, deliveryType);
  const cfg = STATUS_CONFIG[eff] ?? { label: eff, color: "text-gray-600", bg: "bg-gray-50 border-gray-200", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

const SOLID_STATUS_BG: Record<string, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-blue-600",
  out_for_delivery: "bg-indigo-600",
  takeaway: "bg-emerald-600",
  delivered: "bg-green-600",
  cancelled: "bg-red-600",
};

function SolidStatusBadge({ status, deliveryType }: { status: string; deliveryType?: string }) {
  const eff = displayStatus(status, deliveryType);
  const cfg = STATUS_CONFIG[eff] ?? { label: eff };
  const bg = SOLID_STATUS_BG[eff] ?? "bg-gray-500";
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full text-white ${bg}`}>
      {cfg.label}
    </span>
  );
}

function PaymentBadge({ order }: { order: any }) {
  // Detect mode from paymentMode or first payment entry; fallback to COD.
  const rawMode = String(
    order?.paymentMode ||
    (Array.isArray(order?.payments) && order.payments[0]?.mode) ||
    ""
  ).toLowerCase().trim();
  const label = rawMode === "upi" ? "UPI"
    : rawMode === "card" ? "Card"
    : rawMode === "wallet" ? "Wallet"
    : (rawMode === "cash" || rawMode === "cod" || rawMode === "") ? "COD"
    : rawMode.toUpperCase();
  return <span className="text-xs font-medium text-black">{label}</span>;
}

function formatTime12(t: string): string {
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function formatTimeSlot(o: any): string | null {
  const start = o?.timeslotStart;
  const end = o?.timeslotEnd;
  if (start && end) return `${formatTime12(start)} to ${formatTime12(end)}`;
  const label = o?.timeslotLabel;
  if (label) {
    const m = String(label).match(/\(([^)]+)\)/);
    if (m) return m[1].replace(/\s*[-–]\s*/, " to ");
    return label;
  }
  return null;
}

function formatDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRupees(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function orderTotal(items: any[]) {
  return (items ?? []).reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
}

// Returns the final amount payable for an order, honouring any saved
// `total` (which already accounts for coupon discounts and slot charges).
// Falls back to items × qty − discount for legacy orders that don't have
// `total` persisted.
function effectiveOrderTotal(o: any): number {
  const saved = Number(o?.total);
  if (saved > 0) return saved;
  const items = Array.isArray(o?.items) ? o.items : [];
  const subtotal = orderTotal(items);
  const discount = Number(o?.discount) || 0;
  const slot = Number(o?.slotCharge) || 0;
  return Math.max(0, subtotal - discount + slot);
}

function formatOrderId(o: any, dailySeq?: number): string {
  const d = o?.createdAt ? new Date(o.createdAt) : null;
  const datePart = d
    ? `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    : "00000000";
  const seqStr = dailySeq != null ? String(dailySeq).padStart(2, "0") : "??";
  return `FT${datePart}${seqStr}`;
}

function numberToWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function helper(x: number): string {
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
    if (x < 1000) return ones[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + helper(x % 100) : "");
    if (x < 100000) return helper(Math.floor(x / 1000)) + " Thousand" + (x % 1000 ? " " + helper(x % 1000) : "");
    if (x < 10000000) return helper(Math.floor(x / 100000)) + " Lakh" + (x % 100000 ? " " + helper(x % 100000) : "");
    return helper(Math.floor(x / 10000000)) + " Crore" + (x % 10000000 ? " " + helper(x % 10000000) : "");
  }
  const int = Math.floor(Math.abs(n));
  const dec = Math.round((Math.abs(n) - int) * 100);
  if (int === 0 && dec === 0) return "Zero Rupees";
  let result = int > 0 ? helper(int) + " Rupees" : "";
  if (dec > 0) result += (result ? " and " : "") + helper(dec) + " Paise";
  return result;
}

function InvoiceModal({ order, onClose }: { order: any; onClose: () => void }) {
  const items: any[] = order.items ?? [];
  const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : orderTotal(items);
  const totalQty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
  const discount = Number(order.discount) || 0;
  const slotCharge = Number(order.slotCharge) || 0;
  const grandTotal = effectiveOrderTotal(order);
  const paidAmt = Number(order.paidAmount) || 0;
  const dueAmt = Number(order.dueAmount) || Math.max(0, grandTotal - paidAmt);

  const invoiceNo = "INV-" + String(order._id).slice(-6).toUpperCase();
  const d = new Date(order.createdAt ?? Date.now());
  const dateStr = [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("-");
  const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const payMode =
    order.paymentMode ||
    (Array.isArray(order.payments) && order.payments.length > 0
      ? [...new Set(order.payments.map((p: any) => p.method))].join(", ")
      : "Cash");
  const payLabel =
    order.paymentStatus === "paid" ? "Paid" :
    order.paymentStatus === "partial" ? "Partial" : "Unpaid";

  const handlePrint = () => {
    const area = document.getElementById("invoice-print-area");
    if (!area) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${invoiceNo}</title><style>
      *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif}
      body{padding:28px;color:#111;font-size:13px}
      h2{text-align:center;font-size:15px;margin-bottom:3px}
      .sub{text-align:center;font-size:12px;color:#555;margin-bottom:14px}
      .row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px}
      .dash{border-top:1px dashed #aaa;margin:10px 0}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}
      th{border-bottom:1px solid #ccc;padding:4px 2px;text-align:left;font-weight:600}
      td{padding:4px 2px}
      .tr{font-weight:600}
      .grand{display:flex;justify-content:space-between;font-size:15px;font-weight:700;margin:4px 0}
      .words{text-align:center;font-style:italic;font-size:11px;color:#555;margin:4px 0 10px}
      .thanks{text-align:center;font-size:11px;color:#555;line-height:1.7;margin-top:14px}
    </style></head><body>${area.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Voucher Preview</h2>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 bg-gray-50">
          <div id="invoice-print-area" className="bg-white max-w-md mx-auto p-5 text-[13px] text-gray-800 shadow-sm border border-gray-200 rounded">
            <h3 className="text-center font-bold text-[15px] mb-1">
              Fishtokri{order.superHubName ? ` - ${order.superHubName}` : ""}
            </h3>
            <div className="border-t border-dashed border-gray-400 my-2" />
            <div className="text-center text-[12px]">Mobile No: {order.phone || "—"}</div>

            <div className="flex justify-between mt-2">
              <span><b>Invoice No:</b> {invoiceNo}</span>
              <span><b>Date:</b> {dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span>
                <b>Payment Mode:</b> {payMode}
                <span className={`ml-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border
                  ${order.paymentStatus === 'paid'
                    ? 'text-green-700 bg-green-50 border-green-200'
                    : order.paymentStatus === 'partial'
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-red-700 bg-red-50 border-red-200'}`}>
                  {payLabel}
                </span>
              </span>
              <span><b>Time:</b> {timeStr}</span>
            </div>

            <div className="border-t border-dashed border-gray-400 my-2" />

            <div><b>Name:</b> {order.customerName}</div>
            {order.address && <div><b>Add :</b> {order.address}</div>}

            <div className="border-t border-dashed border-gray-400 my-2" />

            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="py-1">Item</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Rate</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => {
                  const qty = Number(it.quantity) || 1;
                  const rate = Number(it.price) || 0;
                  return (
                    <tr key={i}>
                      <td className="py-1">{it.name}</td>
                      <td className="py-1 text-right">{qty}{it.unit ? ` ${it.unit}` : ""}</td>
                      <td className="py-1 text-right">{rate.toFixed(2)}</td>
                      <td className="py-1 text-right">{(qty * rate).toFixed(2)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-gray-400">
                  <td className="py-1"><b>Total Items: {items.length}</b></td>
                  <td className="py-1 text-right"><b>{totalQty}</b></td>
                  <td></td>
                  <td className="py-1 text-right"><b>{subtotal.toFixed(2)}</b></td>
                </tr>
                <tr>
                  <td className="py-1" colSpan={3}>
                    Discount{order.couponCode ? ` (${order.couponCode})` : ""} :
                  </td>
                  <td className="py-1 text-right">- {discount.toFixed(2)}</td>
                </tr>
                {slotCharge > 0 && (
                  <tr>
                    <td className="py-1" colSpan={3}>Slot Charge :</td>
                    <td className="py-1 text-right">+ {slotCharge.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="border-t border-dashed border-gray-400 my-2" />

            <div className="flex justify-between text-[15px] font-bold">
              <span>Grand Total:</span>
              <span>{grandTotal.toFixed(2)}</span>
            </div>
            <div className="text-center text-[11px] text-gray-600 mt-1">( {numberToWords(grandTotal)} )</div>

            {(order.paidAmount !== undefined || order.dueAmount !== undefined) && (
              <div className="flex justify-between text-[12px] mt-2">
                <span>Paid: <strong className="text-green-600">{formatRupees(paidAmt)}</strong></span>
                <span>Due: <strong className={dueAmt > 0 ? "text-red-500" : "text-green-600"}>{formatRupees(dueAmt)}</strong></span>
              </div>
            )}

            {order.notes && (
              <>
                <div className="border-t border-dashed border-gray-400 my-2" />
                <div className="text-[12px]"><b>Note:</b> {order.notes}</div>
              </>
            )}

            <div className="text-center text-[12px] text-gray-600 mt-3">
              Thank you for your business!<br />
              We appreciate your prompt payment.<br />
              Please feel free to contact us if you have any questions<br />
              regarding this invoice.
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-white">
          <Button variant="outline" onClick={onClose} className="h-9">Close</Button>
          <Button onClick={handlePrint} className="h-9 gap-1.5 bg-[#1A56DB] hover:bg-[#1447B4] text-white">
            <Printer className="w-3.5 h-3.5" /> Print Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ADDRESS FORMATTING ───────────────────────────────────────────────────────
function getAddressFields(a: any) {
  if (!a) return null;
  return {
    label: a.label || a.type || "",
    contactName: a.name || a.contactName || "",
    phone: a.phone || a.contactPhone || a.mobile || "",
    houseNo: a.houseNo || a.flatNo || a.house || a.apartment || "",
    building: a.building || a.buildingName || a.society || "",
    street: a.street || a.streetName || a.road || a.addressLine1 || "",
    area: a.area || a.locality || a.neighbourhood || "",
    landmark: a.landmark || "",
    city: a.city || "",
    state: a.state || "",
    pincode: a.pincode || a.zipCode || a.zip || "",
    instructions: a.instructions || a.deliveryInstructions || "",
    isDefault: !!a.isDefault,
  };
}

function formatAddressLines(a: any): string[] {
  const f = getAddressFields(a);
  if (!f) return [];
  const lines = [
    [f.houseNo, f.building].filter(Boolean).join(", "),
    [f.street, f.area].filter(Boolean).join(", "),
    f.landmark ? `Landmark: ${f.landmark}` : "",
    [f.city, f.state, f.pincode].filter(Boolean).join(", "),
  ].filter(Boolean);
  // Fallbacks for legacy short-form addresses
  if (lines.length === 0) {
    const legacy = a?.address || a?.line1 || a?.fullAddress || "";
    if (legacy) lines.push(legacy);
    if (f.area && !legacy.includes(f.area)) lines.push(f.area);
  }
  return lines;
}

function formatAddressOneLine(a: any): string {
  return formatAddressLines(a).join(" · ");
}

// ─── FILTER DELIVERY PERSONS BY HUB ───────────────────────────────────────────
function getDeliveryPersonsForOrder(order: any, allPersons: any[]) {
  const orderSuperIds: string[] = [
    ...(Array.isArray(order.superHubIds) ? order.superHubIds : []),
    ...(order.superHubId ? [String(order.superHubId)] : []),
  ].map(String).filter(Boolean);

  const orderSubIds: string[] = [
    ...(Array.isArray(order.subHubIds) ? order.subHubIds : []),
    ...(order.subHubId ? [String(order.subHubId)] : []),
  ].map(String).filter(Boolean);

  if (orderSuperIds.length === 0 && orderSubIds.length === 0) {
    return { persons: allPersons, filtered: false };
  }

  const matched = allPersons.filter((p) => {
    const pSuperIds = (p.superHubIds ?? []).map(String);
    const pSubIds = (p.subHubIds ?? []).map(String);
    const matchesSuper = orderSuperIds.some((id) => pSuperIds.includes(id) || String(p.superHubId) === id);
    const matchesSub = orderSubIds.some((id) => pSubIds.includes(id) || String(p.subHubId) === id);
    return matchesSuper || matchesSub;
  });

  return { persons: matched, filtered: true };
}

// ─── HUB BADGE ─────────────────────────────────────────────────────────────────
function HubBadge({ person }: { person: any }) {
  const hubs = [
    ...(person.superHubNames ?? (person.superHubName ? [person.superHubName] : [])),
    ...(person.subHubNames ?? (person.subHubName ? [person.subHubName] : [])),
  ].filter(Boolean);

  if (hubs.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
      <Building2 className="w-2.5 h-2.5" />
      {hubs[0]}{hubs.length > 1 ? ` +${hubs.length - 1}` : ""}
    </span>
  );
}

// ─── INLINE DELIVERY ASSIGN ───────────────────────────────────────────────────
function InlineDeliverySelect({
  order,
  persons,
  saving,
  onAssign,
}: {
  order: any;
  persons: any[];
  saving: boolean;
  onAssign: (orderId: string, personId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { persons: filtered, filtered: isFiltered } = getDeliveryPersonsForOrder(order, persons);
  const assigned = order.assignedDeliveryPersonId;
  const assignedName = order.assignedDeliveryPersonName;

  if (saving) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="w-4 h-4 rounded-full border-2 border-orange-300 border-t-orange-600 animate-spin" />
        <span className="text-[11px] text-gray-400">Saving…</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-black bg-white px-3 py-1 text-xs font-medium text-black w-full max-w-[130px] hover:bg-gray-50"
        >
          <span className="flex-1 text-left truncate leading-tight">
            {assigned ? assignedName || "Assigned" : "Unassigned"}
          </span>
          <ChevronDown className={`w-3 h-3 flex-shrink-0 text-black transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64 shadow-md border border-gray-200 rounded-md overflow-hidden bg-white" align="start" sideOffset={6}>
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-200">
          <p className="text-[11px] font-semibold text-black uppercase tracking-wide">Assign Delivery Partner</p>
        </div>

        {/* Options list */}
        <div className="max-h-56 overflow-y-auto py-1">
          {/* Unassign option */}
          <button
            onClick={() => { onAssign(String(order._id), ""); setOpen(false); }}
            className="w-full flex items-center px-3 py-2 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-xs font-medium text-black">Remove assignment</span>
            {!assigned && <Check className="w-3 h-3 text-black ml-auto" />}
          </button>

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-gray-200" />

          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center">
              <p className="text-[11px] text-black">No partners for this hub</p>
            </div>
          ) : (
            filtered.map((p) => {
              const isSelected = assigned === p.id;
              const superHubs = (p.superHubNames ?? (p.superHubName ? [p.superHubName] : [])).filter(Boolean);
              const subHubs = (p.subHubNames ?? (p.subHubName ? [p.subHubName] : [])).filter(Boolean);
              return (
                <button
                  key={p.id}
                  onClick={() => { onAssign(String(order._id), p.id); setOpen(false); }}
                  className="w-full flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-black truncate">{p.name}</p>
                    {p.phone && <p className="text-[11px] text-gray-500 truncate">{p.phone}</p>}
                    {superHubs.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wide">Hub:</span>
                        <span className="text-[10px] text-gray-600 truncate">{superHubs.join(", ")}</span>
                      </div>
                    )}
                    {subHubs.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wide">Sub:</span>
                        <span className="text-[10px] text-gray-600 truncate">{subHubs.join(", ")}</span>
                      </div>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-black flex-shrink-0 mt-0.5" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Orders() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const isEditPage = location.startsWith("/orders/edit/");
  const editIdFromUrl = isEditPage ? location.replace("/orders/edit/", "") : "";
  const isCreatePage = location === "/orders/new" || location.endsWith("/orders/new") || isEditPage;

  const [activeTab, setActiveTab] = useState<"current" | "history" | "all" | "invoices">("current");
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [subHubFilter, setSubHubFilter] = useState("");
  const [filterSubHubs, setFilterSubHubs] = useState<{ id: string; name: string }[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const knownSubHubsRef = useRef<Map<string, { id: string; name: string }>>(new Map());

  // Pagination
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  // Data
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState<Record<string, number>>({});
  const [statsTotals, setStatsTotals] = useState<{ total?: number; currentTotal?: number; historyTotal?: number }>({});

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  // Payment-on-deliver dialog
  const [deliverPayOpen, setDeliverPayOpen] = useState(false);
  const [deliverPayStatus, setDeliverPayStatus] = useState<"unpaid" | "partial" | "paid">("paid");
  const [deliverPayEntries, setDeliverPayEntries] = useState<{ mode: string; amount: string; reference: string }[]>([]);

  // Delivery assignment
  const [deliveryPersons, setDeliveryPersons] = useState<any[]>([]);
  const [assigningDelivery, setAssigningDelivery] = useState(false);
  const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState("");
  const [inlineAssigningId, setInlineAssigningId] = useState<string | null>(null);
  const [showAllPersons, setShowAllPersons] = useState(false);

  // Edit order (full edit reuses the create form via /orders/edit/:id)
  const [editingOrderId, setEditingOrderId] = useState<string>("");
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editForm, setEditForm] = useState({ customerName: "", phone: "", address: "", deliveryArea: "", notes: "", status: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete order
  const [deletingOrder, setDeletingOrder] = useState<any>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Accept / Reject order
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmingReject, setConfirmingReject] = useState(false);

  // Create order
  // Create-order open state is driven by URL (/orders/new)
  const [creatingSaving, setCreatingSaving] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [chosenCustomer, setChosenCustomer] = useState<any>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "", dateOfBirth: "" });
  const [orderItems, setOrderItems] = useState<{ name: string; price: string; quantity: string; unit: string }[]>([]);
  const [orderDeliveryType, setOrderDeliveryType] = useState<"delivery" | "takeaway">("delivery");
  const [orderAddressMode, setOrderAddressMode] = useState<"saved" | "new">("saved");
  const [selectedAddressIdx, setSelectedAddressIdx] = useState<number | null>(null);
  const [newAddress, setNewAddress] = useState({
    label: "Home", name: "", phone: "",
    building: "", street: "", area: "", pincode: "",
  });
  const [orderNotes, setOrderNotes] = useState("");

  // Hub & product picker state
  const [superHubs, setSuperHubs] = useState<any[]>([]);
  const [loadingSuperHubs, setLoadingSuperHubs] = useState(false);
  const [selectedSuperHubId, setSelectedSuperHubId] = useState<string>("");
  const [subHubs, setSubHubs] = useState<any[]>([]);
  const [loadingSubHubs, setLoadingSubHubs] = useState(false);
  const [selectedSubHubId, setSelectedSubHubId] = useState<string>("");
  const [subHubProducts, setSubHubProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; name: string; price: number; unit: string; quantity: number }[]>([]);

  // Coupons / timeslots / scheduling
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [appliedCouponIds, setAppliedCouponIds] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState<string>("");
  const [couponError, setCouponError] = useState<string>("");
  const [timeslots, setTimeslots] = useState<any[]>([]);
  const [loadingTimeslots, setLoadingTimeslots] = useState(false);
  const [selectedTimeslotId, setSelectedTimeslotId] = useState<string>("");
  const [orderScheduleType, setOrderScheduleType] = useState<"instant" | "slot">("slot");
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Payment
  type PaymentEntry = { mode: string; amount: string; reference: string };
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "partial" | "paid">("unpaid");
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);

  const resetCreateForm = useCallback(() => {
    setCustomerMode("existing");
    setCustomerSearch(""); setChosenCustomer(null); setCustomerDropdownOpen(false);
    setNewCustomer({ name: "", phone: "", email: "", dateOfBirth: "" });
    setOrderItems([]);
    setOrderDeliveryType("delivery");
    setOrderAddressMode("saved"); setSelectedAddressIdx(null);
    setNewAddress({
      label: "Home", name: "", phone: "",
      building: "", street: "", area: "", pincode: "",
    });
    setOrderNotes("");
    setSelectedSuperHubId(""); setSelectedSubHubId("");
    setSubHubs([]); setSubHubProducts([]); setSelectedProducts([]);
    setProductSearch(""); setProductPickerOpen(false);
    setCoupons([]); setAppliedCouponIds([]); setCouponCode(""); setCouponError("");
    setTimeslots([]); setSelectedTimeslotId("");
    setOrderScheduleType("slot");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setPaymentStatus("unpaid");
    setPaymentEntries([]);
    setEditingOrderId("");
  }, []);

  // Load all customers when create-order modal opens
  useEffect(() => {
    if (!isCreatePage) return;
    if (allCustomers.length === 0) {
      setLoadingCustomers(true);
      apiFetch(`/api/customers?limit=100&sort=name_asc`)
        .then((d) => setAllCustomers(d.customers ?? []))
        .catch(() => setAllCustomers([]))
        .finally(() => setLoadingCustomers(false));
    }
    if (superHubs.length === 0) {
      setLoadingSuperHubs(true);
      apiFetch(`/api/super-hubs`)
        .then((d) => setSuperHubs(d.superHubs ?? []))
        .catch(() => setSuperHubs([]))
        .finally(() => setLoadingSuperHubs(false));
    }
  }, [isCreatePage, allCustomers.length, superHubs.length]);

  // Refs to avoid wiping pre-populated edit-form values when super/sub-hub effects fire.
  const skipSubHubResetRef = useRef(false);
  const skipMenuResetRef = useRef(false);

  // Load sub-hubs when super-hub changes
  // Auto-select hub for super_hub users when only one option is available.
  const adminScope = useMemo(() => getCurrentAdminScope(), []);

  // Build a per-day sequential order number map from loaded orders
  const dailySeqMap = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const dayCounters = new Map<string, number>();
    for (const o of sorted) {
      const d = new Date(o.createdAt);
      const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const seq = (dayCounters.get(day) ?? 0) + 1;
      dayCounters.set(day, seq);
      map.set(String(o._id), seq);
    }
    return map;
  }, [orders]);

  useEffect(() => {
    if (selectedSuperHubId) return;
    if (adminScope.role !== "super_hub") return;
    if (superHubs.length !== 1) return;
    setSelectedSuperHubId(superHubs[0].id);
  }, [superHubs, selectedSuperHubId, adminScope]);
  useEffect(() => {
    if (selectedSubHubId) return;
    if (adminScope.role !== "super_hub") return;
    if (subHubs.length !== 1) return;
    setSelectedSubHubId(subHubs[0].id);
  }, [subHubs, selectedSubHubId, adminScope]);

  useEffect(() => {
    if (!selectedSuperHubId) { setSubHubs([]); setSelectedSubHubId(""); return; }
    setLoadingSubHubs(true);
    apiFetch(`/api/super-hubs/${selectedSuperHubId}/sub-hubs`)
      .then((d) => setSubHubs(d.subHubs ?? []))
      .catch(() => setSubHubs([]))
      .finally(() => setLoadingSubHubs(false));
    if (skipSubHubResetRef.current) {
      skipSubHubResetRef.current = false;
      return;
    }
    setSelectedSubHubId("");
    setSubHubProducts([]);
    setSelectedProducts([]);
  }, [selectedSuperHubId]);

  // Load products, coupons, timeslots when sub-hub changes
  useEffect(() => {
    if (!selectedSubHubId) {
      setSubHubProducts([]); setCoupons([]); setTimeslots([]);
      setAppliedCouponIds([]); setSelectedTimeslotId("");
      return;
    }
    setLoadingProducts(true);
    apiFetch(`/api/sub-hubs/${selectedSubHubId}/menu/products`)
      .then((d) => setSubHubProducts(d.products ?? []))
      .catch(() => setSubHubProducts([]))
      .finally(() => setLoadingProducts(false));

    setLoadingCoupons(true);
    apiFetch(`/api/sub-hubs/${selectedSubHubId}/menu/coupons`)
      .then((d) => setCoupons(d.coupons ?? []))
      .catch(() => setCoupons([]))
      .finally(() => setLoadingCoupons(false));

    setLoadingTimeslots(true);
    apiFetch(`/api/sub-hubs/${selectedSubHubId}/menu/timeslots`)
      .then((d) => setTimeslots(d.timeslots ?? []))
      .catch(() => setTimeslots([]))
      .finally(() => setLoadingTimeslots(false));

    if (skipMenuResetRef.current) {
      skipMenuResetRef.current = false;
      return;
    }
    setSelectedProducts([]);
    setAppliedCouponIds([]); setCouponCode(""); setCouponError("");
    setSelectedTimeslotId("");
  }, [selectedSubHubId]);

  const activeCoupons = useMemo(() => {
    const now = Date.now();
    return coupons.filter((c) => {
      if (c.isActive === false) return false;
      if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return false;
      return true;
    });
  }, [coupons]);

  const stockOf = useCallback((productId: string): number => {
    const p = subHubProducts.find((x) => String(x._id) === productId);
    if (!p) return Infinity;
    const q = Number(p.quantity);
    return Number.isFinite(q) ? q : Infinity;
  }, [subHubProducts]);

  const isCouponApplicable = useCallback((c: any): boolean => {
    const apProds = (Array.isArray(c.applicableProducts) ? c.applicableProducts : []).map((x: any) => String(x));
    const apCats = (Array.isArray(c.applicableCategories) ? c.applicableCategories : []).map((x: any) => String(x).toLowerCase());
    if (apProds.length === 0 && apCats.length === 0) return true;
    if (selectedProducts.length === 0) return false;
    for (const sp of selectedProducts) {
      if (apProds.includes(String(sp.productId))) return true;
      const prod = subHubProducts.find((x) => String(x._id) === sp.productId);
      const cat = String(prod?.category ?? "").toLowerCase();
      if (cat && apCats.includes(cat)) return true;
    }
    return false;
  }, [selectedProducts, subHubProducts]);

  const activeTimeslots = useMemo(() => timeslots.filter((t) => t.isActive !== false), [timeslots]);

  const productCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of subHubProducts) {
      const cat = String(p.category || "").trim() || "Uncategorized";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subHubProducts]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    let list = subHubProducts;
    if (pickerCategory) {
      const target = pickerCategory === "Uncategorized" ? "" : pickerCategory.toLowerCase();
      list = list.filter((p) => {
        const c = String(p.category ?? "").trim().toLowerCase();
        return target === "" ? c === "" : c === target;
      });
    }
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.category, p.subCategory].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [subHubProducts, productSearch, pickerCategory]);

  const filteredCategories = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productCategories;
    return productCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [productCategories, productSearch]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter((c) =>
      [c.name, c.email, c.phone].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [allCustomers, customerSearch]);

  const itemsSubtotal = useMemo(() => {
    const customSum = orderItems.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
    const productSum = selectedProducts.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0), 0);
    return customSum + productSum;
  }, [orderItems, selectedProducts]);

  const totalItemCount = useMemo(() => {
    const cust = orderItems.filter((it) => it.name.trim() && Number(it.quantity) > 0).length;
    return cust + selectedProducts.length;
  }, [orderItems, selectedProducts]);

  const appliedCoupons = useMemo(
    () => appliedCouponIds
      .map((id) => activeCoupons.find((c) => String(c._id) === id))
      .filter(Boolean) as any[],
    [activeCoupons, appliedCouponIds]
  );

  const couponDiscount = useMemo(() => {
    if (appliedCoupons.length === 0) return 0;
    let total = 0;
    for (const c of appliedCoupons) {
      const min = Number(c.minOrderAmount) || 0;
      if (itemsSubtotal < min) continue;
      if (!isCouponApplicable(c)) continue;
      const v = Number(c.discountValue) || 0;
      if (c.type === "percentage") {
        total += Math.round((itemsSubtotal * v) / 100);
      } else {
        total += v;
      }
    }
    return Math.min(itemsSubtotal, total);
  }, [appliedCoupons, itemsSubtotal, isCouponApplicable]);

  const selectedTimeslot = useMemo(
    () => activeTimeslots.find((t) => String(t._id) === selectedTimeslotId) || null,
    [activeTimeslots, selectedTimeslotId]
  );

  const slotExtraCharge = useMemo(() => Number(selectedTimeslot?.extraCharge) || 0, [selectedTimeslot]);

  const newOrderTotal = useMemo(
    () => Math.max(0, itemsSubtotal - couponDiscount + slotExtraCharge),
    [itemsSubtotal, couponDiscount, slotExtraCharge]
  );

  const paidTotal = useMemo(
    () => paymentEntries.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [paymentEntries]
  );
  const dueAmount = Math.max(0, newOrderTotal - paidTotal);

  const PAYMENT_MODES = [
    { value: "cash", label: "Cash", Icon: Banknote },
    { value: "upi", label: "UPI", Icon: Smartphone },
    { value: "card", label: "Card", Icon: CreditCard },
    { value: "bank_transfer", label: "Bank Transfer", Icon: Landmark },
    { value: "wallet", label: "Wallet", Icon: Wallet },
    { value: "other", label: "Other", Icon: Tag },
  ];

  // Auto-populate / clear entries on status change
  useEffect(() => {
    if (paymentStatus === "unpaid") {
      if (paymentEntries.length > 0) setPaymentEntries([]);
      return;
    }
    if (paymentEntries.length === 0) {
      setPaymentEntries([
        {
          mode: "cash",
          amount: paymentStatus === "paid" ? String(newOrderTotal || 0) : "",
          reference: "",
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus]);

  const toggleCoupon = (id: string) => {
    setAppliedCouponIds((ids) => (ids.includes(id) ? [] : [id]));
    setCouponError("");
  };

  const applyCouponByCode = () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError("Enter a coupon code"); return; }
    const match = activeCoupons.find((c) => String(c.code).toUpperCase() === code);
    if (!match) { setCouponError("Invalid or inactive coupon"); return; }
    if (!isCouponApplicable(match)) { setCouponError("Coupon not valid for the items in this order"); return; }
    const min = Number(match.minOrderAmount) || 0;
    if (itemsSubtotal < min) { setCouponError(`Min order ₹${min} required`); return; }
    const id = String(match._id);
    if (appliedCouponIds.includes(id)) { setCouponError("Coupon already applied"); return; }
    setAppliedCouponIds([id]);
    setCouponCode("");
    setCouponError("");
  };

  const handleCreateOrder = async () => {
    // Validate customer
    let customerName = "";
    let phone = "";
    let email = "";
    let customerId: string | undefined;

    if (customerMode === "existing") {
      if (!chosenCustomer) {
        toast({ title: "Select a customer", description: "Pick an existing customer or switch to 'New Customer'.", variant: "destructive" });
        return;
      }
      customerName = chosenCustomer.name;
      phone = chosenCustomer.phone;
      email = chosenCustomer.email;
      customerId = chosenCustomer.id;
    } else {
      if (!newCustomer.name.trim()) {
        toast({ title: "Customer name required", variant: "destructive" });
        return;
      }
      const phoneTrim = newCustomer.phone.trim();
      if (!phoneTrim) {
        toast({ title: "Phone number required", description: "Phone is required for new customers.", variant: "destructive" });
        return;
      }
      if (!/^\d{10}$/.test(phoneTrim)) {
        toast({ title: "Invalid phone", description: "Phone must be a 10-digit number.", variant: "destructive" });
        return;
      }
      customerName = newCustomer.name.trim();
      phone = phoneTrim;
      email = newCustomer.email.trim();
    }

    // Validate hub
    if (!selectedSuperHubId || !selectedSubHubId) {
      toast({ title: "Select a hub", description: "Choose both super-hub and sub-hub to fulfil this order.", variant: "destructive" });
      return;
    }

    // Validate items (products + custom)
    const productItems = selectedProducts
      .filter((p) => p.quantity > 0)
      .map((p) => ({ productId: p.productId, name: p.name, price: p.price, quantity: p.quantity, unit: p.unit }));
    const customItems = orderItems
      .map((it) => ({
        name: it.name.trim(),
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 0,
        unit: it.unit.trim(),
      }))
      .filter((it) => it.name && it.quantity > 0);
    const cleanItems = [...productItems, ...customItems];
    if (cleanItems.length === 0) {
      toast({ title: "Add at least one item", description: "Pick a product from the sub-hub catalog or add a custom item.", variant: "destructive" });
      return;
    }

    // Resolve address for delivery
    let address = "";
    let deliveryArea = "";
    let deliveryAddressDetail: any = undefined;
    if (orderDeliveryType === "delivery") {
      if (chosenCustomer && orderAddressMode === "saved" && selectedAddressIdx !== null) {
        const a = (chosenCustomer.addresses ?? [])[selectedAddressIdx];
        address = formatAddressOneLine(a) || a?.address || a?.line1 || a?.fullAddress || "";
        const f = getAddressFields(a);
        deliveryArea = f?.area || f?.city || "";
        deliveryAddressDetail = a;
      } else {
        const f = newAddress;
        if (!f.name.trim()) {
          toast({ title: "Recipient name required", description: "Enter the full name for the delivery address.", variant: "destructive" });
          return;
        }
        if (!f.phone || !/^\d{10}$/.test(f.phone)) {
          toast({ title: "Phone required", description: "Enter a valid 10-digit phone for the delivery address.", variant: "destructive" });
          return;
        }
        if (!f.building.trim()) {
          toast({ title: "Building / Flat No required", description: "Enter the building or flat number for the delivery address.", variant: "destructive" });
          return;
        }
        if (!f.area.trim()) {
          toast({ title: "Area / Suburb required", description: "Enter the area or suburb for the delivery address.", variant: "destructive" });
          return;
        }
        if (!f.pincode || !/^\d{6}$/.test(f.pincode)) {
          toast({ title: "Pincode required", description: "Enter a valid 6-digit pincode for the delivery address.", variant: "destructive" });
          return;
        }
        address = formatAddressOneLine(f);
        deliveryArea = f.area || "";
        deliveryAddressDetail = {
          label: f.label,
          type: (f.label || "Home").toLowerCase(),
          name: f.name.trim(),
          phone: f.phone.trim(),
          building: f.building.trim(),
          street: f.street.trim(),
          area: f.area.trim(),
          pincode: f.pincode.trim(),
        };
      }
      if (!address) {
        toast({ title: "Delivery address required", variant: "destructive" });
        return;
      }
    }

    const superHub = superHubs.find((h) => h.id === selectedSuperHubId);
    const subHub = subHubs.find((h) => h.id === selectedSubHubId);

    // Validate scheduling (only for delivery orders — takeaway is instant for today)
    if (orderDeliveryType === "delivery") {
      if (orderScheduleType === "slot" && activeTimeslots.length > 0 && !selectedTimeslotId) {
        toast({ title: "Pick a delivery slot", description: "Select a time slot or switch to instant delivery.", variant: "destructive" });
        return;
      }
      if (!orderDate) {
        toast({ title: "Pick a delivery date", variant: "destructive" });
        return;
      }
    }

    // Validate payment
    if (paymentStatus !== "unpaid") {
      const validEntries = paymentEntries.filter((p) => p.mode && Number(p.amount) > 0);
      if (validEntries.length === 0) {
        toast({ title: "Add payment details", description: "Enter at least one payment with mode and amount.", variant: "destructive" });
        return;
      }
      if (paymentStatus === "paid" && paidTotal !== newOrderTotal) {
        toast({ title: "Payment mismatch", description: `Total paid (${formatRupees(paidTotal)}) must equal order total (${formatRupees(newOrderTotal)}).`, variant: "destructive" });
        return;
      }
      if (paymentStatus === "partial" && (paidTotal <= 0 || paidTotal >= newOrderTotal)) {
        toast({ title: "Invalid partial payment", description: `Paid amount must be between ₹0 and ${formatRupees(newOrderTotal)}.`, variant: "destructive" });
        return;
      }
    }

    setCreatingSaving(true);
    try {
      const payload: any = {
        customerId,
        customerName, phone, email,
        items: cleanItems,
        deliveryType: orderDeliveryType,
        address,
        deliveryArea,
        deliveryAddressDetail,
        superHubId: selectedSuperHubId,
        superHubName: superHub?.name ?? "",
        subHubId: selectedSubHubId,
        subHubName: subHub?.name ?? "",
        notes: orderNotes.trim(),
        status: orderDeliveryType === "takeaway" ? "takeaway" : "pending",
        createCustomerIfMissing: customerMode === "new",
        newCustomerExtras: customerMode === "new" ? {
          dateOfBirth: newCustomer.dateOfBirth.trim(),
        } : undefined,
        // Pricing breakdown
        subtotal: itemsSubtotal,
        discount: couponDiscount,
        slotCharge: slotExtraCharge,
        total: newOrderTotal,
        // Coupons (multi)
        couponId: appliedCoupons[0] ? String(appliedCoupons[0]._id) : undefined,
        couponCode: appliedCoupons[0]?.code,
        couponTitle: appliedCoupons[0]?.title,
        couponIds: appliedCoupons.map((c) => String(c._id)),
        couponCodes: appliedCoupons.map((c) => c.code),
        coupons: appliedCoupons.map((c) => ({
          id: String(c._id),
          code: c.code,
          title: c.title,
          type: c.type,
          discountValue: Number(c.discountValue) || 0,
          minOrderAmount: Number(c.minOrderAmount) || 0,
        })),
        // Payment
        paymentStatus,
        paidAmount: paidTotal,
        paymentMode: paymentEntries[0]?.mode,
        payments: paymentEntries
          .filter((p) => p.mode && Number(p.amount) > 0)
          .map((p) => ({
            mode: p.mode,
            amount: Number(p.amount) || 0,
            reference: p.reference?.trim() || "",
          })),
        // Schedule (takeaway is forced to instant fulfillment for today)
        scheduleType: orderDeliveryType === "takeaway" ? "instant" : orderScheduleType,
        deliveryDate: orderDeliveryType === "takeaway"
          ? new Date().toISOString().slice(0, 10)
          : orderDate,
        timeslotId: orderDeliveryType === "takeaway"
          ? undefined
          : (selectedTimeslot ? String(selectedTimeslot._id) : undefined),
        timeslotLabel: orderDeliveryType === "takeaway" ? undefined : selectedTimeslot?.label,
        timeslotStart: orderDeliveryType === "takeaway" ? undefined : selectedTimeslot?.startTime,
        timeslotEnd: orderDeliveryType === "takeaway" ? undefined : selectedTimeslot?.endTime,
      };
      const url = editingOrderId ? `/api/orders/${editingOrderId}` : "/api/orders";
      const method = editingOrderId ? "PUT" : "POST";
      await apiFetch(url, { method, body: JSON.stringify(payload) });
      toast({ title: editingOrderId ? "Order updated" : "Order created", description: `${customerName} · ${formatRupees(cleanItems.reduce((s, i) => s + i.price * i.quantity, 0))}` });
      resetCreateForm();
      setLocation("/orders");
      load();
      loadStats();
    } catch (err: any) {
      toast({ title: "Failed to create order", description: err.message, variant: "destructive" });
    } finally {
      setCreatingSaving(false);
    }
  };

  useEffect(() => {
    apiFetch("/api/users?role=delivery_person&limit=100")
      .then((d) => setDeliveryPersons(d.users ?? []))
      .catch(() => {});
  }, []);

  // Persons to show in the modal (hub-filtered or all)
  const modalPersons = useMemo(() => {
    if (!selectedOrder) return deliveryPersons;
    const { persons, filtered } = getDeliveryPersonsForOrder(selectedOrder, deliveryPersons);
    if (showAllPersons || !filtered) return deliveryPersons;
    return persons;
  }, [selectedOrder, deliveryPersons, showAllPersons]);

  const modalFiltered = useMemo(() => {
    if (!selectedOrder) return false;
    const { filtered } = getDeliveryPersonsForOrder(selectedOrder, deliveryPersons);
    return filtered;
  }, [selectedOrder, deliveryPersons]);

  const modalFilteredCount = useMemo(() => {
    if (!selectedOrder) return deliveryPersons.length;
    const { persons } = getDeliveryPersonsForOrder(selectedOrder, deliveryPersons);
    return persons.length;
  }, [selectedOrder, deliveryPersons]);

  const effectiveStatus = useMemo(() => {
    if (statusFilter) return statusFilter;
    if (activeTab === "current") return ACTIVE_STATUSES.join(",");
    if (activeTab === "history") return HISTORY_STATUSES.join(",");
    if (activeTab === "invoices") return HISTORY_STATUSES.join(",");
    return "";
  }, [activeTab, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        sort: sortField,
        order: sortDir,
        page: String(page),
        limit: String(LIMIT),
      });
      if (activeTab === "current" || activeTab === "history" || activeTab === "invoices") {
        params.set("tab", activeTab === "invoices" ? "history" : activeTab);
      }
      if (statusFilter) {
        params.set("status", statusFilter);
      }
      if (deliveryTypeFilter) params.set("deliveryType", deliveryTypeFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (subHubFilter) params.set("subHubId", subHubFilter);

      const data = await apiFetch(`/api/orders?${params}`);
      const loadedOrders = data.orders ?? [];
      setOrders(loadedOrders);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
      // Accumulate unique sub-hubs from orders for the filter dropdown
      let changed = false;
      for (const o of loadedOrders) {
        if (o.subHubId && !knownSubHubsRef.current.has(String(o.subHubId))) {
          knownSubHubsRef.current.set(String(o.subHubId), { id: String(o.subHubId), name: o.subHubName ?? "Sub Hub" });
          changed = true;
        }
      }
      if (changed) setFilterSubHubs(Array.from(knownSubHubsRef.current.values()));
    } catch (err: any) {
      toast({ title: "Error loading orders", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [search, sortField, sortDir, page, activeTab, statusFilter, deliveryTypeFilter, dateFrom, dateTo, subHubFilter, toast]);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch("/api/orders/stats");
      setStatsData(data.stats ?? {});
      setStatsTotals({
        total: data.total,
        currentTotal: data.currentTotal,
        historyTotal: data.historyTotal,
      });
    } catch { }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setPage(1); }, [activeTab, search, statusFilter, deliveryTypeFilter, dateFrom, dateTo, sortField, sortDir, subHubFilter]);
  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !editStatus) return;

    // When marking as delivered, prompt for payment collection unless already fully paid.
    if (editStatus === "delivered" && selectedOrder.paymentStatus !== "paid") {
      const total = Number(selectedOrder.total) > 0
        ? Number(selectedOrder.total)
        : orderTotal(selectedOrder.items);
      const alreadyPaid = Number(selectedOrder.paidAmount) || 0;
      const due = Math.max(0, total - alreadyPaid);
      setDeliverPayStatus(due > 0 ? "paid" : "paid");
      setDeliverPayEntries([
        { mode: "cash", amount: String(due > 0 ? due : total), reference: "" },
      ]);
      setDeliverPayOpen(true);
      return;
    }

    setSavingStatus(true);
    try {
      await apiFetch(`/api/orders/${selectedOrder._id}`, { method: "PUT", body: JSON.stringify({ status: editStatus }) });
      const movedOutOfDelivered =
        selectedOrder.status === "delivered" &&
        editStatus !== "delivered" &&
        editStatus !== "cancelled";
      toast({
        title: "Order status updated",
        description: movedOutOfDelivered
          ? "Previous payment info was cleared. Re-record payment when delivered again."
          : undefined,
      });
      setSelectedOrder((o: any) => {
        const next: any = { ...o, status: editStatus };
        if (movedOutOfDelivered) {
          const totalAmt = Number(o?.total) > 0 ? Number(o.total) : orderTotal(o?.items);
          next.payments = [];
          next.paymentStatus = "unpaid";
          next.paidAmount = 0;
          next.paymentMode = "";
          next.dueAmount = totalAmt;
        }
        return next;
      });
      load();
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingStatus(false); }
  };

  const deliverPayPaidTotal = useMemo(
    () => deliverPayEntries.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [deliverPayEntries]
  );

  const handleDeliverWithPayment = async () => {
    if (!selectedOrder) return;
    const orderTotalAmount = Number(selectedOrder.total) > 0
      ? Number(selectedOrder.total)
      : orderTotal(selectedOrder.items);
    const existingPaid = Number(selectedOrder.paidAmount) || 0;
    const existingPayments: any[] = Array.isArray(selectedOrder.payments) ? selectedOrder.payments : [];

    if (deliverPayStatus !== "unpaid") {
      const validEntries = deliverPayEntries.filter((p) => p.mode && Number(p.amount) > 0);
      if (validEntries.length === 0) {
        toast({ title: "Add payment details", description: "Enter at least one payment with mode and amount.", variant: "destructive" });
        return;
      }
    }

    const newPaidTotal = existingPaid + (deliverPayStatus === "unpaid" ? 0 : deliverPayPaidTotal);
    if (deliverPayStatus === "paid" && newPaidTotal !== orderTotalAmount) {
      toast({ title: "Payment mismatch", description: `Total paid (${formatRupees(newPaidTotal)}) must equal order total (${formatRupees(orderTotalAmount)}).`, variant: "destructive" });
      return;
    }
    if (deliverPayStatus === "partial" && (newPaidTotal <= 0 || newPaidTotal >= orderTotalAmount)) {
      toast({ title: "Invalid partial payment", description: `Paid amount must be between ₹0 and ${formatRupees(orderTotalAmount)}.`, variant: "destructive" });
      return;
    }

    const mergedPayments = [
      ...existingPayments,
      ...(deliverPayStatus === "unpaid"
        ? []
        : deliverPayEntries
            .filter((p) => p.mode && Number(p.amount) > 0)
            .map((p) => ({
              mode: p.mode,
              amount: Number(p.amount) || 0,
              reference: p.reference?.trim() || "",
            }))),
    ];

    setSavingStatus(true);
    try {
      const payload: any = {
        status: "delivered",
        paymentStatus: deliverPayStatus,
        paidAmount: newPaidTotal,
        paymentMode: mergedPayments[0]?.mode,
        payments: mergedPayments,
      };
      await apiFetch(`/api/orders/${selectedOrder._id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: "Marked as delivered", description: deliverPayStatus === "paid" ? "Payment recorded." : deliverPayStatus === "partial" ? "Partial payment recorded." : "No payment recorded." });
      setSelectedOrder((o: any) => ({
        ...o,
        status: "delivered",
        paymentStatus: deliverPayStatus,
        paidAmount: newPaidTotal,
        dueAmount: Math.max(0, orderTotalAmount - newPaidTotal),
        payments: mergedPayments,
      }));
      setDeliverPayOpen(false);
      load();
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingStatus(false);
    }
  };

  const acceptOrder = async (order: any) => {
    const orderId = String(order._id);
    setAcceptingId(orderId);
    try {
      await apiFetch(`/api/orders/${orderId}`, { method: "PUT", body: JSON.stringify({ status: "confirmed" }) });
      toast({ title: "Order accepted", description: "Status set to Confirmed." });
      setOrders((prev) => prev.map((o) => String(o._id) === orderId ? { ...o, status: "confirmed" } : o));
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAcceptingId(null);
    }
  };

  const submitReject = async () => {
    if (!rejectingOrder) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast({ title: "Reason required", description: "Please enter a reason for cancellation.", variant: "destructive" });
      return;
    }
    const orderId = String(rejectingOrder._id);
    setConfirmingReject(true);
    try {
      await apiFetch(`/api/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled", cancellationReason: reason }),
      });
      toast({ title: "Order rejected", description: "Order has been cancelled." });
      setOrders((prev) => prev.map((o) => String(o._id) === orderId ? { ...o, status: "cancelled", cancellationReason: reason } : o));
      setRejectingOrder(null);
      setRejectReason("");
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setConfirmingReject(false);
    }
  };

  const inlineAssign = async (orderId: string, personId: string) => {
    setInlineAssigningId(orderId);
    try {
      const person = deliveryPersons.find((p) => p.id === personId);
      const payload = personId
        ? { assignedDeliveryPersonId: personId, assignedDeliveryPersonName: person?.name ?? "" }
        : { assignedDeliveryPersonId: "", assignedDeliveryPersonName: "" };
      await apiFetch(`/api/orders/${orderId}`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: personId ? `Assigned to ${person?.name}` : "Assignment removed" });
      setOrders((prev) => prev.map((o) => String(o._id) === orderId ? { ...o, ...payload } : o));
      if (selectedOrder && String(selectedOrder._id) === orderId) setSelectedOrder((o: any) => ({ ...o, ...payload }));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setInlineAssigningId(null); }
  };

  const handleAssignDelivery = async () => {
    if (!selectedOrder) return;
    setAssigningDelivery(true);
    const resolvedId = selectedDeliveryPersonId === "__none__" ? "" : selectedDeliveryPersonId;
    try {
      const person = deliveryPersons.find((p) => p.id === resolvedId);
      const payload = resolvedId
        ? { assignedDeliveryPersonId: resolvedId, assignedDeliveryPersonName: person?.name ?? "" }
        : { assignedDeliveryPersonId: "", assignedDeliveryPersonName: "" };
      await apiFetch(`/api/orders/${selectedOrder._id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: resolvedId ? `Assigned to ${person?.name}` : "Assignment removed" });
      setSelectedOrder((o: any) => ({ ...o, ...payload }));
      setOrders((prev) => prev.map((o) => String(o._id) === String(selectedOrder._id) ? { ...o, ...payload } : o));
      setSelectedDeliveryPersonId("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setAssigningDelivery(false); }
  };

  const populateCreateFormFromOrder = useCallback((o: any) => {
    setEditingOrderId(String(o._id));
    // Customer — if the order has a customerId, treat it as existing even if the
    // full customer list hasn't loaded yet (we'll re-resolve when it does).
    if (o.customerId) {
      const existing = (allCustomers ?? []).find((c) => String(c.id) === String(o.customerId));
      setCustomerMode("existing");
      setChosenCustomer(existing ?? {
        id: String(o.customerId),
        name: o.customerName ?? "",
        phone: o.phone ?? "",
        email: o.email ?? "",
        addresses: Array.isArray(o.customerAddresses) ? o.customerAddresses : [],
      });
    } else {
      setCustomerMode("new");
      setNewCustomer({
        name: o.customerName ?? "",
        phone: o.phone ?? "",
        email: o.email ?? "",
        dateOfBirth: "",
      });
    }
    // Hub — flag the effects to preserve our pre-populated sub-hub / products / coupons.
    skipSubHubResetRef.current = true;
    skipMenuResetRef.current = true;
    // Seed the sub-hubs list with the order's sub-hub so the Select can render its label
    // immediately, before the async fetch returns the full list.
    if (o.subHubId) {
      setSubHubs((prev) => {
        if (prev.some((h: any) => String(h.id) === String(o.subHubId))) return prev;
        return [{ id: String(o.subHubId), name: o.subHubName ?? "Selected sub-hub", location: "" }, ...prev];
      });
    }
    setSelectedSuperHubId(o.superHubId ?? "");
    setSelectedSubHubId(o.subHubId ?? "");
    // Items
    const products = (o.items ?? [])
      .filter((it: any) => it && it.productId)
      .map((it: any) => ({
        productId: String(it.productId),
        name: it.name ?? "",
        price: Number(it.price) || 0,
        unit: it.unit ?? "",
        quantity: Number(it.quantity) || 0,
      }));
    const customs = (o.items ?? [])
      .filter((it: any) => it && !it.productId)
      .map((it: any) => ({
        name: it.name ?? "",
        price: String(it.price ?? ""),
        quantity: String(it.quantity ?? "1"),
        unit: it.unit ?? "",
      }));
    setSelectedProducts(products);
    setOrderItems(customs);
    // Delivery
    const dt = o.deliveryType === "takeaway" ? "takeaway" : "delivery";
    setOrderDeliveryType(dt);
    if (dt === "delivery") {
      const d = o.deliveryAddressDetail || {};
      setOrderAddressMode("new");
      setSelectedAddressIdx(null);
      setNewAddress({
        label: d.label ?? "Home",
        name: d.name ?? d.contactName ?? "",
        phone: d.phone ?? o.phone ?? "",
        building: [d.houseNo, d.building].filter(Boolean).join(", ") || d.building || "",
        street: d.street ?? "",
        area: d.area ?? o.deliveryArea ?? "",
        pincode: d.pincode ?? "",
      });
    }
    setOrderNotes(o.notes ?? "");
    // Coupons
    const couponIds = Array.isArray(o.couponIds) && o.couponIds.length
      ? o.couponIds.map((x: any) => String(x))
      : (Array.isArray(o.coupons) ? o.coupons.map((c: any) => String(c.id ?? c._id ?? "")).filter(Boolean) : []);
    setAppliedCouponIds(couponIds);
    // Payment
    const ps = ["paid", "partial", "unpaid"].includes(o.paymentStatus) ? o.paymentStatus : "unpaid";
    setPaymentStatus(ps);
    const pays = Array.isArray(o.payments) ? o.payments : [];
    setPaymentEntries(pays.map((p: any) => ({
      mode: p.mode ?? "",
      amount: String(p.amount ?? ""),
      reference: p.reference ?? "",
    })));
    // Schedule
    setOrderScheduleType(o.scheduleType === "instant" ? "instant" : "slot");
    if (o.deliveryDate) setOrderDate(String(o.deliveryDate).slice(0, 10));
    if (o.timeslotId) setSelectedTimeslotId(String(o.timeslotId));
  }, [allCustomers]);

  const openEditOrder = (o: any) => {
    populateCreateFormFromOrder(o);
    setLocation(`/orders/edit/${o._id}`);
  };

  // When the customers list finishes loading after we've already pre-populated
  // a synthetic customer for an order being edited, swap in the real record so
  // saved addresses, etc. become available.
  useEffect(() => {
    if (!editingOrderId) return;
    if (!chosenCustomer?.id) return;
    if (Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0) return;
    const real = (allCustomers ?? []).find((c) => String(c.id) === String(chosenCustomer.id));
    if (real && real !== chosenCustomer) {
      setChosenCustomer(real);
    }
  }, [allCustomers, editingOrderId, chosenCustomer]);

  // If user lands directly on /orders/edit/:id (e.g. via refresh), fetch and populate.
  useEffect(() => {
    if (!isEditPage || !editIdFromUrl) return;
    if (editingOrderId === editIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/orders/${editIdFromUrl}`);
        const o = data?.order ?? data;
        if (!cancelled && o && o._id) populateCreateFormFromOrder(o);
      } catch {
        if (!cancelled) {
          toast({ title: "Order not found", variant: "destructive" });
          setLocation("/orders");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isEditPage, editIdFromUrl, editingOrderId, populateCreateFormFromOrder, setLocation, toast]);

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/api/orders/${editingOrder._id}`, { method: "PUT", body: JSON.stringify(editForm) });
      toast({ title: "Order updated successfully" });
      setOrders((prev) => prev.map((o) => String(o._id) === String(editingOrder._id) ? { ...o, ...editForm } : o));
      if (selectedOrder && String(selectedOrder._id) === String(editingOrder._id)) {
        setSelectedOrder((o: any) => ({ ...o, ...editForm }));
      }
      setEditingOrder(null);
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingEdit(false); }
  };

  const handleDeleteOrder = async () => {
    if (!deletingOrder) return;
    setConfirmingDelete(true);
    try {
      await apiFetch(`/api/orders/${deletingOrder._id}`, { method: "DELETE" });
      toast({ title: "Order deleted" });
      setOrders((prev) => prev.filter((o) => String(o._id) !== String(deletingOrder._id)));
      setTotal((t) => t - 1);
      if (selectedOrder && String(selectedOrder._id) === String(deletingOrder._id)) setSelectedOrder(null);
      setDeletingOrder(null);
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setConfirmingDelete(false); }
  };

  const clearFilters = () => {
    setSearch(""); setStatusFilter(""); setDeliveryTypeFilter("");
    setDateFrom(""); setDateTo(""); setSortField("createdAt"); setSortDir("desc");
    setSubHubFilter("");
  };

  const hasFilters = !!(search || statusFilter || deliveryTypeFilter || dateFrom || dateTo || subHubFilter);

  const totalAll = (statsTotals.total ?? 0) || (
    ACTIVE_STATUSES.reduce((s, k) => s + (statsData[k] ?? 0), 0) +
    HISTORY_STATUSES.reduce((s, k) => s + (statsData[k] ?? 0), 0) +
    (statsData.takeaway ?? 0)
  );
  const totalActive = statsTotals.currentTotal ?? ACTIVE_STATUSES.reduce((s, k) => s + (statsData[k] ?? 0), 0);
  const totalHistory = statsTotals.historyTotal ?? (HISTORY_STATUSES.reduce((s, k) => s + (statsData[k] ?? 0), 0) + (statsData.takeaway ?? 0));

  const invoiceCount = (statsData["delivered"] ?? 0) + (statsData["takeaway"] ?? 0);
  const TABS = [
    { key: "current" as const, label: "Current Orders", count: totalActive, icon: Clock, color: "text-blue-600" },
    { key: "history" as const, label: "History", count: totalHistory, icon: CheckCircle2, color: "text-green-600" },
    { key: "all" as const, label: "All Orders", count: totalAll, icon: ClipboardList, color: "text-gray-600" },
    { key: "invoices" as const, label: "Order Invoices", count: invoiceCount, icon: FileText, color: "text-violet-600" },
  ];

  // Inject title + subtitle + Refresh into the global top bar via a portal.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (isCreatePage) { setHeaderSlot(null); return; }
    setHeaderSlot(document.getElementById("page-header-slot"));
  }, [isCreatePage]);

  return (
    <div className="w-full bg-white">
      {headerSlot && createPortal(
        <>
          <h1 className="text-lg font-bold text-black truncate flex-shrink-0">Orders Management</h1>
          <div className="flex items-center flex-wrap gap-0 border-b border-transparent flex-1 min-w-0">
            {TABS.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setStatusFilter(""); }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex-shrink-0 ${
                  activeTab === key
                    ? "border-[#1A56DB] text-[#1A56DB]"
                    : "border-transparent text-black hover:text-[#1A56DB]"
                }`}
              >
                {label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === key ? "bg-[#1A56DB] text-white" : "bg-gray-100 text-black"}`}>{count}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { load(); loadStats(); }}
            className="flex-shrink-0 p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <span
              className="block w-5 h-5"
              style={{
                backgroundColor: "#1A56DB",
                WebkitMaskImage: `url(${recycleIcon})`,
                maskImage: `url(${recycleIcon})`,
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
          </button>
        </>,
        headerSlot
      )}

      {!isCreatePage && (<>

      {/* Full-width content area (no card wrapper) */}
      <div className="bg-white">

        {/* Status pills + New Order button — same row */}
        <div className="flex items-center justify-between gap-2 py-2">
          {activeTab !== "invoices" ? (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1">
              <button
                onClick={() => setStatusFilter("")}
                className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all bg-[#162B4D] text-white shadow-sm"
              >
                All
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white">
                  {totalAll}
                </span>
              </button>
              {ALL_STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const count = statsData[s] ?? 0;
                const solidBg = SOLID_STATUS_BG[s] ?? "bg-gray-500";
                return (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s === statusFilter ? "" : s); setActiveTab("all"); }}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${solidBg} text-white shadow-sm`}
                  >
                    {cfg.label}
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-white/25 text-white">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <button
            onClick={() => { resetCreateForm(); setLocation("/orders/new"); }}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold bg-[#1A56DB] hover:bg-[#1447B4] text-white shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Order
          </button>
        </div>

        {/* Toolbar */}
        <div className="py-2 flex flex-wrap gap-2 items-center bg-white">
          {/* Search — pill, reduced width */}
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-9 text-sm text-black placeholder:text-black/60 rounded-full"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
          </div>

          {/* Sub Hub filter */}
          {filterSubHubs.length > 0 && (
            <Select value={subHubFilter || "_all"} onValueChange={(v) => setSubHubFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9 w-36 text-sm text-black rounded-full border-gray-200">
                <SelectValue placeholder="All Sub Hubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Sub Hubs</SelectItem>
                {filterSubHubs.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Status filter dropdown */}
          <Select value={statusFilter || "_all"} onValueChange={(v) => { setStatusFilter(v === "_all" ? "" : v); }}>
            <SelectTrigger className="h-9 w-36 text-sm text-black rounded-full border-gray-200">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Statuses</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range picker */}
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <button className={`flex-shrink-0 flex items-center gap-2 h-9 px-4 rounded-full border text-sm font-medium transition-colors ${dateFrom || dateTo ? "border-[#1A56DB] bg-blue-50 text-[#1A56DB]" : "border-gray-200 text-black hover:border-gray-300"}`}>
                <Calendar className="w-3.5 h-3.5" />
                {dateFrom && dateTo
                  ? `${dateFrom} – ${dateTo}`
                  : dateFrom
                  ? dateFrom
                  : "Date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-3 w-auto" align="start">
              <DayPicker
                mode="range"
                selected={{
                  from: dateFrom ? new Date(dateFrom + "T00:00:00") : undefined,
                  to: dateTo ? new Date(dateTo + "T00:00:00") : undefined,
                }}
                onSelect={(range) => {
                  setDateFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
                  setDateTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
                  if (range?.to) setShowDatePicker(false);
                }}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); setShowDatePicker(false); }}
                  className="mt-1 w-full text-xs text-red-500 hover:text-red-600 font-medium py-1 rounded hover:bg-red-50 transition-colors"
                >
                  Clear dates
                </button>
              )}
            </PopoverContent>
          </Popover>

          {/* Clear all filters */}
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 h-9 px-3 rounded-full border border-gray-200 text-sm text-black hover:border-red-300 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Results Count */}
        <div className="py-2 text-xs text-black">
          {loading ? "Loading..." : activeTab === "invoices"
            ? `${orders.filter(o => o.status !== "cancelled").length} invoice${orders.filter(o => o.status !== "cancelled").length !== 1 ? "s" : ""}`
            : `${total} order${total !== 1 ? "s" : ""} found`}
          {statusFilter && activeTab !== "invoices" && <span className="ml-1">· filtered by <strong>{STATUS_CONFIG[statusFilter]?.label}</strong></span>}
        </div>

        {/* Orders Table / Invoices List */}
        {activeTab === "invoices" ? (
          loading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : orders.filter(o => o.status !== "cancelled").length === 0 ? (
            <div className="py-20 text-center">
              <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No completed orders to invoice</p>
              <p className="text-xs text-gray-300 mt-1">Delivered and takeaway orders will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Invoice #</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Items</th>
                    <th className="px-4 py-3 text-left">Total</th>
                    <th className="px-4 py-3 text-left">Hub</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.filter(o => o.status !== "cancelled").map((o, idx) => {
                    const tot = effectiveOrderTotal(o);
                    const invNo = "INV-" + String(o._id).slice(-6).toUpperCase();
                    return (
                      <tr key={String(o._id)} className="hover:bg-violet-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-1 rounded-lg">{invNo}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#162B4D] text-sm">{o.customerName}</p>
                          <p className="text-xs text-gray-400">{o.phone}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[#162B4D] font-medium text-sm">{(o.items ?? []).length} item{(o.items ?? []).length !== 1 ? "s" : ""}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[130px]">{(o.items ?? []).map((i: any) => i.name).join(", ")}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-[#162B4D]">{formatRupees(tot)}</span>
                          {o.paymentStatus && (
                            <p className={`text-[10px] font-semibold mt-0.5 ${o.paymentStatus === "paid" ? "text-green-600" : o.paymentStatus === "partial" ? "text-amber-600" : "text-red-500"}`}>
                              {o.paymentStatus === "paid" ? "Fully Paid" : o.paymentStatus === "partial" ? "Partial" : "Unpaid"}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {o.subHubName
                            ? <span className="text-xs text-gray-500">{o.subHubName}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={o.status} deliveryType={o.deliveryType} /></td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => setInvoiceOrder(o)}
                            className="h-8 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                          >
                            <FileText className="w-3.5 h-3.5" /> Invoice
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (<>
        {loading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No orders found</p>
            {hasFilters && <button onClick={clearFilters} className="mt-2 text-sm text-[#1A56DB] hover:underline font-semibold">Clear filters</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-200 text-xs font-semibold text-black uppercase tracking-wide">
                  <th className="px-3 py-4 text-center">Customer</th>
                  <th className="px-3 py-4 text-center">Items</th>
                  <th className="px-3 py-4 text-center">Total</th>
                  <th className="px-3 py-4 text-center">Payment</th>
                  <th className="px-3 py-4 text-center">Sub Hub</th>
                  <th className="px-3 py-4 text-center">Time Slot</th>
                  <th className="px-3 py-4 text-center">Location</th>
                  <th className="px-3 py-4 text-center">Status</th>
                  <th className="px-3 py-4 text-center">Operations</th>
                  <th className="px-3 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {orders.map((o) => {
                  const total = effectiveOrderTotal(o);
                  const items: any[] = Array.isArray(o.items) ? o.items : [];
                  const slot = formatTimeSlot(o);
                  return (
                    <tr key={String(o._id)} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-4">
                        <p className="font-semibold text-black text-sm">{o.customerName}</p>
                        <p className="text-xs text-black">{o.phone}</p>
                        <p className="text-xs text-black mt-1 whitespace-nowrap">{formatDate(o.createdAt)}</p>
                      </td>
                      <td className="px-3 py-4">
                        {items.length === 0 ? (
                          <span className="text-sm text-black">—</span>
                        ) : (
                          <div className="space-y-0.5 max-w-[220px]">
                            {items.map((it: any, i: number) => (
                              <p key={i} className="text-sm text-black truncate">
                                <span className="font-medium">{it.name}</span>
                                <span> × {Number(it.quantity) || 1}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <span className="font-bold text-black text-sm">{formatRupees(total)}</span>
                        {o.instantDeliveryCharge ? <p className="text-xs text-orange-600">+{formatRupees(o.instantDeliveryCharge)} delivery</p> : null}
                      </td>
                      <td className="px-3 py-4"><PaymentBadge order={o} /></td>
                      <td className="px-3 py-4">
                        {o.subHubName
                          ? <span className="text-sm font-medium text-black">{o.subHubName}</span>
                          : <span className="text-sm text-black">—</span>}
                      </td>
                      <td className="px-3 py-4">
                        {o.deliveryType === "takeaway" ? (
                          <span className="text-sm text-black italic">Takeaway</span>
                        ) : slot ? (
                          <span className="text-sm font-medium text-black whitespace-nowrap">{slot}</span>
                        ) : (
                          <span className="text-sm text-black">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {o.deliveryArea
                          ? <span className="text-sm text-black">{o.deliveryArea}</span>
                          : <span className="text-sm text-black">—</span>}
                      </td>
                      <td className="px-4 py-4"><SolidStatusBadge status={o.status} deliveryType={o.deliveryType} /></td>
                      <td className="px-4 py-4">
                        {o.status === "pending" ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={acceptingId === String(o._id)}
                              onClick={() => acceptOrder(o)}
                              className="inline-flex items-center justify-center h-7 px-3 rounded-full text-xs font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={acceptingId === String(o._id)}
                              onClick={() => { setRejectingOrder(o); setRejectReason(""); }}
                              className="inline-flex items-center justify-center h-7 px-3 rounded-full text-xs font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        ) : o.status === "cancelled" ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-red-600">Rejected</span>
                            {o.cancellationReason && (
                              <span className="text-xs text-black truncate max-w-[180px]" title={o.cancellationReason}>
                                {o.cancellationReason}
                              </span>
                            )}
                          </div>
                        ) : o.deliveryType === "takeaway" ? (
                          <span className="text-sm text-gray-400 italic">Not required</span>
                        ) : deliveryPersons.length > 0 ? (
                          <InlineDeliverySelect
                            order={o}
                            persons={deliveryPersons}
                            saving={inlineAssigningId === String(o._id)}
                            onAssign={inlineAssign}
                          />
                        ) : (
                          o.assignedDeliveryPersonName
                            ? <span className="text-sm font-medium text-orange-700">{o.assignedDeliveryPersonName}</span>
                            : <span className="text-sm text-gray-300 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            title="View"
                            onClick={() => {
                              setSelectedOrder(o);
                              setEditStatus(displayStatus(o.status, o.deliveryType));
                              setSelectedDeliveryPersonId(o.assignedDeliveryPersonId ?? "");
                              setShowAllPersons(false);
                            }}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
                          >
                            <MaskIcon src={iconView} color="#1A56DB" className="w-[18px] h-[18px]" />
                          </button>
                          <button
                            title="Edit"
                            onClick={() => openEditOrder(o)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
                          >
                            <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
                          </button>
                          <button
                            title="Delete"
                            onClick={() => setDeletingOrder(o)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors"
                          >
                            <MaskIcon src={iconDelete} color="#1A56DB" className="w-[18px] h-[18px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </>)}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between py-3 border-t border-gray-100 bg-white">
            <p className="text-xs text-black">Page {page} of {pages} · {total} total</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(pages, 7) }).map((_, i) => {
                const pg = i + 1;
                return (
                  <Button
                    key={pg}
                    variant={pg === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(pg)}
                    className={`h-7 w-7 p-0 text-xs ${pg === page ? "bg-[#1A56DB] border-[#1A56DB]" : ""}`}
                  >
                    {pg}
                  </Button>
                );
              })}
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
      </>)}

      {/* Invoice Modal */}
      {invoiceOrder && <InvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />}

      {/* Edit Order Modal */}
      <Dialog open={!!editingOrder} onOpenChange={(o) => { if (!o) setEditingOrder(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          {editingOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#162B4D] flex items-center gap-2">
                  <Pencil className="w-4 h-4" />
                  Edit Order
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-500">Customer Name</Label>
                    <Input
                      value={editForm.customerName}
                      onChange={(e) => setEditForm((f) => ({ ...f, customerName: e.target.value }))}
                      className="h-9 text-sm"
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-500">Phone</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      className="h-9 text-sm"
                      placeholder="Phone number"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500">Delivery Address</Label>
                  <Input
                    value={editForm.address}
                    onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="Full address"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500">Delivery Area</Label>
                  <Input
                    value={editForm.deliveryArea}
                    onChange={(e) => setEditForm((f) => ({ ...f, deliveryArea: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="Area / locality"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500">Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500">Notes</Label>
                  <Input
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="Order notes"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingOrder(null)} className="h-9">Cancel</Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="bg-emerald-600 hover:bg-emerald-700 h-9 text-white"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingOrder} onOpenChange={(o) => { if (!o && !confirmingDelete) setDeletingOrder(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          {deletingOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Delete Order
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete the order for{" "}
                  <span className="font-semibold text-[#162B4D]">{deletingOrder.customerName}</span>?
                </p>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    This action cannot be undone.
                  </p>
                  <p className="text-xs text-gray-500">
                    {Array.isArray(deletingOrder.items) ? deletingOrder.items.length : 0} item(s) ·{" "}
                    {formatRupees(effectiveOrderTotal(deletingOrder))} ·{" "}
                    <StatusBadge status={deletingOrder.status} deliveryType={deletingOrder.deliveryType} />
                  </p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDeletingOrder(null)} disabled={confirmingDelete} className="h-9">Cancel</Button>
                <Button
                  onClick={handleDeleteOrder}
                  disabled={confirmingDelete}
                  className="bg-red-600 hover:bg-red-700 h-9 text-white"
                >
                  {confirmingDelete ? "Deleting..." : "Delete Order"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Order Dialog — captures cancellation reason */}
      <Dialog open={!!rejectingOrder} onOpenChange={(o) => { if (!o && !confirmingReject) { setRejectingOrder(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-[440px]">
          {rejectingOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Reject Order
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <p className="text-sm text-black">
                  Reject the order for{" "}
                  <span className="font-semibold">{rejectingOrder.customerName}</span>?
                  This will mark the order as <span className="font-semibold">Cancelled</span>.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-black">Reason for cancellation <span className="text-red-500">*</span></Label>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Item out of stock, customer requested cancellation, address unreachable..."
                    className="text-sm min-h-[90px]"
                    autoFocus
                  />
                  <p className="text-[11px] text-black">This reason will be saved with the order.</p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setRejectingOrder(null); setRejectReason(""); }} disabled={confirmingReject} className="h-9">Cancel</Button>
                <Button
                  onClick={submitReject}
                  disabled={confirmingReject || !rejectReason.trim()}
                  className="bg-red-600 hover:bg-red-700 h-9 text-white gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  {confirmingReject ? "Rejecting..." : "Reject Order"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Order Page */}
      {isCreatePage && (
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { if (!creatingSaving) { setLocation("/orders"); resetCreateForm(); } }}
                disabled={creatingSaving}
                className="h-8 w-8 p-0"
                aria-label="Back to orders"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-[#162B4D] flex items-center gap-2">
                  {editingOrderId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingOrderId ? "Edit Order" : "Create New Order"}
                </h1>
                <p className="text-[11px] text-gray-400">{editingOrderId ? "Update any details and save changes" : "Fill in the details and create the order"}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { if (!creatingSaving) { setLocation("/orders"); resetCreateForm(); } }}
              disabled={creatingSaving}
              className="h-8 w-8 p-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5">
          <div className="space-y-5 pt-1">
            {/* HUB SELECTION (must be picked first) */}
            <div className="space-y-2 p-3 rounded-2xl border border-blue-100 bg-blue-50/40">
              <p className="text-[10px] font-bold text-[#1A56DB] uppercase tracking-widest">Step 1 · Fulfillment Hub *</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">Super Hub</Label>
                  <Select value={selectedSuperHubId} onValueChange={setSelectedSuperHubId} disabled={loadingSuperHubs}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={loadingSuperHubs ? "Loading..." : "Select super hub"} />
                    </SelectTrigger>
                    <SelectContent>
                      {superHubs.length === 0 ? (
                        <div className="p-2 text-xs text-gray-400 text-center">No super hubs found</div>
                      ) : superHubs.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-gray-400" />
                            {h.name}
                            {h.location && <span className="text-[10px] text-gray-400">· {h.location}</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">Sub Hub</Label>
                  <Select value={selectedSubHubId} onValueChange={setSelectedSubHubId} disabled={!selectedSuperHubId || loadingSubHubs}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={
                        !selectedSuperHubId ? "Select super hub first" :
                        loadingSubHubs ? "Loading..." :
                        subHubs.length === 0 ? "No sub-hubs" : "Select sub hub"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {subHubs.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-gray-400" />
                            {h.name}
                            {h.location && <span className="text-[10px] text-gray-400">· {h.location}</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedSubHubId && (
                <p className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                  <ShoppingBag className="w-3 h-3" /> {loadingProducts ? "Loading catalog..." : `${subHubProducts.length} products available in this sub-hub`}
                </p>
              )}
            </div>

            {/* CUSTOMER SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer</p>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    onClick={() => { setCustomerMode("existing"); setChosenCustomer(null); }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${customerMode === "existing" ? "bg-white text-[#1A56DB] shadow-sm" : "text-gray-500"}`}
                  >Existing</button>
                  <button
                    onClick={() => { setCustomerMode("new"); setChosenCustomer(null); }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${customerMode === "new" ? "bg-white text-[#1A56DB] shadow-sm" : "text-gray-500"}`}
                  >New Customer</button>
                </div>
              </div>

              {customerMode === "existing" ? (
                <div className="space-y-2">
                  <Popover open={customerDropdownOpen} onOpenChange={setCustomerDropdownOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors text-left"
                      >
                        {chosenCustomer ? (
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-full bg-[#1A56DB] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {chosenCustomer.name?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-[#162B4D] text-sm truncate">{chosenCustomer.name || "(No name)"}</p>
                              <p className="text-[11px] text-gray-400 truncate">
                                {chosenCustomer.phone || chosenCustomer.email || "—"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {loadingCustomers ? "Loading customers..." : `Select a customer (${allCustomers.length} available)`}
                          </span>
                        )}
                        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${customerDropdownOpen ? "rotate-180" : ""}`} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 shadow-xl border border-gray-100 rounded-2xl overflow-hidden"
                      align="start"
                      sideOffset={6}
                      style={{ width: "var(--radix-popover-trigger-width)", maxHeight: "min(420px, var(--radix-popover-content-available-height))" }}
                    >
                      <div className="p-2 border-b border-gray-100 bg-gray-50/80">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <Input
                            autoFocus
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Search name, phone or email..."
                            className="pl-7 h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div
                        className="max-h-[320px] overflow-y-auto overscroll-contain py-1"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      >
                        {loadingCustomers ? (
                          <p className="p-4 text-xs text-gray-400 text-center">Loading...</p>
                        ) : filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center">
                            <p className="text-xs text-gray-400">No customers match.</p>
                            <button
                              onClick={() => {
                                setCustomerMode("new");
                                setNewCustomer((n) => ({ ...n, name: customerSearch.trim() }));
                                setCustomerDropdownOpen(false);
                              }}
                              className="mt-1 text-xs text-[#1A56DB] font-semibold hover:underline"
                            >
                              + Create new customer
                            </button>
                          </div>
                        ) : (
                          filteredCustomers.map((c) => {
                            const isSelected = chosenCustomer?.id === c.id;
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setChosenCustomer(c);
                                  const addrs = Array.isArray(c.addresses) ? c.addresses : [];
                                  const defaultIdx = addrs.findIndex((a: any) => getAddressFields(a)?.isDefault);
                                  setSelectedAddressIdx(addrs.length ? (defaultIdx >= 0 ? defaultIdx : 0) : null);
                                  setOrderAddressMode(addrs.length ? "saved" : "new");
                                  setCustomerDropdownOpen(false);
                                  setCustomerSearch("");
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors text-left ${isSelected ? "bg-blue-50/60" : ""}`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${isSelected ? "bg-[#1A56DB] text-white" : "bg-[#162B4D]/10 text-[#162B4D]"}`}>
                                  {c.name?.charAt(0).toUpperCase() || "?"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold truncate ${isSelected ? "text-[#1A56DB]" : "text-[#162B4D]"}`}>
                                    {c.name || "(No name)"}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                                    {c.phone && <span className="inline-flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{c.phone}</span>}
                                    {c.email && <span className="inline-flex items-center gap-0.5 truncate"><Mail className="w-2.5 h-2.5" />{c.email}</span>}
                                  </div>
                                  {Array.isArray(c.addresses) && c.addresses.length > 0 && (
                                    <p className="text-[10px] text-emerald-600 mt-0.5 inline-flex items-center gap-0.5">
                                      <Home className="w-2.5 h-2.5" /> {c.addresses.length} saved address{c.addresses.length > 1 ? "es" : ""}
                                    </p>
                                  )}
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-[#1A56DB] flex-shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {chosenCustomer && (
                    <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-[#1A56DB] uppercase tracking-widest">Customer Details</p>
                        <button onClick={() => { setChosenCustomer(null); setSelectedAddressIdx(null); }} className="text-gray-400 hover:text-red-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div className="flex items-center gap-1 text-gray-600"><User className="w-3 h-3 text-gray-400" /> {chosenCustomer.name || "—"}</div>
                        <div className="flex items-center gap-1 text-gray-600"><Phone className="w-3 h-3 text-gray-400" /> {chosenCustomer.phone || "—"}</div>
                        <div className="flex items-center gap-1 text-gray-600 col-span-2 truncate"><Mail className="w-3 h-3 text-gray-400" /> {chosenCustomer.email || "—"}</div>
                        {chosenCustomer.dateOfBirth && (
                          <div className="flex items-center gap-1 text-gray-600 col-span-2"><span className="text-gray-400">DOB:</span> {chosenCustomer.dateOfBirth}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-500">Full name *</Label>
                    <Input value={newCustomer.name} onChange={(e) => setNewCustomer((n) => ({ ...n, name: e.target.value }))} className="h-9 text-sm" placeholder="Full name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-500">Phone *</Label>
                    <Input
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer((n) => ({ ...n, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                      className="h-9 text-sm"
                      placeholder="10-digit number"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-500">Email</Label>
                    <Input value={newCustomer.email} onChange={(e) => setNewCustomer((n) => ({ ...n, email: e.target.value }))} className="h-9 text-sm" placeholder="email@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-500">Date of birth</Label>
                    <Input
                      type="date"
                      value={newCustomer.dateOfBirth}
                      onChange={(e) => setNewCustomer((n) => ({ ...n, dateOfBirth: e.target.value }))}
                      max={new Date().toISOString().slice(0, 10)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <p className="col-span-2 text-[11px] text-gray-400">Customer will be saved automatically. The delivery address you enter below becomes their first saved address.</p>
                </div>
              )}
            </div>

            {/* DELIVERY TYPE */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order Type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrderDeliveryType("delivery")}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${orderDeliveryType === "delivery" ? "border-[#1A56DB] bg-blue-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${orderDeliveryType === "delivery" ? "bg-[#1A56DB] text-white" : "bg-gray-100 text-gray-400"}`}>
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#162B4D]">Delivery</p>
                    <p className="text-[11px] text-gray-400">Send to customer's address</p>
                  </div>
                </button>
                <button
                  onClick={() => setOrderDeliveryType("takeaway")}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${orderDeliveryType === "takeaway" ? "border-emerald-500 bg-emerald-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${orderDeliveryType === "takeaway" ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#162B4D]">Takeaway</p>
                    <p className="text-[11px] text-gray-400">Customer picks up at store</p>
                  </div>
                </button>
              </div>
            </div>

            {/* ADDRESS (only for delivery) */}
            {orderDeliveryType === "delivery" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Address</p>
                  {chosenCustomer && Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0 && (
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                      <button
                        onClick={() => setOrderAddressMode("saved")}
                        className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md ${orderAddressMode === "saved" ? "bg-white text-[#1A56DB] shadow-sm" : "text-gray-500"}`}
                      >Saved</button>
                      <button
                        onClick={() => setOrderAddressMode("new")}
                        className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md ${orderAddressMode === "new" ? "bg-white text-[#1A56DB] shadow-sm" : "text-gray-500"}`}
                      >New</button>
                    </div>
                  )}
                </div>
                {chosenCustomer && orderAddressMode === "saved" && Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0 ? (
                  <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {chosenCustomer.addresses.map((a: any, i: number) => {
                      const f = getAddressFields(a);
                      const lines = formatAddressLines(a);
                      const isSelected = selectedAddressIdx === i;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedAddressIdx(i)}
                          className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${isSelected ? "border-[#1A56DB] bg-blue-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[#1A56DB] text-white" : "bg-gray-100 text-gray-400"}`}>
                            <Home className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-[#162B4D]">{f?.label || `Address ${i + 1}`}</p>
                              {f?.isDefault && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">DEFAULT</span>}
                              {f?.contactName && <span className="text-[10px] text-gray-500">· {f.contactName}</span>}
                              {f?.phone && <span className="text-[10px] text-gray-400 inline-flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{f.phone}</span>}
                            </div>
                            {lines.length > 0 ? (
                              lines.map((ln, li) => (
                                <p key={li} className="text-[11.5px] text-gray-600 leading-tight">{ln}</p>
                              ))
                            ) : (
                              <p className="text-[11px] text-gray-400 italic">No address details</p>
                            )}
                            {f?.instructions && <p className="text-[10px] text-amber-700 italic mt-0.5">Note: {f.instructions}</p>}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#1A56DB] flex-shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3 p-3 bg-gray-50/60 border border-gray-100 rounded-xl">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Full Name *</Label>
                        <Input value={newAddress.name} onChange={(e) => setNewAddress((a) => ({ ...a, name: e.target.value }))} placeholder="Recipient name" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Phone *</Label>
                        <Input
                          value={newAddress.phone}
                          onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                          placeholder="10-digit mobile"
                          className="h-9 text-sm"
                          inputMode="numeric"
                          maxLength={10}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Building / Flat No *</Label>
                        <Input value={newAddress.building} onChange={(e) => setNewAddress((a) => ({ ...a, building: e.target.value }))} placeholder="Wing A, Flat 302, Building Name" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Street / Locality</Label>
                        <Input value={newAddress.street} onChange={(e) => setNewAddress((a) => ({ ...a, street: e.target.value }))} placeholder="Street name or society" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Area / Suburb *</Label>
                        <Input value={newAddress.area} onChange={(e) => setNewAddress((a) => ({ ...a, area: e.target.value }))} placeholder="e.g. Thane West" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Pincode *</Label>
                        <Input
                          value={newAddress.pincode}
                          onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                          placeholder="6-digit pincode"
                          className="h-9 text-sm"
                          inputMode="numeric"
                          maxLength={6}
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500">Address Type</Label>
                        <Select value={newAddress.label || "Home"} onValueChange={(v) => setNewAddress((a) => ({ ...a, label: v }))}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Home">Home</SelectItem>
                            <SelectItem value="Work">Work</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {orderDeliveryType === "takeaway" && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <Store className="w-4 h-4 text-emerald-600 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-emerald-800">Takeaway from FishTokri Store</p>
                  <p className="text-[11px] text-emerald-600">Customer will collect this order directly from the store. No delivery address required.</p>
                </div>
              </div>
            )}

            {/* ITEMS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Items <span className="text-gray-300">({totalItemCount})</span>
                </p>
              </div>

              {/* Action bar — prominent Add Product + Custom Item */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Popover open={productPickerOpen} onOpenChange={(o) => { setProductPickerOpen(o); if (!o) { setPickerCategory(null); setProductSearch(""); } }}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={!selectedSubHubId}
                      className="h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A56DB] text-white text-sm font-semibold shadow-sm hover:bg-[#1647b8] active:bg-[#0f3a99] transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                      title={selectedSubHubId ? "Add a product from the catalog" : "Select a sub-hub first"}
                    >
                      <Package className="w-4 h-4" />
                      Add Product
                    </button>
                  </PopoverTrigger>
                    <PopoverContent
                      className="p-0 shadow-xl border border-gray-100 rounded-2xl overflow-hidden w-[420px]"
                      align="end"
                      sideOffset={6}
                      style={{ maxHeight: "min(420px, var(--radix-popover-content-available-height))" }}
                    >
                      <div className="p-2 border-b border-gray-100 bg-gray-50/80 space-y-2">
                        {pickerCategory && (
                          <button
                            type="button"
                            onClick={() => { setPickerCategory(null); setProductSearch(""); }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1A56DB] hover:underline"
                          >
                            <ChevronDown className="w-3 h-3 rotate-90" /> Back to categories
                          </button>
                        )}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <Input
                            autoFocus
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder={pickerCategory ? `Search in ${pickerCategory}...` : "Search categories or products..."}
                            className="pl-7 h-8 text-sm"
                          />
                        </div>
                        {pickerCategory && (
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            {pickerCategory} <span className="text-gray-300">· {filteredProducts.length} item{filteredProducts.length === 1 ? "" : "s"}</span>
                          </p>
                        )}
                      </div>
                      <div
                        className="max-h-[320px] overflow-y-auto overscroll-contain py-1"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      >
                        {loadingProducts ? (
                          <p className="p-4 text-xs text-gray-400 text-center">Loading products...</p>
                        ) : !pickerCategory && !productSearch.trim() ? (
                          filteredCategories.length === 0 ? (
                            <p className="p-4 text-xs text-gray-400 text-center">No categories available.</p>
                          ) : (
                            filteredCategories.map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => { setPickerCategory(c.name); setProductSearch(""); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left"
                              >
                                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-4 h-4 text-[#1A56DB]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-[#162B4D] truncate">{c.name}</p>
                                  <p className="text-[11px] text-gray-400">{c.count} product{c.count === 1 ? "" : "s"}</p>
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 -rotate-90" />
                              </button>
                            ))
                          )
                        ) : filteredProducts.length === 0 ? (
                          <p className="p-4 text-xs text-gray-400 text-center">No products match.</p>
                        ) : (
                          filteredProducts.map((p) => {
                            const pid = String(p._id);
                            const already = selectedProducts.find((sp) => sp.productId === pid);
                            return (
                              <button
                                key={pid}
                                disabled={(Number(p.quantity) || 0) <= 0 || (already?.quantity ?? 0) >= (Number(p.quantity) || 0)}
                                onClick={() => {
                                  const stock = Number(p.quantity) || 0;
                                  if (stock <= 0) {
                                    toast({ title: "Out of stock", description: `${p.name} is unavailable in this sub-hub.`, variant: "destructive" });
                                    return;
                                  }
                                  const current = already?.quantity ?? 0;
                                  if (current + 1 > stock) {
                                    toast({ title: "Stock limit reached", description: `Only ${stock} ${p.unit || "unit(s)"} available for ${p.name}.`, variant: "destructive" });
                                    return;
                                  }
                                  setSelectedProducts((prev) => {
                                    const exists = prev.find((sp) => sp.productId === pid);
                                    if (exists) {
                                      return prev.map((sp) => sp.productId === pid ? { ...sp, quantity: sp.quantity + 1 } : sp);
                                    }
                                    return [...prev, {
                                      productId: pid,
                                      name: p.name,
                                      price: Number(p.price) || 0,
                                      unit: p.unit ?? "",
                                      quantity: 1,
                                    }];
                                  });
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${already ? "bg-blue-50/40" : ""}`}
                              >
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-4 h-4 text-gray-300" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-[#162B4D] truncate">{p.name}</p>
                                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                                    <span className="font-semibold text-[#1A56DB]">{formatRupees(p.price)}</span>
                                    {p.unit && <span>/ {p.unit}</span>}
                                    {p.category && <span className="truncate">· {p.category}</span>}
                                  </div>
                                </div>
                                {already ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">×{already.quantity}</span>
                                ) : (
                                  <Plus className="w-3.5 h-3.5 text-[#1A56DB] flex-shrink-0" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                      {selectedProducts.length > 0 && (
                        <div className="p-2 border-t border-gray-100 bg-gray-50/80 text-[11px] text-gray-500 flex items-center justify-between">
                          <span>{selectedProducts.length} selected</span>
                          <button onClick={() => setProductPickerOpen(false)} className="font-semibold text-[#1A56DB] hover:underline">Done</button>
                        </div>
                      )}
                    </PopoverContent>
                </Popover>

                <button
                  type="button"
                  onClick={() => setOrderItems((arr) => [...arr, { name: "", price: "", quantity: "1", unit: "" }])}
                  className="h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1A56DB]/40 text-[#1A56DB] text-sm font-semibold bg-[#1A56DB]/5 hover:bg-[#1A56DB]/10 hover:border-[#1A56DB]/60 transition-colors"
                  title="Add a one-off item not in the catalog"
                >
                  <Plus className="w-4 h-4" />
                  Custom Item
                </button>
              </div>

              {!selectedSubHubId && selectedProducts.length === 0 && orderItems.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-700 inline-flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>Select a sub-hub above to choose products from its catalog, or add a custom item.</span>
                </div>
              )}

              {selectedSubHubId && selectedProducts.length === 0 && orderItems.length === 0 && (
                <div className="px-4 py-6 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold text-[#162B4D]">No items added yet</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Use <span className="font-semibold text-[#1A56DB]">Add Product</span> to pick from the catalog or <span className="font-semibold text-[#1A56DB]">Custom Item</span> for a one-off entry.</p>
                </div>
              )}

              {/* Selected catalog products */}
              {selectedProducts.length > 0 && (
                <div className="space-y-1.5">
                  {selectedProducts.map((p, idx) => {
                    const stock = stockOf(p.productId);
                    const atMax = p.quantity >= stock;
                    return (
                    <div key={p.productId} className="flex items-center gap-2 p-2 rounded-xl border border-blue-100 bg-blue-50/50">
                      <ShoppingBag className="w-3.5 h-3.5 text-[#1A56DB] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#162B4D] truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {formatRupees(p.price)}{p.unit ? ` / ${p.unit}` : ""}
                          {Number.isFinite(stock) && (
                            <span className={`ml-1 ${atMax ? "text-amber-600 font-semibold" : "text-gray-400"}`}>· stock {stock}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg">
                        <button
                          onClick={() => setSelectedProducts((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-[#1A56DB]"
                        >−</button>
                        <Input
                          type="number"
                          value={p.quantity}
                          onChange={(e) => {
                            const requested = Math.max(1, Number(e.target.value) || 1);
                            const clamped = Math.min(requested, stock);
                            if (requested > stock) {
                              toast({ title: "Stock limit reached", description: `Only ${stock} ${p.unit || "unit(s)"} available for ${p.name}.`, variant: "destructive" });
                            }
                            setSelectedProducts((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: clamped } : x));
                          }}
                          className="h-7 w-12 text-center text-sm border-0 px-0 focus-visible:ring-0"
                        />
                        <button
                          disabled={atMax}
                          onClick={() => {
                            if (atMax) {
                              toast({ title: "Stock limit reached", description: `Only ${stock} ${p.unit || "unit(s)"} available for ${p.name}.`, variant: "destructive" });
                              return;
                            }
                            setSelectedProducts((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x));
                          }}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-[#1A56DB] disabled:text-gray-300 disabled:cursor-not-allowed"
                        >+</button>
                      </div>
                      <span className="text-sm font-bold text-[#162B4D] w-16 text-right">{formatRupees(p.price * p.quantity)}</span>
                      <button
                        onClick={() => setSelectedProducts((arr) => arr.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Custom items */}
              {orderItems.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Custom items</p>
                  {orderItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <Input value={it.name} onChange={(e) => setOrderItems((arr) => arr.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="Item name" className="h-9 text-sm col-span-5" />
                      <Input value={it.price} onChange={(e) => setOrderItems((arr) => arr.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} placeholder="Price" type="number" className="h-9 text-sm col-span-2" />
                      <Input value={it.quantity} onChange={(e) => setOrderItems((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" type="number" className="h-9 text-sm col-span-2" />
                      <Input value={it.unit} onChange={(e) => setOrderItems((arr) => arr.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} placeholder="Unit" className="h-9 text-sm col-span-2" />
                      <button
                        onClick={() => setOrderItems((arr) => arr.filter((_, i) => i !== idx))}
                        className="col-span-1 h-9 flex items-center justify-center text-gray-400 hover:text-red-500"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 px-3 py-2 bg-[#162B4D]/5 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatRupees(itemsSubtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-emerald-600">
                    <span className="inline-flex items-center gap-1">
                      <Ticket className="w-3 h-3" />
                      {appliedCoupons.length > 1
                        ? `Coupons (${appliedCoupons.length})`
                        : `Coupon ${appliedCoupons[0]?.code ?? ""}`}
                    </span>
                    <span>− {formatRupees(couponDiscount)}</span>
                  </div>
                )}
                {slotExtraCharge > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Slot charge</span>
                    <span>+ {formatRupees(slotExtraCharge)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-[#162B4D]/10">
                  <span className="text-xs font-semibold text-gray-600">Order Total</span>
                  <span className="font-bold text-[#162B4D] text-base">{formatRupees(newOrderTotal)}</span>
                </div>
                {paymentStatus !== "unpaid" && paidTotal > 0 && (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-emerald-600">
                      <span>Paid</span>
                      <span>{formatRupees(paidTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-amber-600">
                      <span>Due</span>
                      <span>{formatRupees(dueAmount)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* COUPON — only after a product/item is added */}
            {totalItemCount > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Coupons</p>

                {appliedCoupons.length > 0 && (
                  <div className="space-y-1.5">
                    {appliedCoupons.map((c) => {
                      const min = Number(c.minOrderAmount) || 0;
                      const v = Number(c.discountValue) || 0;
                      const eligible = itemsSubtotal >= min;
                      const saved = !eligible
                        ? 0
                        : c.type === "percentage"
                          ? Math.round((itemsSubtotal * v) / 100)
                          : v;
                      return (
                        <div
                          key={String(c._id)}
                          className="flex items-center gap-2 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50"
                        >
                          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white shrink-0">
                            <Ticket className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-emerald-800 truncate">
                              {c.code}{" "}
                              <span className="text-[11px] font-normal text-emerald-600">
                                {eligible ? `· saved ${formatRupees(saved)}` : `· min ₹${min} required`}
                              </span>
                            </p>
                            {c.title && <p className="text-[11px] text-emerald-700 truncate">{c.title}</p>}
                          </div>
                          <button
                            onClick={() => toggleCoupon(String(c._id))}
                            className="text-emerald-700 hover:text-red-500"
                            aria-label="Remove coupon"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                      placeholder="Enter coupon code"
                      className="pl-7 h-9 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyCouponByCode}
                    disabled={!couponCode.trim()}
                    className="h-9 text-sm"
                  >Apply</Button>
                </div>
                {couponError && <p className="text-[11px] text-red-500">{couponError}</p>}

                {activeCoupons.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Available coupons</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeCoupons.slice(0, 8).map((c) => {
                        const id = String(c._id);
                        const min = Number(c.minOrderAmount) || 0;
                        const applicable = isCouponApplicable(c);
                        const eligible = applicable && itemsSubtotal >= min;
                        const isApplied = appliedCouponIds.includes(id);
                        const reason = !applicable
                          ? "Not valid for the items in this order"
                          : !eligible
                            ? `Min order ₹${min} required`
                            : (c.title || c.description || "");
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={!eligible && !isApplied}
                            onClick={() => toggleCoupon(id)}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors inline-flex items-center gap-1 ${
                              isApplied
                                ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : eligible
                                  ? "border-blue-200 bg-blue-50 text-[#1A56DB] hover:bg-blue-100"
                                  : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed opacity-60"
                            }`}
                            title={reason}
                          >
                            <Ticket className="w-3 h-3" />
                            {c.code}
                            <span className="text-[10px] font-normal opacity-70">
                              {c.type === "percentage" ? `${c.discountValue}% off` : `₹${c.discountValue} off`}
                              {min > 0 ? ` · min ₹${min}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {selectedSubHubId && !loadingCoupons && activeCoupons.length === 0 && (
                  <p className="text-[11px] text-gray-400">No active coupons for this sub-hub.</p>
                )}
              </div>
            )}

            {/* PAYMENT */}
            {totalItemCount > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment</p>

                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: "unpaid", label: "Unpaid", color: "amber" },
                    { v: "partial", label: "Partial", color: "blue" },
                    { v: "paid", label: "Fully Paid", color: "emerald" },
                  ] as const).map((opt) => {
                    const active = paymentStatus === opt.v;
                    const colorMap: Record<string, string> = {
                      amber: active ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                      blue: active ? "border-blue-300 bg-blue-50 text-[#1A56DB]" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                      emerald: active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                    };
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setPaymentStatus(opt.v)}
                        className={`h-9 rounded-xl border text-xs font-semibold transition-colors ${colorMap[opt.color]}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {paymentStatus !== "unpaid" && (
                  <div className="space-y-2">
                    {paymentEntries.map((entry, idx) => {
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
                                setPaymentEntries((arr) =>
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
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const otherSum = paymentEntries.reduce(
                                  (s, p, i) => s + (i === idx ? 0 : Number(p.amount) || 0),
                                  0
                                );
                                const maxAllowed = Math.max(0, newOrderTotal - otherSum);
                                let next = e.target.value;
                                if (Number.isFinite(raw) && raw > maxAllowed) {
                                  next = String(maxAllowed);
                                }
                                setPaymentEntries((arr) =>
                                  arr.map((p, i) => (i === idx ? { ...p, amount: next } : p))
                                );
                              }}
                              placeholder="Amount"
                              className="pl-6 h-9 text-sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setPaymentEntries((arr) => arr.filter((_, i) => i !== idx))}
                            disabled={paymentEntries.length === 1}
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
                          setPaymentEntries((arr) => [
                            ...arr,
                            {
                              mode: "cash",
                              amount: dueAmount > 0 ? String(dueAmount) : "",
                              reference: "",
                            },
                          ])
                        }
                        className="h-8 text-xs gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add payment
                      </Button>
                      <div className="text-[11px] text-gray-500 flex items-center gap-3">
                        <span>Paid: <span className="font-semibold text-gray-700">{formatRupees(paidTotal)}</span></span>
                        <span>
                          Due:{" "}
                          <span className={`font-semibold ${dueAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {formatRupees(dueAmount)}
                          </span>
                        </span>
                      </div>
                    </div>

                    {paymentStatus === "paid" && paidTotal !== newOrderTotal && (
                      <p className="text-[11px] text-amber-600">
                        For "Fully Paid", total payments should equal {formatRupees(newOrderTotal)}.
                      </p>
                    )}
                    {paymentStatus === "partial" && (paidTotal <= 0 || paidTotal >= newOrderTotal) && (
                      <p className="text-[11px] text-amber-600">
                        For "Partial", paid amount must be greater than 0 and less than {formatRupees(newOrderTotal)}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SCHEDULE (delivery only — takeaway uses today's date and instant fulfillment) */}
            {orderDeliveryType === "delivery" && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Delivery Schedule</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" /> Delivery Date
                  </Label>
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">Delivery Type</Label>
                  <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setOrderScheduleType("slot")}
                      className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md inline-flex items-center justify-center gap-1 ${orderScheduleType === "slot" ? "bg-white text-[#1A56DB] shadow-sm" : "text-gray-500"}`}
                    ><Clock className="w-3 h-3" /> Time Slot</button>
                    <button
                      type="button"
                      onClick={() => { setOrderScheduleType("instant"); setSelectedTimeslotId(""); }}
                      className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md inline-flex items-center justify-center gap-1 ${orderScheduleType === "instant" ? "bg-white text-amber-600 shadow-sm" : "text-gray-500"}`}
                    ><Zap className="w-3 h-3" /> Instant</button>
                  </div>
                </div>
              </div>
              {orderScheduleType === "slot" && (
                <div className="space-y-1">
                  {!selectedSubHubId ? (
                    <p className="text-[11px] text-gray-400">Select a sub-hub to see available time slots.</p>
                  ) : loadingTimeslots ? (
                    <p className="text-[11px] text-gray-400">Loading time slots...</p>
                  ) : activeTimeslots.length === 0 ? (
                    <p className="text-[11px] text-gray-400">No time slots configured for this sub-hub.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeTimeslots.map((t) => {
                        const id = String(t._id);
                        const isSelected = selectedTimeslotId === id;
                        const extra = Number(t.extraCharge) || 0;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedTimeslotId(id)}
                            className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${isSelected ? "border-[#1A56DB] bg-blue-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[#1A56DB] text-white" : "bg-gray-100 text-gray-400"}`}>
                              {t.isInstant ? <Zap className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[#162B4D] truncate">{t.label}</p>
                              <p className="text-[10px] text-gray-400">{t.startTime} – {t.endTime}{extra > 0 ? ` · +₹${extra}` : ""}</p>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#1A56DB] flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {orderScheduleType === "instant" && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                  <Zap className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
                  <p className="text-[11px] text-amber-700">Order will be sent for delivery as soon as possible.</p>
                </div>
              )}
            </div>
            )}

            {/* NOTES */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500">Notes (optional)</Label>
              <Textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Any special instructions..." className="text-sm min-h-[60px]" />
            </div>
          </div>

        </div>

        <div className="bg-white border-t border-gray-200">
          <div className="px-4 sm:px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setLocation("/orders"); resetCreateForm(); }} disabled={creatingSaving} className="h-9">Cancel</Button>
            <Button onClick={handleCreateOrder} disabled={creatingSaving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9 text-white gap-1.5">
              {creatingSaving
                ? (editingOrderId ? "Saving..." : "Creating...")
                : editingOrderId
                  ? (<><Pencil className="w-3.5 h-3.5" /> Save Changes</>)
                  : (<><Plus className="w-3.5 h-3.5" /> Create Order</>)}
            </Button>
          </div>
        </div>
      </div>
      )}

      {/* Order Detail Sheet — slides in from the right */}
      <Sheet open={!!selectedOrder} onOpenChange={(o) => { if (!o) { setSelectedOrder(null); setShowAllPersons(false); } }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[560px] p-0 flex flex-col gap-0 bg-white"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          {selectedOrder && (
            <>
              {/* ── Header ── */}
              <SheetHeader className="px-6 pt-6 pb-5 bg-white border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SheetTitle className="text-[10px] font-semibold text-black uppercase tracking-widest mb-1.5">
                      Order Details
                    </SheetTitle>
                    <p className="text-2xl font-extrabold text-[#364F9F] tracking-tight leading-none">
                      {formatOrderId(selectedOrder, dailySeqMap.get(String(selectedOrder._id)))}
                    </p>
                    <p className="text-sm font-medium text-black mt-2">{formatDate(selectedOrder.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <SolidStatusBadge status={selectedOrder.status} deliveryType={selectedOrder.deliveryType} />
                    <span className="text-xl font-extrabold text-[#F05B4E]">
                      {formatRupees(effectiveOrderTotal(selectedOrder) > 0 ? effectiveOrderTotal(selectedOrder) : orderTotal(selectedOrder.items))}
                    </span>
                  </div>
                </div>
              </SheetHeader>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

                {/* ── 1. CUSTOMER ── */}
                <div className="px-6 py-6">
                  <div className="flex items-center gap-2.5 mb-5">
                    <MaskIcon src={iconUser} color="#364F9F" className="w-[20px] h-[20px]" />
                    <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Customer</span>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-full bg-[#EEF1F9] flex items-center justify-center flex-shrink-0 border-2 border-[#364F9F]/25">
                      <span className="text-lg font-extrabold text-[#364F9F]">
                        {(selectedOrder.customerName || "?").trim().charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <p className="font-extrabold text-black text-[18px] leading-tight">{selectedOrder.customerName}</p>
                      {selectedOrder.phone && (
                        <a href={`tel:${selectedOrder.phone}`} className="flex items-center gap-2.5 text-sm font-semibold text-black hover:text-[#364F9F] transition-colors">
                          <MaskIcon src={iconPhoneCall} color="#364F9F" className="w-[18px] h-[18px] flex-shrink-0" />
                          <span>{selectedOrder.phone}</span>
                        </a>
                      )}
                      {selectedOrder.address && (
                        <div className="flex items-start gap-2.5 text-sm font-semibold text-black">
                          <MaskIcon src={iconPin} color="#F05B4E" className="w-[18px] h-[18px] flex-shrink-0 mt-0.5" />
                          <span className="leading-snug">
                            {selectedOrder.address}
                            {selectedOrder.deliveryArea && (
                              <span className="block text-sm font-medium text-black mt-0.5">{selectedOrder.deliveryArea}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── 2. ORDER ITEMS ── */}
                <div className="px-6 py-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <MaskIcon src={iconGrocery} color="#364F9F" className="w-[20px] h-[20px]" />
                      <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Order Items</span>
                    </div>
                    <span className="text-sm font-bold text-black">
                      {(selectedOrder.items ?? []).length} item{(selectedOrder.items ?? []).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="space-y-4">
                    {(selectedOrder.items ?? []).map((item: any, i: number) => {
                      const qty = Number(item.quantity || 1);
                      const lineTotal = Number(item.price) * qty;
                      return (
                        <li key={i} className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-black text-base">{item.name}</p>
                            <p className="text-sm font-medium text-black mt-0.5">{qty} × {formatRupees(Number(item.price))}</p>
                          </div>
                          <span className="font-extrabold text-black text-base whitespace-nowrap">{formatRupees(lineTotal)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {(() => {
                    const subtotal = orderTotal(selectedOrder.items);
                    const discount = Number(selectedOrder.discount) || 0;
                    const slot = Number(selectedOrder.slotCharge) || 0;
                    const grand = effectiveOrderTotal(selectedOrder);
                    const instant = Number(selectedOrder.instantDeliveryCharge) || 0;
                    return (
                      <div className="mt-5 pt-4 border-t border-gray-100 space-y-2.5">
                        <div className="flex justify-between text-sm font-semibold text-black">
                          <span>Subtotal</span>
                          <span>{formatRupees(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-emerald-600">Coupon{selectedOrder.couponCode ? ` (${selectedOrder.couponCode})` : ""}</span>
                            <span className="text-emerald-600">− {formatRupees(discount)}</span>
                          </div>
                        )}
                        {slot > 0 && (
                          <div className="flex justify-between text-sm font-semibold text-black">
                            <span>Slot charge</span>
                            <span>+ {formatRupees(slot)}</span>
                          </div>
                        )}
                        {instant > 0 && (
                          <div className="flex justify-between text-sm font-semibold text-black">
                            <span>Instant delivery</span>
                            <span>+ {formatRupees(instant)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                          <span className="font-extrabold text-black text-base">Grand Total</span>
                          <span className="font-extrabold text-[#F05B4E] text-xl">{formatRupees(grand)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── 3. PAYMENT ── */}
                {(() => {
                  const pays: any[] = Array.isArray(selectedOrder.payments) ? selectedOrder.payments : [];
                  const status = String(selectedOrder.paymentStatus || "").toLowerCase();
                  const paid = Number(selectedOrder.paidAmount) || pays.reduce((s, p) => s + (Number(p?.amount) || 0), 0);
                  const due = Number(selectedOrder.dueAmount) || 0;
                  if (!pays.length && !status && !paid) return null;
                  const statusStyle = status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "partial" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-600 border-red-200";
                  const statusLabel = status === "paid" ? "Fully Paid" : status === "partial" ? "Partial" : "Unpaid";
                  return (
                    <div className="px-6 py-6">
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2.5">
                          <MaskIcon src={iconWallet} color="#364F9F" className="w-[20px] h-[20px]" />
                          <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Payment</span>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusStyle}`}>{statusLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-[#EEF1F9] rounded-xl px-4 py-3">
                          <p className="text-xs font-bold tracking-wider text-black mb-1">PAID</p>
                          <p className="text-lg font-extrabold text-black">{formatRupees(paid)}</p>
                        </div>
                        <div className="bg-[#EEF1F9] rounded-xl px-4 py-3">
                          <p className="text-xs font-bold tracking-wider text-black mb-1">DUE</p>
                          <p className={`text-lg font-extrabold ${due > 0 ? "text-[#F05B4E]" : "text-emerald-600"}`}>{formatRupees(due)}</p>
                        </div>
                      </div>
                      {pays.length > 0 && (
                        <div className="space-y-2">
                          {pays.map((p, i) => {
                            const meta = PAYMENT_MODES.find((m) => m.value === String(p?.mode || "").toLowerCase());
                            const label = meta?.label || (p?.mode ? String(p.mode) : "Payment");
                            return (
                              <div key={i} className="flex items-center justify-between py-2.5 border-t border-gray-100">
                                <span className="text-sm font-semibold text-black">{label}</span>
                                <span className="text-sm font-bold text-black">{formatRupees(Number(p?.amount) || 0)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── 4. DELIVERY & HUB ── */}
                <div className="px-6 py-6">
                  <div className="flex items-center gap-2.5 mb-5">
                    <MaskIcon src={iconMotorbike} color="#364F9F" className="w-[20px] h-[20px]" />
                    <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Delivery & Hub</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <div>
                      <p className="text-xs font-bold tracking-wider text-black mb-1">TYPE</p>
                      <p className="font-bold text-black capitalize">{selectedOrder.deliveryType ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold tracking-wider text-black mb-1">DATE</p>
                      <p className="font-bold text-black">{formatDate(selectedOrder.createdAt)}</p>
                    </div>
                    {selectedOrder.timeslotLabel && (
                      <div className="col-span-2">
                        <p className="text-xs font-bold tracking-wider text-black mb-1">TIME SLOT</p>
                        <p className="font-bold text-black">{selectedOrder.timeslotLabel}</p>
                      </div>
                    )}
                    {selectedOrder.superHubName && (
                      <div>
                        <p className="text-xs font-bold tracking-wider text-black mb-1">SUPER HUB</p>
                        <p className="font-bold text-black">{selectedOrder.superHubName}</p>
                      </div>
                    )}
                    {selectedOrder.subHubName && (
                      <div>
                        <p className="text-xs font-bold tracking-wider text-black mb-1">SUB HUB</p>
                        <p className="font-bold text-black">{selectedOrder.subHubName}</p>
                      </div>
                    )}
                    {selectedOrder.notes && (
                      <div className="col-span-2 pt-3 border-t border-gray-100">
                        <p className="text-xs font-bold tracking-wider text-black mb-1">CUSTOMER NOTES</p>
                        <p className="text-sm font-medium text-black italic">"{selectedOrder.notes}"</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── 5. DELIVERY PARTNER ── */}
                {selectedOrder.deliveryType === "takeaway" ? (
                  <div className="px-6 py-6">
                    <div className="flex items-center gap-2.5 mb-5">
                      <MaskIcon src={iconGroup} color="#364F9F" className="w-[20px] h-[20px]" />
                      <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Delivery Partner</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-black">Takeaway order</p>
                        <p className="text-sm font-medium text-black mt-0.5">Customer picks up from {selectedOrder.pickupLocation || selectedOrder.subHubName || "the store"}.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <MaskIcon src={iconGroup} color="#364F9F" className="w-[20px] h-[20px]" />
                        <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Delivery Partner</span>
                      </div>
                      {modalFiltered && (
                        <button onClick={() => setShowAllPersons((v) => !v)} className="text-xs font-bold text-[#F05B4E] hover:underline">
                          {showAllPersons ? "Show hub-only" : "Show all"}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {selectedOrder.assignedDeliveryPersonName && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-[#EEF1F9] rounded-xl">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 border border-[#364F9F]/20">
                            <MaskIcon src={iconMotorbike} color="#364F9F" className="w-[18px] h-[18px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-extrabold text-black truncate">{selectedOrder.assignedDeliveryPersonName}</p>
                            <p className="text-xs font-semibold text-black mt-0.5">Currently assigned</p>
                          </div>
                          <button
                            onClick={() => { setSelectedDeliveryPersonId("__none__"); setTimeout(() => handleAssignDelivery(), 0); }}
                            disabled={assigningDelivery}
                            className="text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white border border-red-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      {modalFiltered && !showAllPersons && (
                        <p className="text-sm font-semibold text-black">
                          Showing <strong>{modalFilteredCount}</strong> partner{modalFilteredCount !== 1 ? "s" : ""} from this order's hub.
                        </p>
                      )}
                      {showAllPersons && (
                        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm font-semibold text-black">Showing all partners. For best practice, assign hub-specific partners only.</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Select value={selectedDeliveryPersonId} onValueChange={setSelectedDeliveryPersonId}>
                          <SelectTrigger className="h-11 flex-1 text-sm rounded-xl font-semibold">
                            <SelectValue placeholder="Select delivery partner..." />
                          </SelectTrigger>
                          <SelectContent>
                            {modalPersons.length === 0 && (
                              <div className="py-4 text-center text-sm font-semibold text-black">No delivery partners {modalFiltered && !showAllPersons ? "for this hub" : "available"}</div>
                            )}
                            {modalPersons.map((p) => {
                              const hubs = [
                                ...(p.superHubNames ?? (p.superHubName ? [p.superHubName] : [])),
                                ...(p.subHubNames ?? (p.subHubName ? [p.subHubName] : [])),
                              ].filter(Boolean);
                              return (
                                <SelectItem key={p.id} value={p.id}>
                                  <div className="flex flex-col">
                                    <span className="font-bold text-black">{p.name}</span>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-black">
                                      {p.phone && <span>{p.phone}</span>}
                                      {hubs.length > 0 && <span>· {hubs.slice(0, 2).join(", ")}{hubs.length > 2 ? ` +${hubs.length - 2}` : ""}</span>}
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleAssignDelivery}
                          disabled={assigningDelivery || !selectedDeliveryPersonId}
                          className="bg-[#364F9F] hover:bg-[#2C418A] h-11 px-5 text-white font-bold rounded-xl"
                        >
                          {assigningDelivery ? "Saving..." : "Assign"}
                        </Button>
                      </div>
                      {deliveryPersons.length === 0 && (
                        <p className="text-sm font-semibold text-black italic">No delivery persons found. Add them via Admin Users.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── 6. UPDATE STATUS ── */}
                <div className="px-6 py-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <MaskIcon src={iconClipboardCheck} color="#364F9F" className="w-[20px] h-[20px]" />
                      <span className="text-xs font-bold text-[#364F9F] uppercase tracking-widest">Update Status</span>
                    </div>
                    <SolidStatusBadge status={selectedOrder.status} deliveryType={selectedOrder.deliveryType} />
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const isTakeaway = selectedOrder.deliveryType === "takeaway";
                      const hasAssignee = !!selectedOrder.assignedDeliveryPersonId;
                      const requiresAssignee = (s: string) => !isTakeaway && !hasAssignee && (s === "out_for_delivery" || s === "delivered");
                      const statusOptions = isTakeaway ? ["takeaway", "cancelled"] : ALL_STATUSES.filter((s) => s !== "takeaway");
                      const blocked = requiresAssignee(editStatus);
                      return (
                        <>
                          <div className="flex gap-2">
                            <Select value={editStatus} onValueChange={setEditStatus}>
                              <SelectTrigger className="h-11 flex-1 text-sm rounded-xl font-semibold"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((s) => {
                                  const disabled = requiresAssignee(s);
                                  return (
                                    <SelectItem key={s} value={s} disabled={disabled}>
                                      <span className="flex items-center gap-2 font-semibold">
                                        {STATUS_CONFIG[s].label}
                                        {disabled && <span className="text-xs text-black font-medium">(assign partner first)</span>}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <Button
                              onClick={handleStatusUpdate}
                              disabled={savingStatus || blocked || editStatus === displayStatus(selectedOrder.status, selectedOrder.deliveryType)}
                              className="bg-[#F05B4E] hover:bg-[#D94A3D] h-11 px-5 text-white font-bold rounded-xl"
                            >
                              {savingStatus ? "Saving..." : "Update"}
                            </Button>
                          </div>
                          {blocked && (
                            <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                              Assign a delivery partner above before marking as Out for Delivery or Delivered.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

              </div>

              {/* ── Footer ── */}
              <SheetFooter className="px-6 py-4 bg-white border-t border-gray-100 flex-row sm:justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setSelectedOrder(null); setShowAllPersons(false); }}
                  className="h-10 px-6 rounded-xl border-gray-200 text-black font-bold hover:bg-gray-50"
                >
                  Close
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Payment-on-deliver dialog */}
      <Dialog open={deliverPayOpen} onOpenChange={(open) => { if (!savingStatus) setDeliverPayOpen(open); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Mark as Delivered
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (() => {
            const orderTotalValue = Number(selectedOrder.total) > 0
              ? Number(selectedOrder.total)
              : orderTotal(selectedOrder.items);
            const existingPaid = Number(selectedOrder.paidAmount) || 0;
            const remainingDue = Math.max(0, orderTotalValue - existingPaid);
            const newPaidTotal = existingPaid + (deliverPayStatus === "unpaid" ? 0 : deliverPayPaidTotal);
            const newDue = Math.max(0, orderTotalValue - newPaidTotal);

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
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const otherSum = deliverPayEntries.reduce(
                                  (s, p, i) => s + (i === idx ? 0 : Number(p.amount) || 0),
                                  0
                                );
                                const maxAllowed = Math.max(0, remainingDue - otherSum);
                                let next = e.target.value;
                                if (Number.isFinite(raw) && raw > maxAllowed) {
                                  next = String(maxAllowed);
                                }
                                setDeliverPayEntries((arr) =>
                                  arr.map((p, i) => (i === idx ? { ...p, amount: next } : p))
                                );
                              }}
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
                        <span>
                          New due:{" "}
                          <span className={`font-semibold ${newDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {formatRupees(newDue)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverPayOpen(false)} disabled={savingStatus} className="h-9">
              Cancel
            </Button>
            <Button
              onClick={handleDeliverWithPayment}
              disabled={savingStatus}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9"
            >
              {savingStatus ? "Saving..." : "Mark as Delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
