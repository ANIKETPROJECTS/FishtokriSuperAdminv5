import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Download, Package, ChevronDown, ChevronRight,
  Printer, X, Search, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import { printHtmlWithQZ } from "@/lib/qz-print";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const POPPINS = { fontFamily: "Poppins, sans-serif" };

function getToken() { return localStorage.getItem("fishtokri_token") || ""; }
function getAdmin() {
  try { return JSON.parse(localStorage.getItem("fishtokri_admin") || "null"); } catch { return null; }
}
async function apiFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return res.json();
}

function today() { return new Date().toISOString().slice(0, 10); }

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatRupees(n: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function formatTime12(t: string): string {
  const str = String(t).trim();
  // If the string already has an AM/PM suffix (12-hour format), parse and re-format it.
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    const h = parseInt(ampmMatch[1], 10) % 12 || 12;
    return `${h}:${ampmMatch[2]} ${ampmMatch[3].toUpperCase()}`;
  }
  // Otherwise treat as 24-hour format.
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (!match) return str;
  let h = parseInt(match[1], 10);
  const min = match[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}
function formatTimeSlot(o: any): string | null {
  if (o?.timeslotStart && o?.timeslotEnd) return `${formatTime12(o.timeslotStart)} to ${formatTime12(o.timeslotEnd)}`;
  if (o?.timeslotLabel) { const m = String(o.timeslotLabel).match(/\(([^)]+)\)/); return m ? m[1] : o.timeslotLabel; }
  return null;
}
function orderItemsTotal(items: any[]) {
  return (items ?? []).reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
}
function effectiveTotal(o: any): number {
  const saved = Number(o?.total); if (saved > 0) return saved;
  const sub = orderItemsTotal(Array.isArray(o?.items) ? o.items : []);
  return Math.max(0, sub - (Number(o?.discount) || 0) + (Number(o?.slotCharge) || 0));
}
function numberToWords(n: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function h(x: number): string {
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? " "+ones[x%10] : "");
    if (x < 1000) return ones[Math.floor(x/100)]+" Hundred"+(x%100 ? " "+h(x%100) : "");
    if (x < 100000) return h(Math.floor(x/1000))+" Thousand"+(x%1000 ? " "+h(x%1000) : "");
    if (x < 10000000) return h(Math.floor(x/100000))+" Lakh"+(x%100000 ? " "+h(x%100000) : "");
    return h(Math.floor(x/10000000))+" Crore"+(x%10000000 ? " "+h(x%10000000) : "");
  }
  const int = Math.floor(Math.abs(n)), dec = Math.round((Math.abs(n)-int)*100);
  if (int === 0 && dec === 0) return "Zero Rupees";
  let r = int > 0 ? h(int)+" Rupees" : "";
  if (dec > 0) r += (r ? " and " : "")+h(dec)+" Paise";
  return r;
}

function paymentBadgeStyle(status: string): React.CSSProperties {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return { background: "#16a34a", color: "#fff" };
  if (s === "partial") return { background: "#d97706", color: "#fff" };
  if (s === "unpaid") return { background: "#dc2626", color: "#fff" };
  return { background: "#6b7280", color: "#fff" };
}
function orderStatusBadgeStyle(status: string): React.CSSProperties {
  const s = String(status || "").toLowerCase();
  if (s === "delivered") return { background: "#16a34a", color: "#fff" };
  if (s === "cancelled") return { background: "#dc2626", color: "#fff" };
  if (s === "out_for_delivery") return { background: "#2563eb", color: "#fff" };
  if (s === "confirmed") return { background: "#7c3aed", color: "#fff" };
  if (s === "pending") return { background: "#d97706", color: "#fff" };
  if (s === "takeaway") return { background: "#ea580c", color: "#fff" };
  return { background: "#6b7280", color: "#fff" };
}

// ── Invoice Modal (self-contained) ───────────────────────────────────────────
function InvoiceModal({ order, onClose }: { order: any; onClose: () => void }) {
  const { toast } = useToast();
  const items: any[] = order.items ?? [];
  const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : orderItemsTotal(items);
  const totalQty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
  const discount = Number(order.discount) || 0;
  const slotCharge = Number(order.slotCharge) || 0;
  const deliveryCharge = Number(order.deliveryCharge) || 0;
  const grandTotal = effectiveTotal(order);
  const extraDiscAmt = Number(order.extraDiscount) || 0;
  const couponAmt = Math.max(0, discount - extraDiscAmt);
  const extraDiscType: string = order.extraDiscountType || "flat";
  const paidAmt = Number(order.paidAmount) || 0;
  const dueAmt = Number(order.dueAmount) || Math.max(0, grandTotal - paidAmt);
  const invPays: any[] = Array.isArray(order.payments) ? order.payments : [];
  const walletAmt = (() => { const w = invPays.find((p: any) => String(p?.mode||"").toLowerCase()==="wallet"); return w ? Number(w.amount)||0 : 0; })();
  const invoiceNo = order.orderId || order.invoiceNo || ("INV-"+String(order._id||order.id||"").slice(-6).toUpperCase());
  const d = new Date(order.createdAt ?? Date.now());
  const deliveryDateStr = (() => {
    const s = String(order.deliveryDate ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y,m,day] = s.split("-"); return `${day}-${m}-${y}`; }
    return [String(d.getDate()).padStart(2,"0"),String(d.getMonth()+1).padStart(2,"0"),d.getFullYear()].join("-");
  })();
  const timeStr = d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true });
  const payMode = order.paymentMode || (invPays.length>0 ? [...new Set(invPays.map((p:any)=>p.method))].join(", ") : "Cash");
  const payStatusNorm = String(order.paymentStatus || "").toLowerCase();
  const payLabel = payStatusNorm==="paid" ? "Paid" : payStatusNorm==="partial" ? "Partial" : "Unpaid";
  const payStatusColor = payStatusNorm==="paid" ? "#15803d" : payStatusNorm==="partial" ? "#b45309" : "#b91c1c";
  const payStatusBg = payStatusNorm==="paid" ? "#f0fdf4" : payStatusNorm==="partial" ? "#fffbeb" : "#fef2f2";

  const handlePrint = async () => {
    const itemRows = items.map((it:any) => {
      const qty = Number(it.quantity)||1, rate = Number(it.price)||0;
      return `<tr><td style="padding:5px 4px;border-bottom:1px solid #eee;">${it.name}</td><td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;">${qty}${it.unit?` ${it.unit}`:""}</td><td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;">${rate.toFixed(2)}</td><td style="padding:5px 4px;border-bottom:1px solid #eee;text-align:right;">${(qty*rate).toFixed(2)}</td></tr>`;
    }).join("");
    const slotRow = slotCharge>0 ? `<tr><td style="padding:4px 2px;" colspan="3">Slot Charge :</td><td style="padding:4px 2px;text-align:right;">+ ${slotCharge.toFixed(2)}</td></tr>` : "";
    const delivRow = deliveryCharge>0 ? `<tr><td style="padding:4px 2px;" colspan="3">${order.isExpress ? "Porter Charge" : "Delivery Charge"} :</td><td style="padding:4px 2px;text-align:right;">+ ${deliveryCharge.toFixed(2)}</td></tr>` : "";
    const discountRows = [
      couponAmt > 0 ? `<tr><td style="padding:4px 2px;" colspan="3">Coupon${order.couponCode ? ` (${order.couponCode})` : ""} :</td><td style="padding:4px 2px;text-align:right;">- ${couponAmt.toFixed(2)}</td></tr>` : "",
      extraDiscAmt > 0 ? `<tr><td style="padding:4px 2px;" colspan="3">Extra discount${extraDiscType === "percentage" ? " (%)" : ""} :</td><td style="padding:4px 2px;text-align:right;">- ${extraDiscAmt.toFixed(2)}</td></tr>` : "",
      couponAmt === 0 && extraDiscAmt === 0 && discount > 0 ? `<tr><td style="padding:4px 2px;" colspan="3">Discount :</td><td style="padding:4px 2px;text-align:right;">- ${discount.toFixed(2)}</td></tr>` : "",
    ].join("");
    const walletRow = walletAmt>0 ? `<div style="display:flex;justify-content:space-between;margin:4px 0;font-size:13px;"><span>Wallet Applied:</span><span>− ${walletAmt.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;margin:4px 0;font-size:14px;font-weight:700;"><span>Balance Due:</span><span>${Math.max(0,grandTotal-walletAmt).toFixed(2)}</span></div>` : "";
    const paidDueRow = (order.paidAmount!==undefined||order.dueAmount!==undefined) ? `<div style="display:flex;justify-content:space-between;margin:8px 0 0;font-size:12px;"><span>Paid: <strong style="color:#16a34a;">₹${paidAmt.toFixed(2)}</strong></span><span>Due: <strong style="color:${dueAmt>0?"#ef4444":"#16a34a"};">₹${dueAmt.toFixed(2)}</strong></span></div>` : "";
    const notesRow = order.notes ? `<div style="border-top:1px dashed #bbb;margin:10px 0;"></div><div style="font-size:12px;"><b>Note:</b> ${order.notes}</div>` : "";
    const slotLabel = order.isExpress ? "Express order by Porter" : formatTimeSlot(order);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${invoiceNo}</title><style>* { margin:0;padding:0;box-sizing:border-box; } body { font-family:Arial,sans-serif;color:#111;background:#fff; } @page { size:80mm auto;margin:0; }</style></head><body><div style="padding:4px 8px;font-size:13px;color:#111;"><h2 style="text-align:center;font-size:16px;font-weight:700;margin-bottom:2px;">Atha Foods (Fishtokri)${order.subHubName?` - ${order.subHubName}`:""}</h2><div style="border-top:1px dashed #999;margin:8px 0;"></div><div style="text-align:center;font-size:12px;color:#555;margin-bottom:8px;">Mobile No: ${order.phone||"—"}</div><div style="display:flex;justify-content:space-between;margin:3px 0;font-size:12px;"><span><b>Invoice No:</b> ${invoiceNo}</span><span><b>Date:</b> ${deliveryDateStr}</span></div><div style="display:flex;justify-content:space-between;align-items:center;margin:3px 0;font-size:12px;"><span><b>Payment Mode:</b> ${payMode} <span style="margin-left:5px;font-size:10px;font-weight:700;text-transform:uppercase;padding:1px 6px;border-radius:20px;border:1px solid ${payStatusColor};color:${payStatusColor};background:${payStatusBg};">${payLabel}</span></span><span><b>Time:</b> ${timeStr}</span></div><div style="border-top:1px dashed #999;margin:8px 0;"></div><div style="font-size:12px;margin:2px 0;"><b>Name:</b> ${order.customerName}</div>${order.address?`<div style="font-size:12px;margin:2px 0;"><b>Add :</b> ${order.address}</div>`:""} ${slotLabel?`<div style="font-size:12px;margin:2px 0;"><b>Delivery Slot:</b> ${slotLabel}</div>`:""}<div style="border-top:1px dashed #999;margin:8px 0;"></div><table style="width:100%;border-collapse:collapse;font-size:12px;margin:4px 0;"><thead><tr style="border-bottom:1px solid #555;"><th style="padding:5px 4px;text-align:left;font-weight:600;">Item</th><th style="padding:5px 4px;text-align:right;font-weight:600;">Qty</th><th style="padding:5px 4px;text-align:right;font-weight:600;">Rate</th><th style="padding:5px 4px;text-align:right;font-weight:600;">Amt</th></tr></thead><tbody>${itemRows}</tbody></table><div style="border-top:1px dashed #999;margin:8px 0;"></div><table style="width:100%;font-size:12px;"><tr><td colspan="3"><b>Total Items: ${items.length}</b></td><td style="text-align:right;"><b>${subtotal.toFixed(2)}</b></td></tr>${discountRows}${slotRow}${delivRow}</table><div style="border-top:1px dashed #999;margin:8px 0;"></div><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;"><span>Grand Total:</span><span>${grandTotal.toFixed(2)}</span></div>${walletRow}<div style="text-align:center;font-size:11px;color:#555;margin-top:4px;">( ${numberToWords(grandTotal)} )</div>${paidDueRow}${notesRow}<div style="text-align:center;font-size:12px;color:#555;margin-top:12px;">Thank you for your business!<br/>For any query - 9220200100</div></div></body></html>`;
    toast({ title: "Printing..." });
    const qzResult = await printHtmlWithQZ(html);
    if (qzResult.success) return;
    toast({ title: "Print failed, opening dialog...", variant: "destructive" });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" style={POPPINS}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-black">Voucher Preview — {invoiceNo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 bg-gray-50">
          <div className="bg-white max-w-md mx-auto p-5 text-[13px] text-gray-800 shadow-sm border border-gray-200 rounded" style={POPPINS}>
            <h3 className="text-center font-bold text-[15px] mb-1">Atha Foods (Fishtokri){order.subHubName ? ` - ${order.subHubName}` : ""}</h3>
            <div className="border-t border-dashed border-gray-400 my-2" />
            <div className="text-center text-[12px]">Mobile No: {order.phone || "—"}</div>
            <div className="flex justify-between mt-2 text-[12px]">
              <span><b>Invoice No:</b> {invoiceNo}</span>
              <span><b>Date:</b> {deliveryDateStr}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span><b>Payment Mode:</b> {payMode}
                <span className={`ml-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${payStatusNorm==="paid" ? "text-green-700 bg-green-50 border-green-200" : payStatusNorm==="partial" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200"}`}>{payLabel}</span>
              </span>
              <span><b>Time:</b> {timeStr}</span>
            </div>
            <div className="border-t border-dashed border-gray-400 my-2" />
            <div className="text-[12px]"><b>Name:</b> {order.customerName}</div>
            {order.address && <div className="text-[12px]"><b>Add :</b> {order.address}</div>}
            {(order.isExpress || formatTimeSlot(order)) && <div className="text-[12px]"><b>Delivery Slot:</b> {order.isExpress ? "Express order by Porter" : formatTimeSlot(order)}</div>}
            <div className="border-t border-dashed border-gray-400 my-2" />
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it:any,i:number)=>{const qty=Number(it.quantity)||1,rate=Number(it.price)||0;return(<tr key={i}><td className="py-1">{it.name}</td><td className="py-1 text-right">{qty}{it.unit?` ${it.unit}`:""}</td><td className="py-1 text-right">{rate.toFixed(2)}</td><td className="py-1 text-right">{(qty*rate).toFixed(2)}</td></tr>);})}
                <tr className="border-t border-gray-400"><td className="py-1"><b>Total Items: {items.length}</b></td><td className="py-1 text-right"><b>{totalQty}</b></td><td/><td className="py-1 text-right"><b>{subtotal.toFixed(2)}</b></td></tr>
                {couponAmt > 0 && <tr><td className="py-1" colSpan={3}>Coupon{order.couponCode ? ` (${order.couponCode})` : ""} :</td><td className="py-1 text-right">- {couponAmt.toFixed(2)}</td></tr>}
                {extraDiscAmt > 0 && <tr><td className="py-1" colSpan={3}>Extra discount{extraDiscType === "percentage" ? " (%)" : ""} :</td><td className="py-1 text-right">- {extraDiscAmt.toFixed(2)}</td></tr>}
                {couponAmt === 0 && extraDiscAmt === 0 && discount > 0 && <tr><td className="py-1" colSpan={3}>Discount :</td><td className="py-1 text-right">- {discount.toFixed(2)}</td></tr>}
                {slotCharge>0&&<tr><td className="py-1" colSpan={3}>Slot Charge :</td><td className="py-1 text-right">+ {slotCharge.toFixed(2)}</td></tr>}
                {deliveryCharge>0&&<tr><td className="py-1" colSpan={3}>{order.isExpress ? "Porter Charge" : "Delivery Charge"} :</td><td className="py-1 text-right">+ {deliveryCharge.toFixed(2)}</td></tr>}
              </tbody>
            </table>
            <div className="border-t border-dashed border-gray-400 my-2" />
            <div className="flex justify-between text-[15px] font-bold"><span>Grand Total:</span><span>{grandTotal.toFixed(2)}</span></div>
            {walletAmt>0&&<><div className="flex justify-between text-[13px] mt-1"><span>Wallet Applied:</span><span>− {walletAmt.toFixed(2)}</span></div><div className="flex justify-between text-[14px] font-bold mt-0.5"><span>Balance Due (Cash/UPI):</span><span>{Math.max(0,grandTotal-walletAmt).toFixed(2)}</span></div></>}
            <div className="text-center text-[11px] text-gray-600 mt-1">( {numberToWords(grandTotal)} )</div>
            {(order.paidAmount!==undefined||order.dueAmount!==undefined)&&<div className="flex justify-between text-[12px] mt-2"><span>Paid: <strong className="text-green-600">{formatRupees(paidAmt)}</strong></span><span>Due: <strong className={dueAmt>0?"text-red-500":"text-green-600"}>{formatRupees(dueAmt)}</strong></span></div>}
            {order.notes&&<><div className="border-t border-dashed border-gray-400 my-2"/><div className="text-[12px]"><b>Note:</b> {order.notes}</div></>}
            <div className="text-center text-[12px] text-gray-600 mt-3">Thank you for your business!<br/>For any query - 9220200100</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-white">
          <Button variant="outline" onClick={onClose} className="h-9" style={POPPINS}>Close</Button>
          <Button onClick={handlePrint} className="h-9 gap-1.5 bg-[#1A56DB] hover:bg-[#1447B4] text-white" style={POPPINS}>
            <Printer className="w-3.5 h-3.5" /> Print Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ORDERS REPORT ─────────────────────────────────────────────────────────────
function OrdersReport({ from, to, onDownload, downloadRef }: { from: string; to: string; onDownload: (fn: () => void) => void; downloadRef: any }) {
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);
  const [ordSearch, setOrdSearch] = useState("");
  const [ordPayFilter, setOrdPayFilter] = useState<"all" | "paid" | "partial" | "unpaid">("all");
  const [ordStatusFilter, setOrdStatusFilter] = useState<"all" | "confirmed" | "out_for_delivery" | "delivered" | "cancelled">("all");
  const [ordSort, setOrdSort] = useState<"default" | "total_desc" | "total_asc" | "customer_az" | "invoice_az">("default");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["day-end-orders", from, to],
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      return apiFetch(`/api/reports/day-end/orders?${p}`);
    },
  });

  const orders: any[] = data?.orders ?? [];

  const filteredOrders = useMemo(() => {
    let list = [...orders];
    const q = ordSearch.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      list = list.filter(o => {
        const invoiceRaw = String(o.invoiceNo || o.orderId || "").toLowerCase();
        const invoiceNoHash = invoiceRaw.startsWith("#") ? invoiceRaw.slice(1) : invoiceRaw;
        const haystack = [
          o.customerName || "",
          o.phone || "",
          invoiceRaw,
          invoiceNoHash,
          o.deliveryPerson || "",
          o.itemsSummary || "",
        ].join(" ").toLowerCase();
        return words.every(word => haystack.includes(word));
      });
    }
    if (ordPayFilter !== "all") list = list.filter(o => String(o.paymentStatus || "").toLowerCase() === ordPayFilter);
    if (ordStatusFilter !== "all") list = list.filter(o => String(o.status || "").toLowerCase() === ordStatusFilter);
    if (ordSort === "total_desc") list.sort((a, b) => (b.total || 0) - (a.total || 0));
    else if (ordSort === "total_asc") list.sort((a, b) => (a.total || 0) - (b.total || 0));
    else if (ordSort === "customer_az") list.sort((a, b) => (a.customerName || "").localeCompare(b.customerName || ""));
    else if (ordSort === "invoice_az") list.sort((a, b) => (a.invoiceNo || "").localeCompare(b.invoiceNo || ""));
    return list;
  }, [orders, ordSearch, ordPayFilter, ordStatusFilter, ordSort]);

  const stats = useMemo(() => {
    let cash = 0, upi = 0, wallet = 0, other = 0, unpaid = 0;
    for (const o of orders) {
      if (String(o.orderStatus || o.status || "").toLowerCase() === "cancelled") continue;
      const total = o.total || 0;

      const statusLower = String(o.paymentStatus || "").toLowerCase();
      const isUnpaid = statusLower === "unpaid";
      const isPartial = statusLower === "partial";

      // Accumulate unpaid dues
      if (isUnpaid || isPartial) {
        if (o.dueAmount != null && Number(o.dueAmount) >= 0) {
          unpaid += Number(o.dueAmount);
        } else if (o.paidAmount != null) {
          unpaid += Math.max(0, total - Number(o.paidAmount));
        } else if (isUnpaid) {
          unpaid += total;
        }
      }

      // For fully unpaid orders there's nothing actually collected — skip revenue split
      if (isUnpaid) continue;

      const pays: any[] = Array.isArray(o.payments) ? o.payments : [];
      if (pays.length > 0) {
        // Use per-payment-entry amounts (most accurate)
        let nonWalletPaid = 0;
        for (const p of pays) {
          const mode = String(p?.mode || "").toLowerCase();
          const amt = Number(p?.amount) || 0;
          if (mode === "cash" || mode === "cod") { cash += amt; nonWalletPaid += amt; }
          else if (mode === "upi") { upi += amt; nonWalletPaid += amt; }
          else if (mode === "wallet") wallet += amt;
          else { other += amt; nonWalletPaid += amt; }
        }
        // Excess collected beyond order total → credited to customer wallet
        const excessToWallet = Math.max(0, nonWalletPaid - (Number(o.total) || 0));
        wallet += excessToWallet;
      } else {
        // Fallback: split by paymentMode string for partial/paid orders
        const paidAmt = isPartial
          ? (o.paidAmount != null ? Number(o.paidAmount) : Math.max(0, total - unpaid))
          : total;
        const mode = String(o.paymentMode || "").toLowerCase();
        if (mode === "cash" || mode === "cod") cash += paidAmt;
        else if (mode === "upi") upi += paidAmt;
        else if (mode === "wallet") wallet += paidAmt;
        else other += paidAmt;
      }
    }
    // Total Revenue = actual collected amounts (cash + upi + other non-wallet modes)
    const totalRev = cash + upi + other;
    return { cash, upi, wallet, totalRev, unpaid };
  }, [orders]);

  const handleDownload = useCallback(() => {
    if (!orders.length) return;
    const rows: any[] = [["Invoice No","Order Placed","Delivery Date","Customer","Phone","Items & Qty","Total (₹)","Delivery Partner","Payment Mode","Payment Status","Order Status"]];
    for (const o of orders) {
      const itemsQty = (o.items || []).map((it: any) => `${it.name} × ${it.quantity}`).join(", ");
      const placedDate = o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
      const delivDate = o.deliveryDate ? formatDate(o.deliveryDate) : "—";
      rows.push([o.invoiceNo, placedDate, delivDate, o.customerName, o.phone, itemsQty, o.total, o.deliveryPerson || "—", o.paymentMode, o.paymentStatus, String(o.status || "").replace(/_/g, " ")]);
    }
    rows.push([]);
    rows.push(["SUMMARY", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Total Orders", orders.length]);
    rows.push(["Cash Revenue", stats.cash]);
    rows.push(["UPI Revenue", stats.upi]);
    rows.push(["Total Revenue", stats.totalRev]);
    rows.push(["Wallet Collected", stats.wallet]);
    rows.push(["Unpaid Dues", stats.unpaid]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:20},{wch:22},{wch:14},{wch:48},{wch:14},{wch:22},{wch:14},{wch:16},{wch:16}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders Report");
    XLSX.writeFile(wb, `orders-report-${from}-to-${to}.xlsx`);
  }, [orders, stats, from, to]);

  downloadRef.current = handleDownload;

  return (
    <div style={POPPINS}>
      {/* Stats strip */}
      <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 14, border: "1px solid #ebebeb", marginBottom: 20, overflow: "hidden" }}>
        {[
          { label: "Total Orders", value: String(orders.length) },
          { label: "Cash Revenue", value: formatRupees(stats.cash) },
          { label: "UPI Revenue", value: formatRupees(stats.upi) },
          { label: "Total Revenue", value: formatRupees(stats.totalRev) },
          { label: "Wallet Collected", value: formatRupees(stats.wallet) },
          { label: "Unpaid Dues", value: formatRupees(stats.unpaid) },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ flex: 1, padding: "16px 18px", borderRight: i < arr.length - 1 ? "1px solid #ebebeb" : "none" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{s.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: i === 5 ? "#dc2626" : "#000", lineHeight: 1.1 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {isLoading && <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: 14 }}>Loading orders…</div>}
      {isError && <div style={{ textAlign: "center", padding: "60px 0", color: "#ef4444", fontSize: 14 }}>Failed to load. Please try again.</div>}
      {!isLoading && !isError && orders.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa" }}>
          <Package style={{ width: 40, height: 40, margin: "0 auto 10px", opacity: 0.3 }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>No orders found for this period</p>
        </div>
      )}

      {/* Search / Filter / Sort toolbar */}
      {!isLoading && !isError && orders.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#aaa", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search customer, phone, invoice…"
              value={ordSearch}
              onChange={e => setOrdSearch(e.target.value)}
              style={{ paddingLeft: 28, paddingRight: 10, height: 32, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "Poppins, sans-serif", color: "#000", background: "#fff", width: 230, outline: "none" }}
            />
          </div>

          {/* Payment status pills */}
          <div style={{ display: "flex", gap: 4 }}>
            {([
              ["all", "All Pay"],
              ["paid", "Paid"],
              ["partial", "Partial"],
              ["unpaid", "Unpaid"],
            ] as [typeof ordPayFilter, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setOrdPayFilter(val)} style={{
                height: 32, padding: "0 12px", borderRadius: 20, border: "1px solid",
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap",
                background: ordPayFilter === val ? (val === "paid" ? "#16a34a" : val === "partial" ? "#d97706" : val === "unpaid" ? "#dc2626" : "#364F9F") : "#f3f4f6",
                color: ordPayFilter === val ? "#fff" : "#555",
                borderColor: ordPayFilter === val ? "transparent" : "#e5e7eb",
              }}>{label}</button>
            ))}
          </div>

          {/* Order status pills */}
          <div style={{ display: "flex", gap: 4 }}>
            {([
              ["all", "All Status"],
              ["confirmed", "Confirmed"],
              ["out_for_delivery", "Out for Delivery"],
              ["delivered", "Delivered"],
              ["cancelled", "Cancelled"],
            ] as [typeof ordStatusFilter, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setOrdStatusFilter(val)} style={{
                height: 32, padding: "0 12px", borderRadius: 20, border: "1px solid",
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap",
                background: ordStatusFilter === val ? (val === "delivered" ? "#16a34a" : val === "cancelled" ? "#dc2626" : val === "out_for_delivery" ? "#2563eb" : val === "confirmed" ? "#7c3aed" : "#364F9F") : "#f3f4f6",
                color: ordStatusFilter === val ? "#fff" : "#555",
                borderColor: ordStatusFilter === val ? "transparent" : "#e5e7eb",
              }}>{label}</button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <ArrowUpDown style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "#aaa", pointerEvents: "none" }} />
            <select value={ordSort} onChange={e => setOrdSort(e.target.value as typeof ordSort)}
              style={{ paddingLeft: 26, paddingRight: 10, height: 32, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "Poppins, sans-serif", color: "#000", background: "#fff", cursor: "pointer", outline: "none" }}>
              <option value="default">Sort: Default</option>
              <option value="total_desc">Total: High → Low</option>
              <option value="total_asc">Total: Low → High</option>
              <option value="customer_az">Customer A → Z</option>
              <option value="invoice_az">Invoice A → Z</option>
            </select>
          </div>

          {/* Count */}
          <span style={{ fontSize: 11, color: "#888", fontFamily: "Poppins, sans-serif", marginLeft: "auto" }}>
            Showing <strong style={{ color: "#000" }}>{filteredOrders.length}</strong> of {orders.length} orders
          </span>
        </div>
      )}

      {/* No-results message when search/filter returns nothing */}
      {!isLoading && !isError && orders.length > 0 && filteredOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>
          <Package style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, fontWeight: 500 }}>No orders match your search or filter</p>
        </div>
      )}

      {/* Table — no wrapper card, full width */}
      {!isLoading && !isError && filteredOrders.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Invoice No","Order Placed","Delivery Date","Customer","Phone","Items & Qty","Total","Delivery Partner","Payment Mode","Payment Status","Order Status","Receipt"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#364F9F", background: "#eff3ff", padding: "2px 8px", borderRadius: 6 }}>{o.invoiceNo}</span>
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#444", fontSize: 12 }}>
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#444", fontSize: 12 }}>
                    {o.deliveryDate ? formatDate(o.deliveryDate) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#000", whiteSpace: "nowrap" }}>{o.customerName}</td>
                  <td style={{ padding: "10px 14px", color: "#444", whiteSpace: "nowrap" }}>{o.phone}</td>
                  <td style={{ padding: "10px 14px", minWidth: 140 }}>
                    {(o.items || []).map((it: any, j: number) => (
                      <div key={j} style={{ fontSize: 12, color: "#222" }}>
                        <span style={{ fontWeight: 600 }}>{it.name}</span>
                        <span style={{ color: "#888" }}> × {it.quantity}</span>
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "#000", whiteSpace: "nowrap", textAlign: "right" }}>{formatRupees(o.total)}</td>
                  <td style={{ padding: "10px 14px", color: "#444", whiteSpace: "nowrap" }}>{o.deliveryPerson}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: "#000", whiteSpace: "nowrap" }}>{o.paymentMode}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, ...paymentBadgeStyle(o.paymentStatus) }}>
                      {o.paymentStatus}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, textTransform: "capitalize", ...orderStatusBadgeStyle(o.status) }}>
                      {String(o.status || "").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => setInvoiceOrder(o)}
                      title="View Receipt"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <img src="/receipt-icon.png" alt="View Receipt" style={{ width: 28, height: 28, objectFit: "contain" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoiceOrder && <InvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />}
    </div>
  );
}

// ── INVENTORY REPORT ──────────────────────────────────────────────────────────
function InventoryReport({ firstSubHubId, onDownload, downloadRef, expandAllRef, collapseAllRef, onHasProducts }: { firstSubHubId: string; onDownload: (fn: () => void) => void; downloadRef: any; expandAllRef: any; collapseAllRef: any; onHasProducts: (v: boolean) => void }) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [invSearch, setInvSearch] = useState("");
  const [invStockFilter, setInvStockFilter] = useState<"all" | "in_stock" | "out_of_stock" | "expiring">("all");
  const [invSort, setInvSort] = useState<"default" | "name_az" | "name_za" | "qty_desc" | "qty_asc" | "cat_az">("default");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["day-end-inventory", firstSubHubId],
    queryFn: () => apiFetch(`/api/reports/day-end/inventory?subHubId=${firstSubHubId}`),
    enabled: !!firstSubHubId,
  });

  const products: any[] = data?.products ?? [];
  const grandTotal = useMemo(() => products.reduce((s, p) => s + p.totalQuantity, 0), [products]);

  const filteredProducts = useMemo(() => {
    let list = [...products];
    const q = invSearch.trim().toLowerCase();
    if (q) list = list.filter(p => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
    if (invStockFilter === "in_stock") list = list.filter(p => p.activeQuantity > 0);
    else if (invStockFilter === "out_of_stock") list = list.filter(p => p.activeQuantity === 0);
    else if (invStockFilter === "expiring") list = list.filter(p => p.batches?.some((b: any) => !b.isExpired && b.daysLeft !== null && b.daysLeft <= 1));
    if (invSort === "name_az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (invSort === "name_za") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (invSort === "qty_desc") list.sort((a, b) => b.totalQuantity - a.totalQuantity);
    else if (invSort === "qty_asc") list.sort((a, b) => a.totalQuantity - b.totalQuantity);
    else if (invSort === "cat_az") list.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
    return list;
  }, [products, invSearch, invStockFilter, invSort]);

  const toggleProduct = (id: string) => setExpandedProducts(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const expandAll = () => setExpandedProducts(new Set(filteredProducts.map(p => p.productId)));
  const collapseAll = () => setExpandedProducts(new Set());

  // Expose expand/collapse to parent portal
  expandAllRef.current = expandAll;
  collapseAllRef.current = collapseAll;

  useEffect(() => { onHasProducts(products.length > 0); }, [products.length]);

  const handleDownload = useCallback(() => {
    if (!products.length) return;
    const rows: any[] = [["Product Name","Category","Unit","Price (₹)","Batch No.","Batch Qty","Received Date","Expiry Date","Shelf Life (Days)","Days Left","Status","Notes","","Product Total Qty"]];
    for (const p of products) {
      const batches: any[] = p.batches ?? [];
      if (!batches.length) { rows.push([p.name,p.category,p.unit,p.price,"—",0,"—","—","—","—",p.status==="available"?"Available":"Unavailable","—","",p.totalQuantity]); continue; }
      batches.forEach((b, idx) => {
        const daysLeftLabel = b.daysLeft===null?"No Expiry":b.isExpired?`Expired (${Math.abs(b.daysLeft)}d ago)`:`${b.daysLeft}d left`;
        rows.push([idx===0?p.name:"",idx===0?p.category:"",idx===0?p.unit:"",idx===0?p.price:"",b.batchNumber,b.quantity,b.receivedDate||"—",b.expiryDate||"—",b.shelfLifeDays??"—",daysLeftLabel,b.isExpired?"Expired":"Active",b.notes||"—","",idx===batches.length-1?p.totalQuantity:""]);
      });
      rows.push(["","","","","↳ SUBTOTAL",p.totalQuantity,"","","","","","","",""]);
    }
    rows.push([]); rows.push(["GRAND TOTAL (All Products)","","","","",grandTotal]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:28},{wch:18},{wch:12},{wch:10},{wch:16},{wch:10},{wch:14},{wch:14},{wch:16},{wch:16},{wch:12},{wch:22},{wch:2},{wch:16}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
    XLSX.writeFile(wb, `${(data?.subHub?.name||"inventory").replace(/\s+/g,"-")}-inventory-${today()}.xlsx`);
  }, [products, data, grandTotal]);

  downloadRef.current = handleDownload;

  return (
    <div style={POPPINS}>
      {!firstSubHubId && <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: 14 }}>No sub hub linked to your account.</div>}

      {/* Stats strip */}
      {products.length > 0 && (
        <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 14, border: "1px solid #ebebeb", marginBottom: 20, overflow: "hidden" }}>
          {[
            { label: "Total Products", value: String(products.length) },
            { label: "Total Stock", value: grandTotal.toLocaleString("en-IN") },
            { label: "Out of Stock", value: String(products.filter(p => p.activeQuantity === 0).length) },
            { label: "Expiring Soon (≤1d)", value: String(products.filter(p => p.batches.some((b:any) => !b.isExpired && b.daysLeft !== null && b.daysLeft <= 1)).length) },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ flex: 1, padding: "16px 18px", borderRight: i < arr.length - 1 ? "1px solid #ebebeb" : "none" }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{s.label}</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: i === 2 ? "#dc2626" : i === 3 ? "#d97706" : "#000", lineHeight: 1.1 }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {firstSubHubId && isLoading && <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: 14 }}>Loading inventory…</div>}
      {firstSubHubId && isError && <div style={{ textAlign: "center", padding: "60px 0", color: "#ef4444", fontSize: 14 }}>Failed to load. Please try again.</div>}
      {firstSubHubId && !isLoading && !isError && products.length === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: 14 }}>No inventory products found.</div>}

      {/* Search / Filter / Sort toolbar */}
      {firstSubHubId && !isLoading && !isError && products.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#aaa", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search product or category…"
              value={invSearch}
              onChange={e => setInvSearch(e.target.value)}
              style={{ paddingLeft: 28, paddingRight: 10, height: 32, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "Poppins, sans-serif", color: "#000", background: "#fff", width: 220, outline: "none" }}
            />
          </div>

          {/* Stock filter pills */}
          <div style={{ display: "flex", gap: 4 }}>
            {([ ["all","All"], ["in_stock","In Stock"], ["out_of_stock","Out of Stock"], ["expiring","Expiring Soon"] ] as [typeof invStockFilter, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setInvStockFilter(val)}
                style={{
                  height: 32, padding: "0 12px", borderRadius: 20, border: "1px solid",
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif",
                  whiteSpace: "nowrap",
                  background: invStockFilter === val ? (val === "out_of_stock" ? "#dc2626" : val === "expiring" ? "#d97706" : val === "in_stock" ? "#16a34a" : "#364F9F") : "#f3f4f6",
                  color: invStockFilter === val ? "#fff" : "#555",
                  borderColor: invStockFilter === val ? "transparent" : "#e5e7eb",
                }}
              >{label}</button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <ArrowUpDown style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "#aaa", pointerEvents: "none" }} />
            <select
              value={invSort}
              onChange={e => setInvSort(e.target.value as typeof invSort)}
              style={{ paddingLeft: 26, paddingRight: 10, height: 32, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "Poppins, sans-serif", color: "#000", background: "#fff", cursor: "pointer", outline: "none" }}
            >
              <option value="default">Sort: Default</option>
              <option value="name_az">Name A → Z</option>
              <option value="name_za">Name Z → A</option>
              <option value="qty_desc">Qty: High → Low</option>
              <option value="qty_asc">Qty: Low → High</option>
              <option value="cat_az">Category A → Z</option>
            </select>
          </div>

          {/* Results count */}
          <span style={{ fontSize: 11, color: "#888", fontFamily: "Poppins, sans-serif", marginLeft: "auto" }}>
            Showing <strong style={{ color: "#000" }}>{filteredProducts.length}</strong> of {products.length} products
          </span>
        </div>
      )}

      {/* No-results message when search/filter returns nothing */}
      {firstSubHubId && !isLoading && !isError && products.length > 0 && filteredProducts.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>
          <Package style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 13, fontWeight: 500 }}>No products match your search or filter</p>
        </div>
      )}

      {/* Table — no wrapper card, full width */}
      {firstSubHubId && !isLoading && !isError && filteredProducts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ width: 28, padding: "10px 8px" }}></th>
                {["Product Name","Category","Total Qty","Stock Status"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const isExpanded = expandedProducts.has(p.productId);
                const hasBatches = p.batches && p.batches.length > 0;
                const inStock = p.activeQuantity > 0;
                return (
                  <>
                    <tr key={p.productId}
                      style={{ borderBottom: "1px solid #f3f4f6", cursor: hasBatches ? "pointer" : "default", background: "transparent" }}
                      onClick={() => hasBatches && toggleProduct(p.productId)}
                      onMouseEnter={e => hasBatches && (e.currentTarget.style.background = "#f8faff")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 8px", color: "#999" }}>{hasBatches ? (isExpanded ? <ChevronDown style={{width:14,height:14}} /> : <ChevronRight style={{width:14,height:14}} />) : null}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontWeight: 600, color: "#000" }}>{p.name}</span>
                        {hasBatches && <span style={{ marginLeft: 6, fontSize: 11, color: "#888", fontWeight: 400 }}>{p.batches.length} batch{p.batches.length !== 1 ? "es" : ""}</span>}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#444" }}>{p.category}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: 16, color: inStock ? "#000" : "#dc2626" }}>{p.totalQuantity.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: "#fff", background: inStock ? "#16a34a" : "#dc2626" }}>
                          {inStock ? "In Stock" : "Out of Stock"}
                        </span>
                      </td>
                    </tr>

                    {isExpanded && hasBatches && (
                      <>
                        <tr style={{ background: "#eff6ff" }}>
                          <td style={{ padding: "8px 8px" }}></td>
                          {["Batch No.","Batch Qty","Date Added","Expiry Date","Days Left"].map(h => (
                            <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.03em" }}>{h}</th>
                          ))}
                        </tr>
                        {p.batches.map((b: any, bi: number) => (
                          <tr key={bi} style={{ background: "#f5f9ff", borderBottom: "1px solid #dbeafe" }}>
                            <td style={{ padding: "9px 8px" }}></td>
                            <td style={{ padding: "9px 14px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#222" }}>{b.batchNumber || `Batch ${bi+1}`}</span>
                              {b.notes && <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{b.notes}</p>}
                            </td>
                            <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 15, color: b.isExpired ? "#aaa" : "#000" }}>{b.quantity.toLocaleString("en-IN")}</td>
                            <td style={{ padding: "9px 14px", fontSize: 12, color: "#444" }}>{formatDate(b.receivedDate)}</td>
                            <td style={{ padding: "9px 14px", fontSize: 12, color: "#444" }}>{b.expiryDate ? formatDate(b.expiryDate) : <span style={{ color: "#aaa" }}>No Expiry</span>}</td>
                            <td style={{ padding: "9px 14px" }}>
                              {b.daysLeft === null ? <span style={{ color: "#aaa", fontSize: 12 }}>—</span>
                                : b.isExpired ? <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#dc2626", color: "#fff" }}>Expired {Math.abs(b.daysLeft)}d ago</span>
                                : b.daysLeft <= 1 ? <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#d97706", color: "#fff" }}>{b.daysLeft}d left ⚠️</span>
                                : <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#16a34a", color: "#fff" }}>{b.daysLeft}d left</span>}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ background: "#eef2ff", borderBottom: "2px solid #c7d2fe" }}>
                          <td style={{ padding: "9px 8px" }}></td>
                          <td style={{ padding: "9px 14px", fontWeight: 700, color: "#364F9F", fontSize: 13 }} colSpan={1}>↳ {p.name} — Subtotal</td>
                          <td style={{ padding: "9px 14px", fontWeight: 700, color: "#364F9F", fontSize: 15 }}>{p.totalQuantity.toLocaleString("en-IN")}</td>
                          <td colSpan={2} style={{ padding: "9px 14px", fontSize: 12, color: "#666" }}>
                            Active: {p.activeQuantity.toLocaleString("en-IN")}
                            {p.totalQuantity !== p.activeQuantity && <span style={{ marginLeft: 8, color: "#dc2626" }}>({(p.totalQuantity - p.activeQuantity).toLocaleString("en-IN")} expired)</span>}
                          </td>
                        </tr>
                      </>
                    )}
                  </>
                );
              })}
              <tr style={{ background: "#1e3a6e", borderTop: "2px solid #364F9F" }}>
                <td style={{ padding: "14px 8px" }}></td>
                <td style={{ padding: "14px 14px", fontWeight: 700, color: "#fff", fontSize: 14 }} colSpan={2}>
                  {filteredProducts.length < products.length
                    ? `FILTERED TOTAL — ${filteredProducts.length} products`
                    : `OVERALL TOTAL — ${data?.subHub?.name || "All Products"}`}
                </td>
                <td style={{ padding: "14px 14px", fontWeight: 800, fontSize: 22, color: "#fff" }}>
                  {filteredProducts.reduce((s, p) => s + p.totalQuantity, 0).toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "14px 14px" }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
type Tab = "orders" | "inventory";

export default function DayEndReportPage() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [hasInventoryProducts, setHasInventoryProducts] = useState(false);
  const ordersDownloadRef = { current: null as (() => void) | null };
  const inventoryDownloadRef = { current: null as (() => void) | null };
  const expandAllRef = { current: null as (() => void) | null };
  const collapseAllRef = { current: null as (() => void) | null };
  const admin = getAdmin();
  const isMaster = admin?.role === "master_admin";
  const isSuperHub = admin?.role === "super_hub";

  const { data: subHubsData } = useQuery({
    queryKey: ["sub-hubs-for-report"],
    queryFn: () => apiFetch("/api/sub-hubs"),
    enabled: isMaster || isSuperHub,
  });

  const firstSubHubId = useMemo(() => {
    if (admin?.role === "sub_hub") {
      return admin?.subHubIds?.[0] || admin?.subHubId || "";
    }
    const raw = subHubsData?.subHubs ?? subHubsData?.data ?? [];
    return raw[0]?._id || raw[0]?.id || "";
  }, [subHubsData, admin]);

  const handleDownload = () => {
    if (activeTab === "orders" && ordersDownloadRef.current) ordersDownloadRef.current();
    else if (activeTab === "inventory" && inventoryDownloadRef.current) inventoryDownloadRef.current();
  };

  const dateInputStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "4px 8px",
    fontSize: 12,
    fontFamily: "Poppins, sans-serif",
    color: "#000",
    background: "#fff",
    height: 30,
  };

  const headerSlot = document.getElementById("page-header-slot");

  const headerContent = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", fontFamily: "Poppins, sans-serif" }}>
      {/* Title */}
      <h1 style={{ fontSize: 15, fontWeight: 700, color: "#000", margin: 0, whiteSpace: "nowrap", flexShrink: 0 }}>
        Day End Report
      </h1>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: "#888", whiteSpace: "nowrap" }}>From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
        <label style={{ fontSize: 11, fontWeight: 500, color: "#888", whiteSpace: "nowrap" }}>To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Expand/Collapse All — only on inventory tab when products exist */}
      {activeTab === "inventory" && hasInventoryProducts && (
        <>
          <button onClick={() => expandAllRef.current?.()} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#555", background: "#f3f4f6", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "Poppins, sans-serif", flexShrink: 0, height: 30 }}>
            <ChevronDown style={{ width: 12, height: 12 }} /> Expand All
          </button>
          <button onClick={() => collapseAllRef.current?.()} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#555", background: "#f3f4f6", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "Poppins, sans-serif", flexShrink: 0, height: 30 }}>
            <ChevronRight style={{ width: 12, height: 12 }} /> Collapse All
          </button>
          <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />
        </>
      )}

      {/* Tab buttons */}
      <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 9, padding: 3, gap: 2, flexShrink: 0 }}>
        {([
          { key: "orders" as Tab, label: "Orders Report" },
          { key: "inventory" as Tab, label: "Inventory Report" },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "5px 14px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "Poppins, sans-serif",
              transition: "all 0.15s",
              background: activeTab === key ? "#fff" : "transparent",
              color: activeTab === key ? "#F05B4E" : "#666",
              boxShadow: activeTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Download */}
      <button
        onClick={handleDownload}
        title="Download Excel"
        style={{
          width: 34, height: 34, borderRadius: 9, border: "1px solid #e5e7eb",
          background: "#fff", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", color: "#15803d", transition: "all 0.15s", flexShrink: 0,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f0fdf4"; (e.currentTarget as HTMLElement).style.borderColor = "#86efac"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; }}
      >
        <Download style={{ width: 15, height: 15 }} />
      </button>
    </div>
  );

  return (
    <>
      {/* Inject all controls into the layout's top white bar */}
      {headerSlot && createPortal(headerContent, headerSlot)}

      {/* Page content — no own header, no blue bg */}
      <div style={{ padding: "24px 28px", background: "#fff", minHeight: "100vh", ...POPPINS }}>
        {activeTab === "orders" && (
          <OrdersReport
            from={from}
            to={to}
            onDownload={() => {}}
            downloadRef={ordersDownloadRef}
          />
        )}
        {activeTab === "inventory" && (
          <InventoryReport
            firstSubHubId={firstSubHubId}
            onDownload={() => {}}
            downloadRef={inventoryDownloadRef}
            expandAllRef={expandAllRef}
            collapseAllRef={collapseAllRef}
            onHasProducts={setHasInventoryProducts}
          />
        )}
      </div>
    </>
  );
}
