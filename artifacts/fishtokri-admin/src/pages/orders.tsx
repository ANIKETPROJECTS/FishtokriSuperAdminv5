import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search, X, RefreshCw, ClipboardList, Clock, CheckCircle2, XCircle,
  Truck, Package, ChevronLeft, ChevronRight, Eye, MapPin,
  Phone, User, UserPlus, SlidersHorizontal, ArrowUpDown, UserCheck,
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
import { printHtmlWithQZ } from "@/lib/qz-print";
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

/** Returns today's date as YYYY-MM-DD in IST (UTC+5:30). */
function getTodayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const mo = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Returns tomorrow's date as YYYY-MM-DD in IST. */
function getTomorrowIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + 1);
  const y = ist.getUTCFullYear();
  const mo = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function formatDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDeliveryDate(d: any) {
  if (!d) return "—";
  // deliveryDate is stored as "YYYY-MM-DD" string — parse without timezone shift
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split("-");
    return `${day} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m)-1]} ${y}`;
  }
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
  const { toast } = useToast();
  const items: any[] = order.items ?? [];
  const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : orderTotal(items);
  const totalQty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
  const discount = Number(order.discount) || 0;
  const slotCharge = Number(order.slotCharge) || 0;
  const deliveryCharge = Number(order.deliveryCharge) || 0;
  const grandTotal = effectiveOrderTotal(order);
  const paidAmt = Number(order.paidAmount) || 0;
  const dueAmt = Number(order.dueAmount) || Math.max(0, grandTotal - paidAmt);
  const invPays: any[] = Array.isArray(order.payments) ? order.payments : [];
  const walletInvAmt = (() => {
    const w = invPays.find((p: any) => String(p?.mode || "").toLowerCase() === "wallet");
    return w ? Number(w.amount) || 0 : 0;
  })();

  const invoiceNo = order.orderId || ("INV-" + String(order._id).slice(-6).toUpperCase());
  const d = new Date(order.createdAt ?? Date.now());
  // Invoice "Date" = delivery date (what the order is for); "Time" = when order was placed
  const deliveryDateStr = (() => {
    const s = String(order.deliveryDate ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split("-");
      return `${day}-${m}-${y}`;
    }
    return [
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      d.getFullYear(),
    ].join("-");
  })();
  const dateStr = deliveryDateStr;
  const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const payMode =
    order.paymentMode ||
    (Array.isArray(order.payments) && order.payments.length > 0
      ? [...new Set(order.payments.map((p: any) => p.method))].join(", ")
      : "Cash");
  const payLabel =
    order.paymentStatus === "paid" ? "Paid" :
    order.paymentStatus === "partial" ? "Partial" : "Unpaid";

  const handlePrint = async () => {
    const itemRows = items.map((it: any) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.price) || 0;
      return `
        <tr>
          <td style="padding:5px 4px;border-bottom:1px solid #eee;">${it.name}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;">${qty}${it.unit ? ` ${it.unit}` : ""}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;">${rate.toFixed(2)}</td>
          <td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;">${(qty * rate).toFixed(2)}</td>
        </tr>`;
    }).join("");

    const walletRow = walletInvAmt > 0 ? `
      <div style="display:flex;justify-content:space-between;margin:4px 0;font-size:13px;">
        <span>Wallet Applied:</span><span>− ${walletInvAmt.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin:4px 0;font-size:14px;font-weight:700;">
        <span>Balance Due (Cash/UPI):</span><span>${Math.max(0, grandTotal - walletInvAmt).toFixed(2)}</span>
      </div>` : "";

    const paidDueRow = (order.paidAmount !== undefined || order.dueAmount !== undefined) ? `
      <div style="display:flex;justify-content:space-between;margin:8px 0 0;font-size:12px;">
        <span>Paid: <strong style="color:#16a34a;">₹${paidAmt.toFixed(2)}</strong></span>
        <span>Due: <strong style="color:${dueAmt > 0 ? "#ef4444" : "#16a34a"};">₹${dueAmt.toFixed(2)}</strong></span>
      </div>` : "";

    const notesRow = order.notes ? `
      <div style="border-top:1px dashed #bbb;margin:10px 0;"></div>
      <div style="font-size:12px;"><b>Note:</b> ${order.notes}</div>` : "";

    const slotRow = slotCharge > 0 ? `
      <tr>
        <td style="padding:4px 2px;" colspan="3">Slot Charge :</td>
        <td style="padding:4px 2px;text-align:right;">+ ${slotCharge.toFixed(2)}</td>
      </tr>` : "";

    const deliveryRow = deliveryCharge > 0 ? `
      <tr>
        <td style="padding:4px 2px;" colspan="3">Delivery Charge :</td>
        <td style="padding:4px 2px;text-align:right;">+ ${deliveryCharge.toFixed(2)}</td>
      </tr>` : "";

    const payStatusColor = order.paymentStatus === "paid" ? "#15803d" : order.paymentStatus === "partial" ? "#b45309" : "#b91c1c";
    const payStatusBg = order.paymentStatus === "paid" ? "#f0fdf4" : order.paymentStatus === "partial" ? "#fffbeb" : "#fef2f2";

    const htmlContent = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${invoiceNo}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; }
        @page { size: 80mm auto; margin: 0; }
      </style>
    </head><body>
      <div style="padding:4px 8px;font-size:13px;color:#111;">

        <h2 style="text-align:center;font-size:16px;font-weight:700;margin-bottom:2px;">
          Atha Foods${order.superHubName ? ` - ${order.superHubName}` : ""}
        </h2>
        <div style="border-top:1px dashed #999;margin:8px 0;"></div>
        <div style="text-align:center;font-size:12px;color:#555;margin-bottom:8px;">Mobile No: ${order.phone || "—"}</div>

        <div style="display:flex;justify-content:space-between;margin:3px 0;font-size:12px;">
          <span><b>Invoice No:</b> ${invoiceNo}</span>
          <span><b>Date:</b> ${dateStr}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:3px 0;font-size:12px;">
          <span>
            <b>Payment Mode:</b> ${payMode}
            <span style="margin-left:5px;font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:20px;border:1px solid ${payStatusColor};color:${payStatusColor};background:${payStatusBg};">${payLabel}</span>
          </span>
          <span><b>Time:</b> ${timeStr}</span>
        </div>

        <div style="border-top:1px dashed #999;margin:8px 0;"></div>

        <div style="font-size:12px;margin:2px 0;"><b>Name:</b> ${order.customerName}</div>
        ${order.address ? `<div style="font-size:12px;margin:2px 0;"><b>Add :</b> ${order.address}</div>` : ""}
        ${formatTimeSlot(order) ? `<div style="font-size:12px;margin:2px 0;"><b>Delivery Slot:</b> ${formatTimeSlot(order)}</div>` : ""}

        <div style="border-top:1px dashed #999;margin:8px 0;"></div>

        <table style="width:100%;border-collapse:collapse;font-size:12px;margin:4px 0;">
          <thead>
            <tr style="border-bottom:1px solid #555;">
              <th style="padding:5px 4px;text-align:left;font-weight:600;">Item</th>
              <th style="padding:5px 4px;text-align:right;font-weight:600;">Qty</th>
              <th style="padding:5px 4px;text-align:right;font-weight:600;">Rate</th>
              <th style="padding:5px 4px;text-align:right;font-weight:600;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
            <tr style="border-top:1px solid #aaa;">
              <td style="padding:5px 4px;font-weight:600;">Total Items: ${items.length}</td>
              <td style="padding:5px 4px;text-align:right;font-weight:600;">${totalQty}</td>
              <td></td>
              <td style="padding:5px 4px;text-align:right;font-weight:600;">${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:4px 2px;" colspan="3">Discount${order.couponCode ? ` (${order.couponCode})` : ""} :</td>
              <td style="padding:4px 2px;text-align:right;">- ${discount.toFixed(2)}</td>
            </tr>
            ${slotRow}
            ${deliveryRow}
          </tbody>
        </table>

        <div style="border-top:1px dashed #999;margin:8px 0;"></div>

        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;margin:4px 0;">
          <span>Grand Total:</span><span>${grandTotal.toFixed(2)}</span>
        </div>
        ${walletRow}
        <div style="text-align:center;font-style:italic;font-size:11px;color:#555;margin:4px 0 8px;">( ${numberToWords(grandTotal)} )</div>
        ${paidDueRow}
        ${notesRow}

        <div style="text-align:center;font-size:11px;color:#555;line-height:1.8;margin-top:14px;">
          Thank you for your business!<br/>
          For any query - 9220200100
        </div>
      </div>
    </body></html>`;

    toast({ title: "Printing..." });
    const qzResult = await printHtmlWithQZ(htmlContent);
    if (qzResult.success) return;

    // QZ Tray unavailable — fall back to browser print dialog
    toast({ title: "Print failed, opening dialog...", variant: "destructive" });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(htmlContent);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
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
              Atha Foods{order.superHubName ? ` - ${order.superHubName}` : ""}
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
            {formatTimeSlot(order) && <div><b>Delivery Slot:</b> {formatTimeSlot(order)}</div>}

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
                {deliveryCharge > 0 && (
                  <tr>
                    <td className="py-1" colSpan={3}>Delivery Charge :</td>
                    <td className="py-1 text-right">+ {deliveryCharge.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="border-t border-dashed border-gray-400 my-2" />

            <div className="flex justify-between text-[15px] font-bold">
              <span>Grand Total:</span>
              <span>{grandTotal.toFixed(2)}</span>
            </div>
            {walletInvAmt > 0 && (
              <div className="flex justify-between text-[13px] mt-1">
                <span>Wallet Applied:</span>
                <span>− {walletInvAmt.toFixed(2)}</span>
              </div>
            )}
            {walletInvAmt > 0 && (
              <div className="flex justify-between text-[14px] font-bold mt-0.5">
                <span>Balance Due (Cash/UPI):</span>
                <span>{Math.max(0, grandTotal - walletInvAmt).toFixed(2)}</span>
              </div>
            )}
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
              For any query - 9220200100
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

function addMinutesToTimeStr(timeStr: string, mins: number): string {
  if (!mins || !timeStr) return timeStr;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return timeStr;
  const [, hStr, mStr, period] = match;
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (period.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period.toUpperCase() === "AM" && h === 12) h = 0;
  const total = h * 60 + m + mins;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  const newPeriod = newH >= 12 ? "PM" : "AM";
  const displayH = newH === 0 ? 12 : newH > 12 ? newH - 12 : newH;
  return `${displayH}:${String(newM).padStart(2, "0")} ${newPeriod}`;
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

  const [activeTab, setActiveTab] = useState<"current" | "otherday" | "history" | "all" | "invoices">("current");
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
  const [statsTotals, setStatsTotals] = useState<{ total?: number; currentTotal?: number; historyTotal?: number; todayTotal?: number; otherDayTotal?: number }>({});

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  // Payment-on-deliver dialog
  const [deliverPayOpen, setDeliverPayOpen] = useState(false);
  const [deliverPayStatus, setDeliverPayStatus] = useState<"unpaid" | "paid">("paid");
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
  const [editedSavedAddress, setEditedSavedAddress] = useState({ label: "Home", name: "", phone: "", building: "", street: "", area: "", landmark: "", pincode: "", city: "", state: "" });
  const [newAddress, setNewAddress] = useState({
    label: "Home", name: "", phone: "",
    building: "", street: "", area: "", pincode: "",
  });
  const [orderNotes, setOrderNotes] = useState("");
  const [posRightTab, setPosRightTab] = useState<"cart" | "details">("cart");

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
  const [orderDate, setOrderDate] = useState<string>(() => getTodayIST());
  const [isOutstationDelivery, setIsOutstationDelivery] = useState(false);

  // Delivery charge override + extra discount
  const [deliveryChargeInput, setDeliveryChargeInput] = useState<string>("");
  const [extraDiscount, setExtraDiscount] = useState<string>("");

  // Payment
  type PaymentEntry = { mode: string; amount: string; reference: string };
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "partial" | "paid">("unpaid");
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [mainPaymentMode, setMainPaymentMode] = useState<"upi" | "cash">("cash");
  const [useWallet, setUseWallet] = useState(false);
  // When populating from an existing order, skip the payment-recompute effect once
  // so the saved payment entries aren't overwritten by the derived logic.
  const skipPaymentRecomputeRef = useRef(false);
  // Prevents the pincodeDeliveryCharge sync effect from overwriting a value
  // that was manually restored when loading an existing order for editing.
  const skipDeliveryChargeSyncRef = useRef(false);
  const [savingAddress, setSavingAddress] = useState(false);
  // Track whether the new address form has been saved so the Save button hides
  // until the user makes a new change.
  const [newAddressSaved, setNewAddressSaved] = useState(false);
  // Stores the last-committed version of the saved address. Save/Cancel only
  // appear when editedSavedAddress differs from this baseline (i.e. user has
  // made a change). After saving, the baseline is updated so buttons hide.
  const emptyAddr = { label: "Home", name: "", phone: "", building: "", street: "", area: "", landmark: "", pincode: "", city: "", state: "" };
  const [originalSavedAddress, setOriginalSavedAddress] = useState(emptyAddr);

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
    // Keep hub selection (super + sub) so the user doesn't have to re-pick every time.
    // Clear only the cart and per-order state.
    setSelectedProducts([]);
    setProductSearch(""); setProductPickerOpen(false);
    setAppliedCouponIds([]); setCouponCode(""); setCouponError("");
    setSelectedTimeslotId("");
    setOrderScheduleType("slot");
    setOrderDate(getTodayIST());
    setIsOutstationDelivery(false);
    setDeliveryChargeInput("");
    setExtraDiscount("");
    setPaymentStatus("unpaid");
    setPaymentEntries([]);
    setMainPaymentMode("cash");
    setUseWallet(false);
    setEditingOrderId("");
  }, []);

  // When a customer is picked from the dropdown, immediately show them for
  // responsive UX, then re-fetch their document so activeCoupons / usedCoupons
  // are always up-to-date. This prevents exhausted coupons from showing.
  const handleSelectCustomer = useCallback((c: any) => {
    setChosenCustomer(c);
    setAppliedCouponIds([]); setCouponCode(""); setCouponError("");
    const addrs = Array.isArray(c.addresses) ? c.addresses : [];
    // When customer has multiple addresses, require explicit selection (null = unselected)
    // When only one address, auto-select it
    const defaultIdx = addrs.findIndex((a: any) => getAddressFields(a)?.isDefault);
    const initIdx = addrs.length === 0 ? null : addrs.length === 1 ? 0 : (defaultIdx >= 0 ? defaultIdx : null);
    setSelectedAddressIdx(initIdx);
    setOrderAddressMode(addrs.length ? "saved" : "new");
    if (initIdx !== null && addrs[initIdx]) {
      const f = getAddressFields(addrs[initIdx]);
      if (f) setEditedSavedAddress({ label: f.label || "Home", name: f.contactName || "", phone: f.phone || "", building: [f.houseNo, f.building].filter(Boolean).join(", ") || "", street: f.street || "", area: f.area || "", landmark: f.landmark || "", pincode: f.pincode || "", city: f.city || "", state: f.state || "" });
    }
    setCustomerSearch("");
    setNewAddress((a: any) => ({ ...a, name: c.name || "", phone: c.phone || "" }));
    // Fetch fresh customer data in the background to get current coupon usage
    if (c.id) {
      apiFetch(`/api/customers/${c.id}`)
        .then((d) => { if (d?.customer) setChosenCustomer(d.customer); })
        .catch(() => {}); // silently ignore; stale data is fine as fallback
    }
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
    if (superHubs.length === 0) return;
    setSelectedSuperHubId(superHubs[0].id);
  }, [superHubs, selectedSuperHubId]);
  useEffect(() => {
    if (selectedSubHubId) return;
    if (subHubs.length === 0) return;
    setSelectedSubHubId(subHubs[0].id);
  }, [subHubs, selectedSubHubId]);

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

  // Sync editedSavedAddress (and the baseline) whenever the selected saved address changes.
  // Both are set together so Save/Cancel don't appear until the user edits something.
  useEffect(() => {
    if (selectedAddressIdx === null || !chosenCustomer) return;
    const a = (chosenCustomer.addresses ?? [])[selectedAddressIdx];
    const f = getAddressFields(a);
    if (!f) return;
    const fresh = {
      label: f.label || "Home",
      name: f.contactName || "",
      phone: f.phone || "",
      building: [f.houseNo, f.building].filter(Boolean).join(", ") || "",
      street: f.street || "",
      area: f.area || "",
      landmark: f.landmark || "",
      pincode: f.pincode || "",
      city: f.city || "",
      state: f.state || "",
    };
    setEditedSavedAddress(fresh);
    setOriginalSavedAddress(fresh);
  }, [selectedAddressIdx, chosenCustomer]);

  // Poll timeslot counts every 5 s while the create-order panel is open so
  // full slots disappear automatically without a page refresh.
  useEffect(() => {
    if (!isCreatePage || !selectedSubHubId) return;
    const id = setInterval(() => {
      apiFetch(`/api/sub-hubs/${selectedSubHubId}/menu/timeslots`)
        .then((d) => setTimeslots(d.timeslots ?? []))
        .catch(() => {/* silent – keep existing list */});
    }, 5000);
    return () => clearInterval(id);
  }, [isCreatePage, selectedSubHubId]);

  // Poll products every 1 s so stock/price changes in the DB appear without a page refresh.
  useEffect(() => {
    if (!isCreatePage || !selectedSubHubId) return;
    const id = setInterval(() => {
      apiFetch(`/api/sub-hubs/${selectedSubHubId}/menu/products`)
        .then((d) => setSubHubProducts(d.products ?? []))
        .catch(() => {/* silent – keep existing list */});
    }, 1000);
    return () => clearInterval(id);
  }, [isCreatePage, selectedSubHubId]);

  const activeCoupons = useMemo(() => {
    const now = Date.now();
    const customerActiveCoupons: any[] = chosenCustomer?.activeCoupons ?? [];
    const customerUsedCoupons: any[] = chosenCustomer?.usedCoupons ?? [];
    return coupons.filter((c) => {
      if (c.isActive === false) return false;
      if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return false;
      // Hide coupons the customer has already exhausted their usage limit for
      if (c.maxUsage != null && Number(c.maxUsage) > 0 && chosenCustomer) {
        const couponId = String(c._id);
        const activeEntry = customerActiveCoupons.find((ac: any) => String(ac.couponId) === couponId);
        const activeCount = activeEntry
          ? (activeEntry.usedCount != null ? Number(activeEntry.usedCount) : 1)
          : 0;
        const historicalCount = customerUsedCoupons.filter((uc: any) => String(uc.couponId) === couponId).length;
        if (activeCount + historicalCount >= Number(c.maxUsage)) return false;
      }
      return true;
    });
  }, [coupons, chosenCustomer]);

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

  const activeTimeslots = useMemo(() => {
    const todayISO = getTodayIST();
    const isToday = orderDate === todayISO;
    return timeslots.filter((t) => {
      if (t.isActive === false) return false;
      // Hide slots that have hit their order limit for the selected date.
      // todaysOrderCount / nextDayOrderCount are computed live by the backend —
      // no stale date guard needed.
      const limit = Number(t.orderLimit) || 0;
      if (limit > 0) {
        if (isToday && (t.todaysOrderCount ?? 0) >= limit) return false;
        if (!isToday && (t.nextDayOrderCount ?? 0) >= limit) return false;
      }
      if (!isToday) return true;
      const match = (t.startTime ?? "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match) return true;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (match[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (match[3].toUpperCase() === "AM" && h === 12) h = 0;
      const slotStartMins = h * 60 + m;
      const now = new Date();
      const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const currentMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
      return slotStartMins > currentMins + 30;
    });
  }, [timeslots, orderDate]);

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
    if (q) {
      list = list.filter((p) =>
        [p.name, p.category, p.subCategory, p.shortCode].some((v) => String(v ?? "").toLowerCase().includes(q))
      );
    }
    // In-stock products first, then out-of-stock
    return [...list].sort((a, b) => {
      const aStock = Number(a.quantity) || 0;
      const bStock = Number(b.quantity) || 0;
      if (aStock > 0 && bStock <= 0) return -1;
      if (aStock <= 0 && bStock > 0) return 1;
      return 0;
    });
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

  const deliveryPincode = useMemo(() => {
    if (orderDeliveryType !== "delivery") return "";
    if (orderAddressMode === "saved" && chosenCustomer && selectedAddressIdx !== null) {
      return editedSavedAddress.pincode || "";
    }
    return newAddress.pincode || "";
  }, [orderDeliveryType, orderAddressMode, chosenCustomer, selectedAddressIdx, editedSavedAddress.pincode, newAddress.pincode]);

  const pincodeEntry = useMemo(() => {
    if (!deliveryPincode || !selectedSubHubId) return null;
    const sub = subHubs.find((h: any) => h.id === selectedSubHubId);
    if (!sub) return null;
    return (sub.pincodes || []).find((p: any) => p.pincode === deliveryPincode) || null;
  }, [deliveryPincode, selectedSubHubId, subHubs]);

  const pincodeDeliveryCharge = useMemo(() => {
    if (orderDeliveryType !== "delivery") return 0;
    return Number(pincodeEntry?.charge) || 0;
  }, [pincodeEntry, orderDeliveryType]);

  const pincodeTimeDelay = useMemo(() => {
    if (orderDeliveryType !== "delivery") return 0;
    return Number(pincodeEntry?.timeDelay) || 0;
  }, [pincodeEntry, orderDeliveryType]);

  const isOutstationNeeded = useMemo(() =>
    orderDeliveryType === "delivery" && deliveryPincode.length === 6 && pincodeEntry === null,
    [orderDeliveryType, deliveryPincode, pincodeEntry]
  );

  // Auto-reset outstation toggle when pincode becomes serviceable or is cleared
  useEffect(() => {
    if (!isOutstationNeeded) setIsOutstationDelivery(false);
  }, [isOutstationNeeded]);

  // Reset new-address "saved" flag whenever the user edits any field.
  useEffect(() => { setNewAddressSaved(false); }, [newAddress]);

  // Derive whether the user has changed anything vs the last-committed baseline.
  // Save/Cancel only appear when this is true.
  const savedAddrDirty = JSON.stringify(editedSavedAddress) !== JSON.stringify(originalSavedAddress);

  // Sync delivery charge input from pincode-based charge whenever it changes,
  // unless we just restored it from an existing order (skipDeliveryChargeSyncRef).
  useEffect(() => {
    if (skipDeliveryChargeSyncRef.current) {
      skipDeliveryChargeSyncRef.current = false;
      return;
    }
    setDeliveryChargeInput(pincodeDeliveryCharge > 0 ? String(pincodeDeliveryCharge) : "");
  }, [pincodeDeliveryCharge]);

  const effectiveDeliveryCharge = useMemo(() => {
    if (orderDeliveryType !== "delivery") return 0;
    const v = Number(deliveryChargeInput);
    return isNaN(v) || v < 0 ? 0 : v;
  }, [deliveryChargeInput, orderDeliveryType]);

  const extraDiscountAmount = useMemo(() => {
    const v = Number(extraDiscount);
    return isNaN(v) || v < 0 ? 0 : Math.floor(v);
  }, [extraDiscount]);

  const newOrderTotal = useMemo(
    () => Math.max(0, itemsSubtotal - couponDiscount - extraDiscountAmount + slotExtraCharge + effectiveDeliveryCharge),
    [itemsSubtotal, couponDiscount, extraDiscountAmount, slotExtraCharge, effectiveDeliveryCharge]
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
    { value: "other", label: "Other", Icon: Tag },
  ];

  // Recompute paymentStatus + paymentEntries whenever the user changes main mode, wallet toggle, or total
  useEffect(() => {
    // Skip once when we've just loaded an existing order — its saved entries take priority.
    if (skipPaymentRecomputeRef.current) {
      skipPaymentRecomputeRef.current = false;
      return;
    }
    const walletBal = Number(chosenCustomer?.walletBalance) || 0;
    const walletApplied = useWallet && walletBal > 0 ? Math.min(walletBal, newOrderTotal) : 0;
    const remaining = Math.max(0, newOrderTotal - walletApplied);

    if (walletApplied > 0 && remaining > 0) {
      // Wallet covers part + remaining via main mode.
      if (mainPaymentMode === "upi") {
        // UPI is an immediate payment — wallet + UPI together cover the full total now → "paid".
        setPaymentStatus("paid");
        setPaymentEntries([
          { mode: "wallet", amount: String(walletApplied), reference: "" },
          { mode: "upi", amount: String(remaining), reference: "" },
        ]);
      } else {
        // Cash/COD: wallet is deducted now but cash is collected at delivery → "partial".
        // Only record the wallet entry as paid; the cash portion remains due.
        setPaymentStatus("partial");
        setPaymentEntries([
          { mode: "wallet", amount: String(walletApplied), reference: "" },
        ]);
      }
    } else if (walletApplied >= newOrderTotal && newOrderTotal > 0) {
      // Wallet covers everything
      setPaymentStatus("paid");
      setPaymentEntries([{ mode: "wallet", amount: String(walletApplied), reference: "" }]);
    } else if (mainPaymentMode === "upi") {
      setPaymentStatus("paid");
      setPaymentEntries([{ mode: "upi", amount: String(newOrderTotal || 0), reference: "" }]);
    } else {
      // Cash / COD
      setPaymentStatus("unpaid");
      setPaymentEntries([{ mode: "cash", amount: "0", reference: "" }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainPaymentMode, useWallet, newOrderTotal, chosenCustomer?.walletBalance]);

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
      customerName = chosenCustomer.name?.trim() || "";
      // If customer account has no name, fall back to the name on the selected address
      if (!customerName) {
        if (orderAddressMode === "saved" && selectedAddressIdx !== null) {
          const a = (chosenCustomer.addresses ?? [])[selectedAddressIdx] as any;
          customerName = (a?.name || a?.contactName || "").trim();
        } else if (orderAddressMode === "new") {
          customerName = newAddress.name?.trim() || "";
        }
      }
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
        const f = editedSavedAddress;
        if (!f.building.trim()) {
          toast({ title: "Building / Flat No required", description: "Enter the building or flat number for the delivery address.", variant: "destructive" });
          return;
        }
        if (!f.pincode || !/^\d{6}$/.test(f.pincode)) {
          toast({ title: "Pincode required", description: "Enter a valid 6-digit pincode for the delivery address.", variant: "destructive" });
          return;
        }
        address = [f.building, f.street, f.area, f.landmark, f.city, f.state, f.pincode].filter(Boolean).join(", ");
        deliveryArea = f.area || f.city || "";
        deliveryAddressDetail = { label: f.label, name: f.name, phone: f.phone, building: f.building, street: f.street, area: f.area, landmark: f.landmark, pincode: f.pincode, city: f.city, state: f.state };
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
      if (isOutstationNeeded && !isOutstationDelivery) {
        toast({ title: "Pincode not serviceable", description: `Pincode ${deliveryPincode} is outside our service area. Enable "Outstation Delivery" in the address section to proceed.`, variant: "destructive" });
        return;
      }
    } else if (orderDeliveryType === "takeaway") {
      // Address is optional for takeaway — only resolve if something was filled in
      if (chosenCustomer && orderAddressMode === "saved" && selectedAddressIdx !== null) {
        const f = editedSavedAddress;
        if (f.building.trim()) {
          address = [f.building, f.street, f.area, f.landmark, f.city, f.state, f.pincode].filter(Boolean).join(", ");
          deliveryArea = f.area || f.city || "";
          deliveryAddressDetail = { label: f.label, name: f.name, phone: f.phone, building: f.building, street: f.street, area: f.area, landmark: f.landmark, pincode: f.pincode, city: f.city, state: f.state };
        }
      } else if (newAddress.building.trim()) {
        address = formatAddressOneLine(newAddress);
        deliveryArea = newAddress.area || "";
        deliveryAddressDetail = { label: newAddress.label, type: (newAddress.label || "Home").toLowerCase(), name: newAddress.name.trim(), phone: newAddress.phone.trim(), building: newAddress.building.trim(), street: newAddress.street.trim(), area: newAddress.area.trim(), pincode: newAddress.pincode.trim() };
      }
    }

    const superHub = superHubs.find((h) => h.id === selectedSuperHubId);
    const subHub = subHubs.find((h) => h.id === selectedSubHubId);

    // Validate scheduling (only for delivery orders — takeaway is instant for today)
    if (orderDeliveryType === "delivery") {
      if (orderScheduleType === "slot" && activeTimeslots.length > 0 && !selectedTimeslotId) {
        toast({ title: "Pick a delivery slot", description: "Please select a time slot for this order.", variant: "destructive" });
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
        discount: couponDiscount + extraDiscountAmount,
        extraDiscount: extraDiscountAmount,
        slotCharge: slotExtraCharge,
        deliveryCharge: effectiveDeliveryCharge,
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

      // If a saved address was used and may have been edited, sync it back to the customer record
      if (customerId && orderDeliveryType === "delivery" && orderAddressMode === "saved" && selectedAddressIdx !== null && chosenCustomer) {
        try {
          const currentAddresses = Array.isArray(chosenCustomer.addresses) ? [...chosenCustomer.addresses] : [];
          const f = editedSavedAddress;
          const updatedAddr = {
            ...(currentAddresses[selectedAddressIdx] ?? {}),
            label: f.label,
            name: f.name,
            phone: f.phone,
            building: f.building,
            street: f.street,
            area: f.area,
            landmark: f.landmark,
            pincode: f.pincode,
            city: f.city,
            state: f.state,
          };
          currentAddresses[selectedAddressIdx] = updatedAddr;
          await apiFetch(`/api/customers/${customerId}`, {
            method: "PUT",
            body: JSON.stringify({ addresses: currentAddresses }),
          });
        } catch {
          // Non-fatal — address sync failure doesn't block the order
        }
      }

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
    if (activeTab === "current" || activeTab === "otherday") return ACTIVE_STATUSES.join(",");
    if (activeTab === "history") return HISTORY_STATUSES.join(",");
    if (activeTab === "invoices") return HISTORY_STATUSES.join(",");
    return "";
  }, [activeTab, statusFilter]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        sort: sortField,
        order: sortDir,
        page: String(page),
        limit: String(LIMIT),
      });
      if (activeTab === "current" || activeTab === "otherday" || activeTab === "history" || activeTab === "invoices") {
        params.set("tab",
          activeTab === "invoices" ? "history" :
          activeTab === "otherday" ? "current" :
          activeTab
        );
      }
      if (activeTab === "current") params.set("deliveryDateFilter", "today");
      else if (activeTab === "otherday") params.set("deliveryDateFilter", "tomorrow");
      if (statusFilter) {
        params.set("status", statusFilter);
      }
      if (deliveryTypeFilter) params.set("deliveryType", deliveryTypeFilter);
      // Only send date-range params when on the All Orders tab.
      if (activeTab === "all" && dateFrom) params.set("from", dateFrom);
      if (activeTab === "all" && dateTo) params.set("to", dateTo);
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
        todayTotal: data.todayTotal,
        otherDayTotal: data.otherDayTotal,
      });
    } catch { }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setPage(1); }, [activeTab, search, statusFilter, deliveryTypeFilter, dateFrom, dateTo, sortField, sortDir, subHubFilter]);
  useEffect(() => { load(); }, [load]);

  // Clear the delivery-date range filter when leaving the "All Orders" tab —
  // it only applies there, so stale values shouldn't bleed into other tabs.
  useEffect(() => {
    if (activeTab !== "all") {
      setDateFrom("");
      setDateTo("");
    }
  }, [activeTab]);

  useEffect(() => {
    const id = setInterval(() => { load(true); loadStats(); }, 5000);
    return () => clearInterval(id);
  }, [load, loadStats]);

  // ── Auto-promote "other day" orders when the date rolls over ─────────────
  // Every 30 s, check if the IST calendar date has changed since the last
  // check. When it does, refresh stats and switch from "otherday" → "current"
  // so that orders scheduled for the new "today" appear immediately.
  useEffect(() => {
    let lastDate = getTodayIST();
    const id = setInterval(() => {
      const today = getTodayIST();
      if (today !== lastDate) {
        lastDate = today;
        loadStats();
        setActiveTab((tab) => (tab === "otherday" ? "current" : tab));
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [loadStats]);

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
    const remainingDue = Math.max(0, orderTotalAmount - existingPaid);

    if (deliverPayStatus !== "unpaid") {
      const validEntries = deliverPayEntries.filter((p) => p.mode && Number(p.amount) > 0);
      if (validEntries.length === 0) {
        toast({ title: "Add payment details", description: "Enter at least one payment with mode and amount.", variant: "destructive" });
        return;
      }
    }

    const newEntries = deliverPayStatus === "unpaid"
      ? []
      : deliverPayEntries.filter((p) => p.mode && Number(p.amount) > 0).map((p) => ({
          mode: p.mode,
          amount: Number(p.amount) || 0,
          reference: p.reference?.trim() || "",
        }));
    const mergedPayments = [...existingPayments, ...newEntries];

    // Wallet adjustment: difference between what was collected and what was outstanding.
    // Positive = credit customer wallet (overpaid). Negative = debit customer wallet (underpaid).
    const walletAdjustment = deliverPayStatus === "unpaid" ? 0 : (deliverPayPaidTotal - remainingDue);

    setSavingStatus(true);
    try {
      const payload: any = {
        status: "delivered",
        paymentStatus: deliverPayStatus === "unpaid" ? "unpaid" : "paid",
        paidAmount: deliverPayStatus === "unpaid" ? existingPaid : orderTotalAmount,
        paymentMode: mergedPayments[0]?.mode,
        payments: mergedPayments,
        ...(walletAdjustment !== 0 ? { walletAdjustment } : {}),
      };
      await apiFetch(`/api/orders/${selectedOrder._id}`, { method: "PUT", body: JSON.stringify(payload) });
      const walletMsg = walletAdjustment > 0
        ? ` ₹${walletAdjustment.toFixed(0)} credited to customer wallet.`
        : walletAdjustment < 0
        ? ` ₹${Math.abs(walletAdjustment).toFixed(0)} debited from customer wallet.`
        : "";
      toast({ title: "Marked as delivered", description: deliverPayStatus === "paid" ? `Payment recorded.${walletMsg}` : "No payment recorded." });
      setSelectedOrder((o: any) => ({
        ...o,
        status: "delivered",
        paymentStatus: deliverPayStatus === "unpaid" ? "unpaid" : "paid",
        paidAmount: deliverPayStatus === "unpaid" ? existingPaid : orderTotalAmount,
        dueAmount: deliverPayStatus === "unpaid" ? remainingDue : 0,
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
    // Restore wallet toggle + main payment mode from saved payments
    const walletEntry = pays.find((p: any) => String(p.mode || "").toLowerCase() === "wallet");
    const nonWalletEntry = pays.find((p: any) => String(p.mode || "").toLowerCase() !== "wallet");
    const hadWallet = !!walletEntry;
    if (hadWallet) {
      const nonWalletMode = nonWalletEntry ? String(nonWalletEntry.mode || "").toLowerCase() : "cash";
      setMainPaymentMode((nonWalletMode === "upi" ? "upi" : "cash") as "upi" | "cash");
    }
    // Set the skip-ref BEFORE setUseWallet so the effect that fires won't overwrite entries
    skipPaymentRecomputeRef.current = true;
    setUseWallet(hadWallet);
    // Schedule
    setOrderScheduleType("slot");
    if (o.deliveryDate) setOrderDate(String(o.deliveryDate).slice(0, 10));
    if (o.timeslotId) setSelectedTimeslotId(String(o.timeslotId));
    // Restore delivery charge override + extra discount from saved order.
    // Set the skip ref so the pincodeDeliveryCharge sync effect doesn't overwrite it.
    skipDeliveryChargeSyncRef.current = true;
    const savedDeliveryCharge = Number(o.deliveryCharge);
    setDeliveryChargeInput(savedDeliveryCharge > 0 ? String(savedDeliveryCharge) : "");
    const savedExtraDiscount = Number(o.extraDiscount);
    setExtraDiscount(savedExtraDiscount > 0 ? String(savedExtraDiscount) : "");
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
  const totalToday = statsTotals.todayTotal ?? totalActive;
  const totalOtherDay = statsTotals.otherDayTotal ?? 0;
  const TABS = [
    { key: "current" as const, label: "Current Orders", count: totalToday, icon: Clock, color: "text-blue-600" },
    { key: "otherday" as const, label: "Next Day Orders", count: totalOtherDay, icon: Calendar, color: "text-orange-600" },
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

          {/* Date range picker — only shown on the All Orders tab */}
          {activeTab === "all" && (
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <button className={`flex-shrink-0 flex items-center gap-2 h-9 px-4 rounded-full border text-sm font-medium transition-colors ${dateFrom || dateTo ? "border-[#1A56DB] bg-blue-50 text-[#1A56DB]" : "border-gray-200 text-black hover:border-gray-300"}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  {dateFrom && dateTo
                    ? `${dateFrom} – ${dateTo}`
                    : dateFrom
                    ? dateFrom
                    : "Delivery Date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-3 w-auto" align="start">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Filter by Delivery Date</p>
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
          )}

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
                    const invNo = o.orderId || ("INV-" + String(o._id).slice(-6).toUpperCase());
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
                        <p className="text-xs text-black mt-1 whitespace-nowrap">Placed: {formatDate(o.createdAt)}</p>
                        {o.deliveryDate && (
                          <p className="text-xs text-[#364F9F] font-semibold whitespace-nowrap">Delivery: {formatDeliveryDate(o.deliveryDate)}</p>
                        )}
                        {o.orderId && (
                          <p className="text-[10px] font-mono font-bold text-[#364F9F] mt-0.5">{o.orderId}</p>
                        )}
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
                        {(Number(o.deliveryCharge) > 0) && <p className="text-xs text-orange-600">+{formatRupees(Number(o.deliveryCharge))} delivery</p>}
                        {(Number(o.instantDeliveryCharge) > 0) && <p className="text-xs text-orange-600">+{formatRupees(Number(o.instantDeliveryCharge))} instant</p>}
                        {(() => {
                          const pays: any[] = Array.isArray(o.payments) ? o.payments : [];
                          const walletEntry = pays.find((p: any) => String(p?.mode || "").toLowerCase() === "wallet");
                          const walletAmt = walletEntry ? Number(walletEntry.amount) || 0 : 0;
                          return walletAmt > 0 ? <p className="text-xs text-[#364F9F] font-medium">−{formatRupees(walletAmt)} wallet</p> : null;
                        })()}
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
                            title="Invoice"
                            onClick={() => setInvoiceOrder(o)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-violet-50 transition-colors"
                          >
                            <FileText className="w-[18px] h-[18px] text-violet-600" />
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

      {/* Create Order Page — Full-screen POS (portal bypasses layout header+sidebar) */}
      {isCreatePage && createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden" style={{ fontFamily: "'Poppins', sans-serif" }}>

        {/* ══ TOP HEADER ══ */}
        <div className="flex-shrink-0 bg-[#364F9F] flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => { if (!creatingSaving) { setLocation("/orders"); resetCreateForm(); } }}
            disabled={creatingSaving}
            className="flex items-center gap-1.5 text-white transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">Orders</span>
          </button>
          <div className="w-px h-5 bg-white/20 flex-shrink-0" />
          <h1 className="text-base font-bold text-white flex-shrink-0">
            {editingOrderId ? "Edit Order" : "New Order"}
          </h1>
          {/* Hub selectors */}
          <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
            <Select value={selectedSuperHubId} onValueChange={(v) => { if (!loadingSuperHubs) setSelectedSuperHubId(v); }}>
              <SelectTrigger className={`h-8 text-xs rounded-full px-3 w-auto max-w-[140px] border-none shadow-none text-white [&>svg]:text-white [&_span]:!text-white transition-colors font-semibold ${selectedSuperHubId ? "bg-[#F05B4E] hover:bg-[#e04a3d]" : "bg-white/20 hover:bg-white/30"}`}>
                <SelectValue placeholder={loadingSuperHubs ? "Loading..." : "Super Hub"} />
              </SelectTrigger>
              <SelectContent>
                {superHubs.map((h) => (
                  <SelectItem key={h.id} value={h.id}><span className="text-sm">{h.name}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChevronRight className="w-3.5 h-3.5 text-white flex-shrink-0" />
            <Select value={selectedSubHubId} onValueChange={(v) => { if (selectedSuperHubId && !loadingSubHubs) setSelectedSubHubId(v); }}>
              <SelectTrigger className={`h-8 text-xs rounded-full px-3 w-auto max-w-[140px] border-none shadow-none text-white [&>svg]:text-white [&_span]:!text-white transition-colors font-semibold ${selectedSubHubId ? "bg-[#F05B4E] hover:bg-[#e04a3d]" : "bg-white/20 hover:bg-white/30"}`}>
                <SelectValue placeholder={!selectedSuperHubId ? "Sub Hub" : loadingSubHubs ? "Loading..." : "Sub Hub"} />
              </SelectTrigger>
              <SelectContent>
                {subHubs.map((h) => (
                  <SelectItem key={h.id} value={h.id}><span className="text-sm">{h.name}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Delivery / Takeaway pill toggle */}
          <div className="flex items-center gap-1 flex-shrink-0 bg-white/10 rounded-full p-0.5">
            <button
              onClick={() => setOrderDeliveryType("delivery")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${orderDeliveryType === "delivery" ? "bg-[#F05B4E] text-white shadow-sm" : "text-white"}`}
            >
              Delivery
            </button>
            <button
              onClick={() => setOrderDeliveryType("takeaway")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${orderDeliveryType === "takeaway" ? "bg-[#F05B4E] text-white shadow-sm" : "text-white"}`}
            >
              Takeaway
            </button>
          </div>
        </div>

        {/* ══ MAIN BODY — 3 columns ══ */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT: CATEGORIES ── */}
          <div className="w-44 flex-shrink-0 bg-[#364F9F] flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Categories</p>
            </div>
            <div className="flex-1 overflow-y-auto pb-4">
              <button
                onClick={() => setPickerCategory(null)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all text-left ${
                  !pickerCategory ? "bg-[#F05B4E] text-white" : "text-white hover:bg-white/10"
                }`}
              >
                <span className="truncate flex-1">All Items</span>
                <span className={`text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex-shrink-0 flex items-center justify-center ${!pickerCategory ? "bg-[#162B4D] text-white" : "bg-[#F05B4E] text-white"}`}>{subHubProducts.length}</span>
              </button>
              {loadingProducts ? (
                <div className="px-4 py-6 text-xs text-white/40 text-center">Loading...</div>
              ) : filteredCategories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setPickerCategory(cat.name)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all text-left ${
                    pickerCategory === cat.name ? "bg-[#F05B4E] text-white" : "text-white hover:bg-white/10"
                  }`}
                >
                  <span className="truncate flex-1 capitalize">{cat.name}</span>
                  <span className={`text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex-shrink-0 flex items-center justify-center ${pickerCategory === cat.name ? "bg-[#162B4D] text-white" : "bg-[#F05B4E] text-white"}`}>{cat.count}</span>
                </button>
              ))}
              {!loadingProducts && productCategories.length === 0 && selectedSubHubId && (
                <p className="px-4 py-4 text-xs text-white/30 text-center">No products loaded</p>
              )}
              {!selectedSubHubId && (
                <p className="px-4 py-4 text-xs text-white/30 text-center">Select a hub to load menu</p>
              )}
            </div>
          </div>

          {/* ── CENTER: PRODUCTS GRID ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50">
            {/* Search bar */}
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={pickerCategory ? `Search in ${pickerCategory}...` : "Search menu items..."}
                  className="pl-9 h-9 text-sm bg-gray-50 border-gray-200 focus:bg-white"
                />
                {productSearch && (
                  <button onClick={() => setProductSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap font-medium">
                {filteredProducts.length} item{filteredProducts.length !== 1 ? "s" : ""}
                {pickerCategory ? ` in ${pickerCategory}` : ""}
              </span>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedSubHubId ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#162B4D]/10 flex items-center justify-center mb-4">
                    <Building2 className="w-7 h-7 text-[#162B4D]/40" />
                  </div>
                  <p className="text-base font-semibold text-gray-600">Select a hub to view menu</p>
                  <p className="text-sm text-gray-400 mt-1">Use the hub dropdowns in the top bar</p>
                </div>
              ) : loadingProducts ? (
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 rounded-xl" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <Package className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-400">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filteredProducts.map((p) => {
                    const pid = String(p._id);
                    const cartItem = selectedProducts.find((sp) => sp.productId === pid);
                    const stock = Number(p.quantity) || 0;
                    const outOfStock = stock <= 0;
                    const lowStock = stock > 0 && stock <= 5;
                    const atMax = cartItem ? cartItem.quantity >= stock : false;
                    return (
                      <div
                        key={pid}
                        className={`rounded-xl border-2 transition-all select-none flex flex-col ${
                          outOfStock
                            ? "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
                            : cartItem
                              ? "border-[#1A56DB] bg-blue-50/60 shadow-md shadow-blue-100"
                              : "border-gray-200 bg-white hover:border-[#1A56DB]/60 hover:shadow-md cursor-pointer"
                        }`}
                        onClick={() => {
                          if (outOfStock) { toast({ title: "Out of stock", description: `${p.name} is unavailable.`, variant: "destructive" }); return; }
                          if (atMax) { toast({ title: "Stock limit reached", description: `Only ${stock} available.`, variant: "destructive" }); return; }
                          setSelectedProducts((prev) => {
                            const exists = prev.find((sp) => sp.productId === pid);
                            if (exists) return prev.map((sp) => sp.productId === pid ? { ...sp, quantity: sp.quantity + 1 } : sp);
                            return [...prev, { productId: pid, name: p.name, price: Number(p.price) || 0, unit: p.unit ?? "", quantity: 1 }];
                          });
                        }}
                      >
                        <div className="p-2.5 flex flex-col flex-1">
                          <p className="text-sm font-medium text-[#162B4D] leading-snug line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                          <p className="text-xs text-gray-400 uppercase tracking-wide truncate h-4">{p.category || "\u00A0"}</p>
                          <div className="flex items-center justify-between mt-auto pt-1.5 gap-1">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#1A56DB]">₹{Number(p.price).toLocaleString("en-IN")}</p>
                              {lowStock && !outOfStock && <p className="text-[10px] font-medium text-amber-500 leading-none">Only {stock} left</p>}
                              {outOfStock && <p className="text-[10px] font-bold text-red-500 leading-none">Out of stock</p>}
                            </div>
                            {cartItem ? (
                              <div className="flex items-center bg-[#1A56DB] rounded-lg overflow-hidden shadow-sm flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="w-6 h-6 flex items-center justify-center text-white hover:bg-[#1447B4] font-bold text-sm"
                                  onClick={(e) => { e.stopPropagation(); setSelectedProducts((arr) => cartItem.quantity <= 1 ? arr.filter((x) => x.productId !== pid) : arr.map((x) => x.productId === pid ? { ...x, quantity: x.quantity - 1 } : x)); }}
                                >−</button>
                                <span className="text-xs font-bold text-white min-w-[16px] text-center">{cartItem.quantity}</span>
                                <button
                                  className="w-6 h-6 flex items-center justify-center text-white hover:bg-[#1447B4] font-bold text-sm disabled:opacity-40"
                                  disabled={atMax}
                                  onClick={(e) => { e.stopPropagation(); if (!atMax) setSelectedProducts((arr) => arr.map((x) => x.productId === pid ? { ...x, quantity: x.quantity + 1 } : x)); }}
                                >+</button>
                              </div>
                            ) : !outOfStock && (
                              <div className="w-6 h-6 rounded-full bg-[#1A56DB] flex items-center justify-center shadow-sm flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Plus className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: ORDER PANEL — split: customer/schedule | cart ── */}
          <div className="w-[600px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-row overflow-hidden">

            {/* ── Left half: Customer + Address + Schedule ── */}
            <div className="w-[320px] flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">

              {/* Customer — phone-search UX */}
              <div className="px-4 pt-3 pb-3 border-b border-gray-100">
                <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5 mb-2"><img src="/icon-customer.png" className="w-4 h-4 object-contain" alt="" />Customer</p>

                {/* ── State A: customer already selected ── */}
                {chosenCustomer ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50">
                      <div className="w-8 h-8 rounded-full bg-[#162B4D] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{chosenCustomer.name?.charAt(0).toUpperCase() || "?"}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#162B4D] truncate">{chosenCustomer.name}</p>
                        <p className="text-xs text-gray-400">{chosenCustomer.phone}</p>
                      </div>
                      <button onClick={() => { setChosenCustomer(null); setSelectedAddressIdx(null); setCustomerSearch(""); setNewCustomer({ name: "", phone: "", email: "", dateOfBirth: "" }); }} className="text-gray-300 hover:text-red-400 flex-shrink-0 p-0.5"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {Number(chosenCustomer.walletBalance) > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-100 bg-blue-50">
                        <Wallet className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-blue-700">FishTokri Wallet: ₹{Number(chosenCustomer.walletBalance).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                  </div>

                ) : (() => {
                  const searchTrimmed = customerSearch.trim();
                  const isPhoneOnly = /^\d+$/.test(searchTrimmed);
                  const digits = searchTrimmed.replace(/\D/g, "").slice(0, 10);
                  const phoneMatches = isPhoneOnly && digits.length > 0
                    ? allCustomers.filter((c: any) => (c.phone || "").replace(/\D/g, "").includes(digits))
                    : [];
                  const nameMatches = !isPhoneOnly && searchTrimmed.length > 1
                    ? allCustomers.filter((c: any) => (c.name || "").toLowerCase().includes(searchTrimmed.toLowerCase()))
                    : [];
                  const allMatches = isPhoneOnly ? phoneMatches : nameMatches;
                  const isComplete = isPhoneOnly && digits.length === 10;
                  const noMatch = isComplete && phoneMatches.length === 0;

                  return (
                    <>
                      {/* Phone / Name search input */}
                      <div className="relative">
                        <Phone className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <Input
                          value={customerSearch}
                          onChange={(e) => {
                            let val = e.target.value;
                            const isAllDigits = /^\d*$/.test(val);
                            if (isAllDigits) {
                              val = val.slice(0, 10);
                              setNewCustomer((n) => ({ ...n, phone: val }));
                              setNewAddress((a) => ({ ...a, phone: val }));
                            }
                            setCustomerSearch(val);
                          }}
                          placeholder="Search by name or phone…"
                          className="pl-6 h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        {customerSearch.length > 0 && (
                          <button onClick={() => { setCustomerSearch(""); setNewCustomer({ name: "", phone: "", email: "", dateOfBirth: "" }); }} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-3.5 h-3.5" /></button>
                        )}
                      </div>

                      {/* Matching existing customers */}
                      {!noMatch && allMatches.length > 0 && (
                        <div className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden">
                          {allMatches.slice(0, 4).map((c: any) => (
                            <button key={c.id} type="button"
                              onClick={() => handleSelectCustomer(c)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-0"
                            >
                              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">{c.name?.charAt(0).toUpperCase() || "?"}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#162B4D] truncate">{c.name}</p>
                                <p className="text-xs text-gray-400">{c.phone}</p>
                              </div>
                              <Check className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* New customer form — appears automatically when 10 digits entered and no match */}
                      {noMatch && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs font-semibold text-[#1A56DB] flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" />New customer — fill in details</p>
                          <Input value={newCustomer.name} onChange={(e) => { setNewCustomer((n) => ({ ...n, name: e.target.value })); setNewAddress((a) => ({ ...a, name: e.target.value })); }} placeholder="Full name *" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                          <Input value={newCustomer.email} onChange={(e) => setNewCustomer((n) => ({ ...n, email: e.target.value }))} placeholder="Email (optional)" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" type="email" />
                          <Input value={newCustomer.dateOfBirth} onChange={(e) => setNewCustomer((n) => ({ ...n, dateOfBirth: e.target.value }))} placeholder="Date of birth (optional)" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" type="date" />
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Delivery Address */}
              {orderDeliveryType === "delivery" && (
                <div className="px-4 pt-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5"><img src="/icon-address.png" className="w-4 h-4 object-contain" alt="" />Address</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!isOutstationNeeded}
                        onClick={() => setIsOutstationDelivery((v) => !v)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all select-none ${!isOutstationNeeded ? "opacity-35 cursor-not-allowed border-gray-200 text-gray-400 bg-white" : isOutstationDelivery ? "bg-orange-500 border-orange-500 text-white cursor-pointer" : "bg-white border-gray-300 text-gray-500 cursor-pointer hover:border-orange-400"}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOutstationDelivery ? "bg-white" : "bg-gray-400"}`} />
                        Outstation
                      </button>
                      {chosenCustomer && Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0 && (
                        <div className="flex items-center gap-0.5 bg-gray-100 rounded-full p-0.5">
                          <button onClick={() => setOrderAddressMode("saved")} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${orderAddressMode === "saved" ? "bg-[#1A56DB] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Saved</button>
                          <button onClick={() => setOrderAddressMode("new")} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${orderAddressMode === "new" ? "bg-[#1A56DB] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>New</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {chosenCustomer && orderAddressMode === "saved" && Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0 ? (
                    <div className="space-y-2">
                      {/* Address selector tabs — always shown for saved addresses */}
                      <div className="flex gap-1.5 flex-wrap">
                        {chosenCustomer.addresses.map((a: any, i: number) => {
                          const f = getAddressFields(a);
                          return (
                            <button key={i} type="button" onClick={() => setSelectedAddressIdx(i)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedAddressIdx === i ? "bg-[#1A56DB] text-white border-[#1A56DB]" : "border-gray-200 text-gray-500 bg-white hover:bg-gray-50"}`}>
                              {f?.label || `Address ${i + 1}`}
                            </button>
                          );
                        })}
                      </div>
                      {/* Prompt to select address when none chosen yet */}
                      {selectedAddressIdx === null ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-amber-700">Select an address above to continue</span>
                        </div>
                      ) : (
                        /* Full editable form for the selected address */
                        <div className="space-y-0">
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                            <Input value={editedSavedAddress.name} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, name: e.target.value }))} placeholder="Recipient name" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.phone} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="Phone" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                            <Input value={editedSavedAddress.building} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, building: e.target.value }))} placeholder="Building / Flat *" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.street} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, street: e.target.value }))} placeholder="Street / Landmark" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.area} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, area: e.target.value }))} placeholder="Area *" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.pincode} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="Pincode *" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                          </div>
                          {/* Save / Cancel — only shown when user has changed something vs the original */}
                          {savedAddrDirty && (
                            <div className="flex gap-2 pt-2">
                              <button
                                type="button"
                                disabled={savingAddress}
                                onClick={async () => {
                                  if (!chosenCustomer?.id) return;
                                  setSavingAddress(true);
                                  try {
                                    const currentAddresses = Array.isArray(chosenCustomer.addresses) ? [...chosenCustomer.addresses] : [];
                                    const f = editedSavedAddress;
                                    currentAddresses[selectedAddressIdx] = { ...(currentAddresses[selectedAddressIdx] ?? {}), label: f.label, name: f.name, phone: f.phone, building: f.building, street: f.street, area: f.area, landmark: f.landmark, pincode: f.pincode, city: f.city, state: f.state };
                                    await apiFetch(`/api/customers/${chosenCustomer.id}`, { method: "PUT", body: JSON.stringify({ addresses: currentAddresses }) });
                                    // Update baseline — makes dirty = false, buttons hide immediately
                                    setOriginalSavedAddress({ ...editedSavedAddress });
                                    setChosenCustomer((c: any) => ({ ...c, addresses: currentAddresses }));
                                    toast({ title: "Address saved" });
                                  } catch {
                                    toast({ title: "Failed to save address", variant: "destructive" });
                                  } finally {
                                    setSavingAddress(false);
                                  }
                                }}
                                className="flex-1 h-7 rounded-lg bg-[#1A56DB] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                {savingAddress ? "Saving…" : "Save Address"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  // Revert to the baseline — makes dirty = false, buttons hide
                                  setEditedSavedAddress({ ...originalSavedAddress });
                                }}
                                className="flex-1 h-7 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-1.5">
                        {["Home", "Work", "Other"].map((lbl) => (
                          <button key={lbl} type="button" onClick={() => setNewAddress((a) => ({ ...a, label: lbl }))} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${newAddress.label === lbl ? "bg-[#1A56DB] text-white border-[#1A56DB]" : "border-gray-200 text-gray-500 bg-white hover:bg-gray-50"}`}>{lbl}</button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                        <Input value={newAddress.name} onChange={(e) => setNewAddress((a) => ({ ...a, name: e.target.value }))} placeholder="Recipient name *" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.phone} onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="Phone *" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                        <Input value={newAddress.building} onChange={(e) => setNewAddress((a) => ({ ...a, building: e.target.value }))} placeholder="Building / Flat *" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.street} onChange={(e) => setNewAddress((a) => ({ ...a, street: e.target.value }))} placeholder="Street / Landmark" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.area} onChange={(e) => setNewAddress((a) => ({ ...a, area: e.target.value }))} placeholder="Area *" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.pincode} onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="Pincode *" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                      </div>
                      {/* Save to Profile / Clear buttons for new address — Save hides once saved, reappears on edit */}
                      <div className="flex gap-2 pt-1">
                        {chosenCustomer?.id && (
                          newAddressSaved ? (
                            <p className="flex-1 text-xs font-semibold text-emerald-600 text-center py-1">✓ Saved to profile</p>
                          ) : (
                            <button
                              type="button"
                              disabled={savingAddress || !newAddress.building.trim() || !newAddress.area.trim() || !newAddress.pincode.trim()}
                              onClick={async () => {
                                if (!chosenCustomer?.id) return;
                                setSavingAddress(true);
                                try {
                                  const currentAddresses = Array.isArray(chosenCustomer.addresses) ? [...chosenCustomer.addresses] : [];
                                  const entry = { label: newAddress.label || "Home", name: newAddress.name, phone: newAddress.phone, building: newAddress.building, street: newAddress.street, area: newAddress.area, pincode: newAddress.pincode };
                                  const updated = [...currentAddresses, entry];
                                  await apiFetch(`/api/customers/${chosenCustomer.id}`, { method: "PUT", body: JSON.stringify({ addresses: updated }) });
                                  setChosenCustomer((c: any) => ({ ...c, addresses: updated }));
                                  setNewAddressSaved(true);
                                  toast({ title: "Address saved to profile" });
                                } catch {
                                  toast({ title: "Failed to save address", variant: "destructive" });
                                } finally {
                                  setSavingAddress(false);
                                }
                              }}
                              className="flex-1 h-7 rounded-lg bg-[#1A56DB] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {savingAddress ? "Saving…" : "Save to Profile"}
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => setNewAddress({ label: "Home", name: "", phone: "", building: "", street: "", area: "", pincode: "" })}
                          className="flex-1 h-7 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                  {isOutstationNeeded && (
                    <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${isOutstationDelivery ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-red-50 border-red-200 text-red-600"}`}>
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Pincode <strong>{deliveryPincode}</strong> is not in the service area.
                        {isOutstationDelivery ? " Outstation delivery enabled — order can be placed." : " Enable \"Outstation Delivery\" above to proceed."}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Optional address for takeaway */}
              {orderDeliveryType === "takeaway" && (chosenCustomer || customerMode === "new") && (
                <div className="px-4 pt-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5">
                      <img src="/icon-address.png" className="w-4 h-4 object-contain" alt="" />
                      Address <span className="text-xs text-gray-400 font-normal ml-1">(optional)</span>
                    </p>
                    {chosenCustomer && Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0 && (
                      <div className="flex items-center gap-0.5 bg-gray-100 rounded-full p-0.5">
                        <button onClick={() => setOrderAddressMode("saved")} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${orderAddressMode === "saved" ? "bg-[#1A56DB] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Saved</button>
                        <button onClick={() => setOrderAddressMode("new")} className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${orderAddressMode === "new" ? "bg-[#1A56DB] text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>New</button>
                      </div>
                    )}
                  </div>
                  {chosenCustomer && orderAddressMode === "saved" && Array.isArray(chosenCustomer.addresses) && chosenCustomer.addresses.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex gap-1.5 flex-wrap">
                        {chosenCustomer.addresses.map((a: any, i: number) => {
                          const f = getAddressFields(a);
                          return (
                            <button key={i} type="button" onClick={() => setSelectedAddressIdx(i)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedAddressIdx === i ? "bg-[#1A56DB] text-white border-[#1A56DB]" : "border-gray-200 text-gray-500 bg-white hover:bg-gray-50"}`}>
                              {f?.label || `Address ${i + 1}`}
                            </button>
                          );
                        })}
                      </div>
                      {selectedAddressIdx !== null && (
                        <div className="space-y-0">
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                            <Input value={editedSavedAddress.name} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, name: e.target.value }))} placeholder="Recipient name" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.phone} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="Phone" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                            <Input value={editedSavedAddress.building} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, building: e.target.value }))} placeholder="Building / Flat" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.street} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, street: e.target.value }))} placeholder="Street / Landmark" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.area} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, area: e.target.value }))} placeholder="Area" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                            <Input value={editedSavedAddress.pincode} onChange={(e) => setEditedSavedAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="Pincode" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                          </div>
                          {savedAddrDirty && (
                            <div className="flex gap-2 pt-2">
                              <button
                                type="button"
                                disabled={savingAddress}
                                onClick={async () => {
                                  if (!chosenCustomer?.id) return;
                                  setSavingAddress(true);
                                  try {
                                    const currentAddresses = Array.isArray(chosenCustomer.addresses) ? [...chosenCustomer.addresses] : [];
                                    const f = editedSavedAddress;
                                    currentAddresses[selectedAddressIdx] = { ...(currentAddresses[selectedAddressIdx] ?? {}), label: f.label, name: f.name, phone: f.phone, building: f.building, street: f.street, area: f.area, landmark: f.landmark, pincode: f.pincode, city: f.city, state: f.state };
                                    await apiFetch(`/api/customers/${chosenCustomer.id}`, { method: "PUT", body: JSON.stringify({ addresses: currentAddresses }) });
                                    setOriginalSavedAddress({ ...editedSavedAddress });
                                    setChosenCustomer((c: any) => ({ ...c, addresses: currentAddresses }));
                                    toast({ title: "Address saved" });
                                  } catch {
                                    toast({ title: "Failed to save address", variant: "destructive" });
                                  } finally {
                                    setSavingAddress(false);
                                  }
                                }}
                                className="flex-1 h-7 rounded-lg bg-[#1A56DB] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                {savingAddress ? "Saving…" : "Save Address"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditedSavedAddress({ ...originalSavedAddress })}
                                className="flex-1 h-7 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-1.5">
                        {["Home", "Work", "Other"].map((lbl) => (
                          <button key={lbl} type="button" onClick={() => setNewAddress((a) => ({ ...a, label: lbl }))} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${newAddress.label === lbl ? "bg-[#1A56DB] text-white border-[#1A56DB]" : "border-gray-200 text-gray-500 bg-white hover:bg-gray-50"}`}>{lbl}</button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                        <Input value={newAddress.name} onChange={(e) => setNewAddress((a) => ({ ...a, name: e.target.value }))} placeholder="Recipient name" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.phone} onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="Phone" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                        <Input value={newAddress.building} onChange={(e) => setNewAddress((a) => ({ ...a, building: e.target.value }))} placeholder="Building / Flat" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.street} onChange={(e) => setNewAddress((a) => ({ ...a, street: e.target.value }))} placeholder="Street / Landmark" className="h-8 text-sm col-span-2 border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.area} onChange={(e) => setNewAddress((a) => ({ ...a, area: e.target.value }))} placeholder="Area" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" />
                        <Input value={newAddress.pincode} onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="Pincode" className="h-8 text-sm border-0 border-b border-gray-300 rounded-none bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0" inputMode="numeric" />
                      </div>
                      <div className="flex gap-2 pt-1">
                        {chosenCustomer?.id && (
                          newAddressSaved ? (
                            <p className="flex-1 text-xs font-semibold text-emerald-600 text-center py-1">✓ Saved to profile</p>
                          ) : (
                            <button
                              type="button"
                              disabled={savingAddress || !newAddress.building.trim()}
                              onClick={async () => {
                                if (!chosenCustomer?.id) return;
                                setSavingAddress(true);
                                try {
                                  const currentAddresses = Array.isArray(chosenCustomer.addresses) ? [...chosenCustomer.addresses] : [];
                                  const entry = { label: newAddress.label || "Home", name: newAddress.name, phone: newAddress.phone, building: newAddress.building, street: newAddress.street, area: newAddress.area, pincode: newAddress.pincode };
                                  const updated = [...currentAddresses, entry];
                                  await apiFetch(`/api/customers/${chosenCustomer.id}`, { method: "PUT", body: JSON.stringify({ addresses: updated }) });
                                  setChosenCustomer((c: any) => ({ ...c, addresses: updated }));
                                  setNewAddressSaved(true);
                                  toast({ title: "Address saved to profile" });
                                } catch {
                                  toast({ title: "Failed to save address", variant: "destructive" });
                                } finally {
                                  setSavingAddress(false);
                                }
                              }}
                              className="flex-1 h-7 rounded-lg bg-[#1A56DB] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {savingAddress ? "Saving…" : "Save to Profile"}
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => setNewAddress({ label: "Home", name: "", phone: "", building: "", street: "", area: "", pincode: "" })}
                          className="flex-1 h-7 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Schedule */}
              {orderDeliveryType === "delivery" && (
                <div className="px-4 pt-3 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5"><img src="/icon-schedule.png" className="w-4 h-4 object-contain" alt="" />Schedule</p>
                  </div>
                  {/* Today / Tomorrow selector — only these two days are bookable */}
                  <div className="flex gap-2 mb-2">
                    {[
                      { label: "Today", value: getTodayIST() },
                      { label: "Tomorrow", value: getTomorrowIST() },
                    ].map(({ label, value }) => {
                      const isSelected = orderDate === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => { setOrderDate(value); setSelectedTimeslotId(""); }}
                          className={`flex-1 h-9 rounded-lg border text-sm font-semibold transition-all ${
                            isSelected
                              ? "border-[#1A56DB] bg-blue-50 text-[#1A56DB]"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {orderScheduleType === "slot" && (
                    loadingTimeslots ? <p className="text-xs text-gray-400">Loading slots...</p>
                    : activeTimeslots.length === 0 ? <p className="text-xs text-amber-600 flex items-center gap-1"><Zap className="w-3 h-3" />No slots available for this date</p>
                    : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {activeTimeslots.map((t) => {
                          const id = String(t._id);
                          const isSelected = selectedTimeslotId === id;
                          const extra = Number(t.extraCharge) || 0;
                          const displayStart = t.startTime ?? "";
                          const displayEnd = addMinutesToTimeStr(t.endTime, pincodeTimeDelay);
                          return (
                            <button key={id} type="button" onClick={() => setSelectedTimeslotId(id)}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${isSelected ? "border-[#1A56DB] bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                            >
                              <span className={`text-xs font-semibold ${isSelected ? "text-[#1A56DB]" : "text-[#162B4D]"}`}>
                                {displayStart}–{displayEnd}{extra > 0 ? ` +₹${extra}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
            </div>{/* end left half */}

            {/* ── Right half: Punched Orders / Cart ── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="px-3 pt-3 pb-2 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
                <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5"><img src="/icon-order.png" className="w-4 h-4 object-contain" alt="" />Order</p>
                {selectedProducts.length > 0 && (
                  <span className="text-[11px] font-bold text-[#F05B4E]">{totalItemCount} item{totalItemCount !== 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {selectedProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="w-12 h-12 rounded-2xl bg-gray-200 flex items-center justify-center mb-2">
                      <ShoppingBag className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-400">Cart is empty</p>
                    <p className="text-xs text-gray-300 mt-0.5">Tap products to add</p>
                  </div>
                ) : (
                  <div className="px-3 py-2 space-y-0">
                    {selectedProducts.map((p) => {
                      const stock = stockOf(p.productId);
                      const atMax = p.quantity >= stock;
                      return (
                        <div key={p.productId} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#162B4D] leading-tight truncate">{p.name}</p>
                            <p className="text-[11px] text-gray-400">₹{Number(p.price).toLocaleString("en-IN")}{p.unit ? ` / ${p.unit}` : ""}</p>
                          </div>
                          <div className="flex items-center bg-white rounded-md border border-gray-200 overflow-hidden flex-shrink-0">
                            <button onClick={() => setSelectedProducts((arr) => p.quantity <= 1 ? arr.filter((x) => x.productId !== p.productId) : arr.map((x) => x.productId === p.productId ? { ...x, quantity: x.quantity - 1 } : x))} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 font-bold">−</button>
                            <span className="text-xs font-bold text-gray-700 min-w-[18px] text-center">{p.quantity}</span>
                            <button disabled={atMax} onClick={() => { if (!atMax) setSelectedProducts((arr) => arr.map((x) => x.productId === p.productId ? { ...x, quantity: x.quantity + 1 } : x)); }} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 font-bold disabled:opacity-30">+</button>
                          </div>
                          <span className="text-xs font-bold text-[#162B4D] w-12 text-right flex-shrink-0">₹{(p.price * p.quantity).toLocaleString("en-IN")}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Coupon section ── */}
              <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3">
                <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5 mb-1.5"><img src="/icon-coupon.png" className="w-4 h-4 object-contain" alt="" />Coupon</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <Input value={couponCode} onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }} placeholder="Enter code" className="pl-7 h-7 text-xs" />
                  </div>
                  <Button type="button" variant="outline" onClick={applyCouponByCode} disabled={!couponCode.trim()} className="h-7 text-xs px-2.5">Apply</Button>
                </div>
                {couponError && <p className="text-[11px] text-red-500 mt-1">{couponError}</p>}
                {totalItemCount > 0 && !loadingCoupons && activeCoupons.length > 0 && (
                  <div className="mt-1.5 divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                    {activeCoupons.slice(0, 5).map((c) => {
                      const cid = String(c._id);
                      const isApplied = appliedCouponIds.includes(cid);
                      const min = Number(c.minOrderAmount) || 0;
                      const meetsMin = itemsSubtotal >= min;
                      const canApply = isCouponApplicable(c) && meetsMin;
                      const label = c.type === "percentage" ? `${Number(c.discountValue)}% OFF` : `₹${Number(c.discountValue)} OFF`;
                      return (
                        <div key={cid} className="flex items-center justify-between px-2.5 py-1.5">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[#162B4D]">{c.code}</span>
                            <span className="text-[11px] text-gray-400 ml-1.5">{label}</span>
                            {min > 0 && !meetsMin && <p className="text-[10px] text-gray-400">Min ₹{min}</p>}
                          </div>
                          {isApplied ? (
                            <button onClick={() => setAppliedCouponIds((ids) => ids.filter((id) => id !== cid))} className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex-shrink-0 ml-2">Remove</button>
                          ) : (
                            <button onClick={() => canApply && toggleCoupon(cid)} disabled={!canApply} className={`text-[11px] font-semibold flex-shrink-0 ml-2 transition-colors ${canApply ? "text-emerald-600 hover:text-emerald-700" : "text-gray-300 cursor-not-allowed"}`}>Apply</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Payment ── */}
              <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2">
                <p className="text-sm font-normal text-gray-900 flex items-center gap-1.5 mb-2"><img src="/icon-payment.png" className="w-4 h-4 object-contain" alt="" />Payment</p>
                {/* Main mode: UPI or Cash */}
                <div className="flex items-center gap-2 mb-2">
                  <button type="button"
                    onClick={() => setMainPaymentMode("upi")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${mainPaymentMode === "upi" ? "border-[#1A56DB] bg-[#1A56DB] text-white shadow-sm" : "border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-300"}`}
                  >
                    <Smartphone className="w-4 h-4" />
                    UPI
                  </button>
                  <button type="button"
                    onClick={() => setMainPaymentMode("cash")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${mainPaymentMode === "cash" ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm" : "border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-300"}`}
                  >
                    <Banknote className="w-4 h-4" />
                    Cash
                  </button>
                </div>
                {/* Wallet checkbox — only shown when customer has balance */}
                {Number(chosenCustomer?.walletBalance) > 0 && (() => {
                  const walletBal = Number(chosenCustomer!.walletBalance);
                  const walletApplied = Math.min(walletBal, newOrderTotal);
                  const remaining = Math.max(0, newOrderTotal - walletApplied);
                  return (
                    <label className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all ${useWallet ? "border-[#364F9F] bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40"}`}>
                      <input
                        type="checkbox"
                        checked={useWallet}
                        onChange={(e) => setUseWallet(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#364F9F] cursor-pointer flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-sm font-semibold ${useWallet ? "text-[#364F9F]" : "text-gray-700"}`}>Use FishTokri Wallet</span>
                          <span className={`text-xs font-bold tabular-nums ${useWallet ? "text-[#364F9F]" : "text-gray-500"}`}>₹{walletBal.toLocaleString("en-IN")}</span>
                        </div>
                        {useWallet && (
                          <p className="text-[11px] text-[#364F9F]/70 mt-0.5">
                            {walletApplied >= newOrderTotal
                              ? `₹${walletApplied.toLocaleString("en-IN")} from wallet · Order fully covered`
                              : `₹${walletApplied.toLocaleString("en-IN")} from wallet · ₹${remaining.toLocaleString("en-IN")} via ${mainPaymentMode === "upi" ? "UPI" : "Cash"}`}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })()}
              </div>

              {/* ── Notes ── */}
              <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2">
                <Textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Order notes (optional)..." className="text-xs min-h-[28px] max-h-[32px] resize-none bg-gray-50 border-gray-200 w-full" rows={1} />
              </div>

              {/* ── Totals + CTA ── */}
              <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Subtotal</span>
                  <span>₹{itemsSubtotal.toLocaleString("en-IN")}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-xs text-emerald-600 font-medium">
                    <span>Coupon discount</span>
                    <span>−₹{couponDiscount.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {/* Extra discount input */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-emerald-600 font-medium whitespace-nowrap">Extra discount</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-emerald-600 font-medium">−₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={extraDiscount}
                      placeholder="0"
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        const num = Number(val);
                        const maxDiscount = Math.max(0, itemsSubtotal - couponDiscount + slotExtraCharge + effectiveDeliveryCharge);
                        if (num > maxDiscount) return;
                        setExtraDiscount(val);
                      }}
                      className="w-16 text-right text-xs font-semibold text-emerald-600 border-0 border-b border-emerald-300 bg-transparent outline-none focus:border-emerald-500 py-0.5 px-0"
                    />
                  </div>
                </div>
                {slotExtraCharge > 0 && (
                  <div className="flex justify-between text-xs text-[#1A56DB] font-medium">
                    <span>Slot charge</span>
                    <span>+₹{slotExtraCharge.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {/* Editable delivery charge */}
                {orderDeliveryType === "delivery" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-orange-600 font-medium whitespace-nowrap">
                      Delivery charge{deliveryPincode ? ` (${deliveryPincode})` : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-orange-600 font-medium">+₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={deliveryChargeInput}
                        placeholder="0"
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setDeliveryChargeInput(val);
                        }}
                        className="w-16 text-right text-xs font-semibold text-orange-600 border-0 border-b border-orange-300 bg-transparent outline-none focus:border-orange-500 py-0.5 px-0"
                      />
                    </div>
                  </div>
                )}
                {useWallet && Number(chosenCustomer?.walletBalance) > 0 && (() => {
                  const walletApplied = Math.min(Number(chosenCustomer!.walletBalance), newOrderTotal);
                  return (
                    <div className="flex justify-between text-xs text-[#364F9F] font-medium">
                      <span>Wallet applied</span>
                      <span>−₹{walletApplied.toLocaleString("en-IN")}</span>
                    </div>
                  );
                })()}
                <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                  <span className="text-sm font-bold text-[#162B4D]">Total</span>
                  {useWallet && Number(chosenCustomer?.walletBalance) > 0 ? (() => {
                    const walletApplied = Math.min(Number(chosenCustomer!.walletBalance), newOrderTotal);
                    const finalAmt = Math.max(0, newOrderTotal - walletApplied);
                    return (
                      <div className="text-right">
                        <span className="text-xl font-extrabold text-[#162B4D]">₹{finalAmt.toLocaleString("en-IN")}</span>
                        <span className="block text-[10px] text-gray-400 font-normal">+₹{walletApplied.toLocaleString("en-IN")} via wallet</span>
                      </div>
                    );
                  })() : (
                    <span className="text-xl font-extrabold text-[#162B4D]">₹{newOrderTotal.toLocaleString("en-IN")}</span>
                  )}
                </div>
                <Button
                  onClick={handleCreateOrder}
                  disabled={creatingSaving || totalItemCount === 0}
                  className="w-full h-9 bg-[#F05B4E] hover:bg-[#d94a3e] text-white font-bold text-sm rounded-xl gap-2 disabled:opacity-50"
                >
                  {(() => {
                    if (creatingSaving) return editingOrderId ? "Saving..." : "Creating...";
                    if (editingOrderId) return <><Pencil className="w-4 h-4" />Save Changes</>;
                    const walletApplied = useWallet ? Math.min(Number(chosenCustomer?.walletBalance) || 0, newOrderTotal) : 0;
                    const nonWalletAmt = Math.max(0, newOrderTotal - walletApplied);
                    if (paymentStatus === "paid") {
                      return nonWalletAmt > 0
                        ? <><Zap className="w-4 h-4" />Checkout · ₹{nonWalletAmt.toLocaleString("en-IN")}</>
                        : <><Zap className="w-4 h-4" />Checkout (Wallet)</>;
                    }
                    if (paymentStatus === "partial") {
                      return <><ShoppingBag className="w-4 h-4" />Place Order · ₹{nonWalletAmt.toLocaleString("en-IN")} due</>;
                    }
                    return <><ShoppingBag className="w-4 h-4" />Place Order (Cash)</>;
                  })()}
                </Button>
              </div>

            </div>{/* end right half */}

          </div>{/* end right panel */}

        </div>{/* end 3-col body */}
      </div>,
      document.body
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
                      {selectedOrder.orderId || formatOrderId(selectedOrder, dailySeqMap.get(String(selectedOrder._id)))}
                    </p>
                    <p className="text-sm font-medium text-black mt-2">Placed: {formatDate(selectedOrder.createdAt)}</p>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-extrabold text-black text-[18px] leading-tight">{selectedOrder.customerName}</p>
                        {selectedOrder.orderId && (
                          <span className="font-mono text-[11px] font-bold text-[#364F9F] bg-[#EEF1F9] px-2 py-0.5 rounded-md">{selectedOrder.orderId}</span>
                        )}
                      </div>
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
                    const subtotal = Number(selectedOrder.subtotal) > 0 ? Number(selectedOrder.subtotal) : orderTotal(selectedOrder.items);
                    const totalDiscount = Number(selectedOrder.discount) || 0;
                    const extraDiscountAmt = Number(selectedOrder.extraDiscount) || 0;
                    const couponOnlyDiscount = Math.max(0, totalDiscount - extraDiscountAmt);
                    const slot = Number(selectedOrder.slotCharge) || 0;
                    const instant = Number(selectedOrder.instantDeliveryCharge) || 0;
                    const grand = effectiveOrderTotal(selectedOrder);
                    // Use stored deliveryCharge; if absent, infer from the gap in the total
                    const storedDelivery = Number(selectedOrder.deliveryCharge) || 0;
                    const delivery = storedDelivery || Math.max(0, grand - Math.max(0, subtotal - totalDiscount + slot + instant));
                    const pays: any[] = Array.isArray(selectedOrder.payments) ? selectedOrder.payments : [];
                    const walletPay = pays.find((p: any) => String(p?.mode || "").toLowerCase() === "wallet");
                    const walletUsed = walletPay ? Number(walletPay.amount) || 0 : 0;
                    return (
                      <div className="mt-5 pt-4 border-t border-gray-100 space-y-2.5">
                        <div className="flex justify-between text-sm font-semibold text-black">
                          <span>Subtotal</span>
                          <span>{formatRupees(subtotal)}</span>
                        </div>
                        {couponOnlyDiscount > 0 && (
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-emerald-600">Coupon{selectedOrder.couponCode ? ` (${selectedOrder.couponCode})` : ""}</span>
                            <span className="text-emerald-600">− {formatRupees(couponOnlyDiscount)}</span>
                          </div>
                        )}
                        {extraDiscountAmt > 0 && (
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-emerald-600">Extra discount</span>
                            <span className="text-emerald-600">− {formatRupees(extraDiscountAmt)}</span>
                          </div>
                        )}
                        {slot > 0 && (
                          <div className="flex justify-between text-sm font-semibold text-black">
                            <span>Slot charge</span>
                            <span>+ {formatRupees(slot)}</span>
                          </div>
                        )}
                        {delivery > 0 && (
                          <div className="flex justify-between text-sm font-semibold text-orange-600">
                            <span>Delivery charge</span>
                            <span>+ {formatRupees(delivery)}</span>
                          </div>
                        )}
                        {instant > 0 && (
                          <div className="flex justify-between text-sm font-semibold text-orange-600">
                            <span>Instant delivery</span>
                            <span>+ {formatRupees(instant)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                          <span className="font-extrabold text-black text-base">Grand Total</span>
                          <span className="font-extrabold text-[#F05B4E] text-xl">{formatRupees(grand)}</span>
                        </div>
                        {walletUsed > 0 && (
                          <div className="flex justify-between text-sm font-semibold text-[#364F9F]">
                            <span>Wallet applied</span>
                            <span>− {formatRupees(walletUsed)}</span>
                          </div>
                        )}
                        {walletUsed > 0 && (
                          <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-200">
                            <span className="text-sm font-bold text-black">Amount due (cash/UPI)</span>
                            <span className="text-sm font-extrabold text-black">{formatRupees(Math.max(0, grand - walletUsed))}</span>
                          </div>
                        )}
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
                      <p className="text-xs font-bold tracking-wider text-black mb-1">DELIVERY DATE</p>
                      <p className="font-bold text-black">{formatDeliveryDate(selectedOrder.deliveryDate) || formatDate(selectedOrder.createdAt)}</p>
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
                      // "Next day" orders (deliveryDate is exactly tomorrow) cannot be
                      // dispatched or marked delivered until the delivery day arrives.
                      // Past-dated orders are treated as current and have no restriction.
                      const isOtherDay = !!(
                        selectedOrder.deliveryDate &&
                        selectedOrder.deliveryDate !== "" &&
                        selectedOrder.deliveryDate === getTomorrowIST()
                      );
                      const otherDayBlocked = new Set(["out_for_delivery", "delivered"]);
                      const statusOptions = isTakeaway
                        ? ["takeaway", "cancelled"]
                        : ALL_STATUSES.filter((s) => s !== "takeaway" && !(isOtherDay && otherDayBlocked.has(s)));
                      const blocked = requiresAssignee(editStatus) || (isOtherDay && otherDayBlocked.has(editStatus));
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
                          {isOtherDay && (
                            <p className="text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5">
                              This order is scheduled for <strong>{selectedOrder.deliveryDate}</strong>. Out for Delivery and Delivered are only available on the delivery day.
                            </p>
                          )}
                          {!isOtherDay && blocked && (
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
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: "unpaid", label: "Unpaid", color: "amber" },
                      { v: "paid", label: "Fully Paid", color: "emerald" },
                    ] as const).map((opt) => {
                      const active = deliverPayStatus === opt.v;
                      const colorMap: Record<string, string> = {
                        amber: active ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 text-gray-500 hover:bg-gray-50",
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
                                { mode: "cash", amount: String(remainingDue), reference: "" },
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
                              amount: "",
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
                        <span>New due: <span className="font-semibold text-emerald-600">{formatRupees(0)}</span></span>
                      </div>
                    </div>
                    {(() => {
                      const adj = deliverPayPaidTotal - remainingDue;
                      if (adj === 0) return null;
                      return (
                        <div className={`mt-2 px-3 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 ${adj > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          <span>{adj > 0 ? "+" : "−"}</span>
                          <span>₹{Math.abs(adj).toFixed(0)}</span>
                          <span className="font-normal">{adj > 0 ? "will be credited to customer wallet" : "will be debited from customer wallet"}</span>
                        </div>
                      );
                    })()}
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
