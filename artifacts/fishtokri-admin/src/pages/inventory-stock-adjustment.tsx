import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2, Plus, Search, X, Trash2, ChevronDown, ChevronRight, ChevronLeft,
  Lock, PackageOpen, Calendar, Hash, Layers, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { getCurrentAdminScope } from "@/lib/api";

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

function toInputDate(d: Date) { return d.toISOString().split("T")[0]; }
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type SuperHub = { id: string; name: string; location?: string };
type SubHub = { id: string; name: string; location?: string };
type Batch = {
  id: string;
  batchNumber: string;
  quantity: number;
  shelfLifeDays: number | null;
  receivedDate: string | null;
  expiryDate: string | null;
  notes: string;
};
type Product = { id: string; name: string; shortCode?: string; category: string; unit: string; quantity: number; batches?: Batch[] };

type FormMode = "add" | "remove" | "add_existing";
type FormRow = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  quantityBefore: number;
  mode: FormMode;
  addQuantity: string;
  shelfLifeDays: string;
  expiryDate: string;
  expiryTime: string;
  batchNumber: string;
  batchNotes: string;
  removeQuantity: string;
  selectedBatchId: string;
  search: string;
};

type Adjustment = {
  _id: string;
  date: string;
  reason: string;
  notes: string;
  superHubName?: string;
  subHubName?: string;
  items: Array<{
    productName: string; unit: string; quantityBefore: number; newQuantity: number; quantityAdjusted: number;
    mode?: string;
    batch?: { batchNumber?: string; quantity?: number; shelfLifeDays?: number | null; expiryDate?: string | null };
  }>;
  createdAt: string;
};

const REASONS = [
  "Stock damaged", "Stock wastage", "Stocking new inventory",
  "EXTRA SKU", "SKU TRANSFER", "Stock correction", "Other",
];

// ─── BATCH NUMBER GENERATION ─────────────────────────────────────────────────
function generateBatchPrefix(productName: string): string {
  const words = productName.trim().toUpperCase().replace(/[^A-Z\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "BAT";
  if (words.length === 1) {
    return words[0].slice(0, 3).padEnd(3, "X");
  }
  return (words[0].slice(0, 2) + words[1].slice(0, 2)).padEnd(4, "X");
}

/** Returns today's date as YYYYMMDD in IST (UTC+5:30). */
function getTodayYYYYMMDD(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Generates the next batch ID in the format: YYYYMMDD + ProductCode + PerProductSeq.
 *
 * If the product has a shortCode it is used directly as the prefix instead of
 * deriving one from the product name.
 *
 * Examples (shortCode "CBB"):
 *   First batch on 30 May 2026  → 20260530CBB01
 *   Second batch on 31 May 2026 → 20260531CBB02
 *
 * @param productName     Name of the product (fallback prefix source).
 * @param productBatches  Only the batches belonging to THIS product.
 * @param shortCode       Optional short code — used as prefix when provided.
 */
function generateNextBatchNumber(productName: string, productBatches: Batch[], shortCode?: string): string {
  const prefix = shortCode && shortCode.trim() ? shortCode.trim().toUpperCase() : generateBatchPrefix(productName);
  const today = getTodayYYYYMMDD();
  let maxNum = 0;
  for (const b of productBatches) {
    if (b.batchNumber && b.batchNumber.toUpperCase().includes(prefix)) {
      const match = b.batchNumber.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  return `${today}${prefix}${String(maxNum + 1).padStart(2, "0")}`;
}

function emptyRow(): FormRow {
  return {
    productId: "", productName: "", category: "", unit: "", quantityBefore: 0,
    mode: "add", addQuantity: "", shelfLifeDays: "", expiryDate: "", expiryTime: getCurrentTime12h(), batchNumber: "",
    batchNotes: "",
    removeQuantity: "", selectedBatchId: "", search: "",
  };
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function parse12h(time: string): { h: number; m: number; ampm: "AM" | "PM" } {
  if (!time) return { h: 12, m: 0, ampm: "AM" };
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    return { h: parseInt(match[1], 10), m: parseInt(match[2], 10), ampm: match[3].toUpperCase() as "AM" | "PM" };
  }
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h = h - 12;
  return { h, m, ampm };
}

function format12h(h: number, m: number, ampm: "AM" | "PM"): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

function to24hTime(time12h: string): string {
  const { h, m, ampm } = parse12h(time12h);
  let hour = h % 12;
  if (ampm === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getCurrentTime12h(): string {
  const now = new Date();
  const h24 = now.getHours();
  const m = now.getMinutes();
  const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return format12h(h, m, ampm);
}

function ClockPickerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { h, m, ampm } = parse12h(value);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hour" | "minute">("hour");

  const timeLabel = value
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`
    : "-- : --";

  const SIZE = 200;
  const CENTER = SIZE / 2;
  const R = 78;

  const hourItems = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minuteItems = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const items = mode === "hour" ? hourItems : minuteItems;

  const handAngle = mode === "hour"
    ? ((h % 12) / 12) * 2 * Math.PI - Math.PI / 2
    : (m / 60) * 2 * Math.PI - Math.PI / 2;
  const handX = CENTER + R * Math.cos(handAngle);
  const handY = CENTER + R * Math.sin(handAngle);

  const handleClockClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const x = (e.clientX - rect.left) * scaleX - CENTER;
    const y = (e.clientY - rect.top) * scaleY - CENTER;
    const dist = Math.sqrt(x * x + y * y);
    if (dist < 20) return;
    const rawAngle = Math.atan2(y, x);
    const clockAngle = ((rawAngle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI));
    const idx = Math.round(clockAngle / (2 * Math.PI / 12)) % 12;
    if (mode === "hour") {
      onChange(format12h(hourItems[idx], m, ampm));
      setMode("minute");
    } else {
      onChange(format12h(h, minuteItems[idx], ampm));
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMode("hour"); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full h-8 px-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F]"
        >
          <Clock className="w-3 h-3 text-gray-400 shrink-0" />
          <span className={value ? "text-[#162B4D]" : "text-gray-400"}>{timeLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-4" align="start" sideOffset={4}>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Select Time</p>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setMode("hour")}
              className={`text-[36px] font-bold tabular-nums w-14 text-center rounded-lg py-0.5 transition-colors ${mode === "hour" ? "text-[#162B4D] bg-blue-50" : "text-gray-300 hover:text-gray-500"}`}
            >
              {String(h).padStart(2, "0")}
            </button>
            <span className="text-[36px] font-bold text-gray-200 select-none">:</span>
            <button
              type="button"
              onClick={() => setMode("minute")}
              className={`text-[36px] font-bold tabular-nums w-14 text-center rounded-lg py-0.5 transition-colors ${mode === "minute" ? "text-[#162B4D] bg-blue-50" : "text-gray-300 hover:text-gray-500"}`}
            >
              {String(m).padStart(2, "0")}
            </button>
          </div>
          <div className="flex flex-col ml-2">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange(format12h(h, m, p))}
                className={`text-sm font-bold px-2 py-1 rounded-md transition-colors ${ampm === p ? "bg-[#162B4D] text-white" : "text-gray-300 hover:text-gray-600"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode("hour")}
            disabled={mode === "hour"}
            className="p-1 rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 disabled:pointer-events-none transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="flex-1 cursor-pointer"
            onClick={handleClockClick}
          >
            <circle cx={CENTER} cy={CENTER} r={CENTER - 1} fill="#F8FAFC" stroke="#E8EDF5" strokeWidth="1.5" />
            <line x1={CENTER} y1={CENTER} x2={handX} y2={handY} stroke="#364F9F" strokeWidth="2" strokeLinecap="round" />
            <circle cx={CENTER} cy={CENTER} r="4" fill="#364F9F" />
            <circle cx={handX} cy={handY} r="3.5" fill="#364F9F" />
            {items.map((item, i) => {
              const angle = (i / items.length) * 2 * Math.PI - Math.PI / 2;
              const x = CENTER + R * Math.cos(angle);
              const y = CENTER + R * Math.sin(angle);
              const isSelected = mode === "hour" ? h === item : m === item;
              return (
                <g key={item}>
                  {isSelected && <circle cx={x} cy={y} r="15" fill="#364F9F" />}
                  <text
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="13"
                    fontWeight={isSelected ? "700" : "400"}
                    fill={isSelected ? "white" : "#4B5563"}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {mode === "minute" ? String(item).padStart(2, "0") : item}
                  </text>
                </g>
              );
            })}
          </svg>

          <button
            type="button"
            onClick={() => setMode("minute")}
            disabled={mode === "minute"}
            className="p-1 rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 disabled:pointer-events-none transition-colors shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-2 font-semibold uppercase tracking-widest">
          {mode === "hour" ? "← Tap to set hour" : "Tap to set minute →"}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function formatExpiry(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// ─── LOCKED HUB BADGE ────────────────────────────────────────────────────────
function LockedHubBadge({ label, name, location }: { label: string; name: string; location?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hidden sm:inline">{label}</span>
      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 min-w-0">
        <Building2 className="w-3.5 h-3.5 text-[#364F9F] flex-shrink-0" />
        <span className="text-sm font-semibold text-[#162B4D] truncate">{name}</span>
        {location && <span className="text-[11px] text-gray-400 hidden md:inline truncate">· {location}</span>}
        <Lock className="w-3 h-3 text-gray-300 flex-shrink-0 ml-0.5" />
      </div>
    </div>
  );
}

// ─── PRODUCT SELECTOR ────────────────────────────────────────────────────────
function ProductSelector({
  row, idx, allProducts, usedIds, onSelect, onClear, onSearchChange,
}: {
  row: FormRow;
  idx: number;
  allProducts: Product[];
  usedIds: Set<string>;
  onSelect: (idx: number, p: Product) => void;
  onClear: (idx: number) => void;
  onSearchChange: (idx: number, val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const available = allProducts.filter((p) => !(usedIds.has(p.id) && p.id !== row.productId));
  const grouped: Record<string, Product[]> = {};
  for (const p of available) {
    const cat = p.category || "Uncategorized";
    (grouped[cat] = grouped[cat] || []).push(p);
  }
  const categories = Object.keys(grouped).sort();

  const q = row.search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const searchResults = isSearching
    ? available.filter((p) => p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q))
    : [];

  function doClose() { setOpen(false); setSelectedCategory(null); }
  function doOpen() { if (!open) setSelectedCategory(null); setOpen(true); }
  function scheduleClose() { closeTimerRef.current = setTimeout(doClose, 120); }
  function cancelClose() { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      doClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  let style: React.CSSProperties = { display: "none" };
  if (open && wrapperRef.current) {
    const r = wrapperRef.current.getBoundingClientRect();
    style = {
      position: "fixed",
      bottom: window.innerHeight - r.top + 4,
      left: r.left,
      width: isSearching ? Math.max(r.width, 272) : 560,
      zIndex: 9999,
    };
  }

  const dropdown = (
    <div ref={portalRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
      onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      {isSearching ? (
        <>
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Search results</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-400 text-center">No products found</div>
            ) : searchResults.map((p) => (
              <button
                key={p.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(idx, p); doClose(); }}
                className="w-full text-left px-4 py-2.5 hover:bg-[#F05B4E]/5 transition-colors flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#162B4D] truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 font-medium">{p.category || "Uncategorized"}</p>
                </div>
                <p className="text-xs font-bold text-gray-500 flex-shrink-0">
                  {p.quantity} <span className="font-normal text-gray-400">{p.unit}</span>
                </p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[260px_300px]">
          <div className="border-r border-gray-100">
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Category</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-400 text-center">No categories</div>
              ) : categories.map((cat) => (
                <button
                  key={cat} type="button"
                  onMouseEnter={() => setSelectedCategory(cat)}
                  onMouseDown={(e) => { e.preventDefault(); setSelectedCategory(cat); }}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0 ${
                    selectedCategory === cat ? "bg-[#364F9F]/5" : "hover:bg-[#364F9F]/5"
                  }`}
                >
                  <span className="text-sm font-semibold text-[#162B4D]">{cat}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 font-semibold">{grouped[cat]?.length ?? 0}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] font-bold text-[#162B4D] uppercase tracking-widest">{selectedCategory ?? "Select a category"}</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {selectedCategory === null ? (
                <div className="px-4 py-8 text-sm text-gray-400 text-center">Hover a category to see products</div>
              ) : (grouped[selectedCategory] ?? []).length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-400 text-center">No products</div>
              ) : (grouped[selectedCategory] ?? []).map((p) => (
                <button
                  key={p.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onSelect(idx, p); doClose(); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#F05B4E]/5 transition-colors flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#162B4D] truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.unit || "—"}</p>
                  </div>
                  <p className="text-xs font-bold text-gray-500 flex-shrink-0">
                    {p.quantity} <span className="font-normal text-gray-400">{p.unit}</span>
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative w-full" onMouseEnter={() => { cancelClose(); doOpen(); }} onMouseLeave={scheduleClose}>
      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
      <input
        type="text" value={row.search}
        onChange={(e) => { onSearchChange(idx, e.target.value); setOpen(true); }}
        onFocus={doOpen}
        placeholder="Choose Product"
        className={`w-full h-9 pl-8 pr-8 text-sm font-medium border rounded-lg outline-none transition-all
          focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F]
          ${row.productId ? "bg-[#364F9F]/5 border-[#364F9F]/30 text-[#162B4D]" : "border-gray-200 bg-white text-gray-500"}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        {row.productId ? (
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onClear(idx); doClose(); }}
            className="text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform pointer-events-none ${open ? "rotate-180" : ""}`} />
        )}
      </div>
      {open && createPortal(dropdown, document.body)}
    </div>
  );
}

// ─── BATCH SELECTOR (for remove / add_existing modes) ────────────────────────
function BatchSelector({
  batches,
  unit,
  selectedBatchId,
  onSelect,
  mode = "remove",
}: {
  batches: Batch[];
  unit: string;
  selectedBatchId: string;
  onSelect: (batchId: string) => void;
  mode?: "remove" | "add_existing";
}) {
  const activeBatches = batches.filter((b) => b.quantity > 0);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = activeBatches.find((b) => b.id === selectedBatchId);

  function scheduleClose() { closeTimerRef.current = setTimeout(() => setOpen(false), 120); }
  function cancelClose() { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  let style: React.CSSProperties = { display: "none" };
  if (open && wrapperRef.current) {
    const r = wrapperRef.current.getBoundingClientRect();
    style = {
      position: "fixed",
      bottom: window.innerHeight - r.top + 4,
      left: r.left,
      minWidth: Math.max(r.width, 280),
      zIndex: 9999,
    };
  }

  const dropdown = (
    <div ref={portalRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
      onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
          {mode === "add_existing" ? "Select Batch to Add Into" : "Select Batch to Reduce"}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {mode === "remove" && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(""); setOpen(false); }}
            className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 flex items-center gap-2 ${!selectedBatchId ? "bg-amber-50" : ""}`}
          >
            <span className="text-sm font-medium text-gray-500 italic">FIFO (auto — earliest expiry first)</span>
          </button>
        )}
        {activeBatches.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-400 text-center">No active batches</div>
        ) : activeBatches.map((b) => {
          const dl = daysUntil(b.expiryDate);
          const tone = dl == null ? "text-gray-500"
            : dl < 0 ? "text-red-600"
            : dl <= 7 ? "text-amber-600"
            : "text-emerald-600";
          return (
            <button
              key={b.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(b.id); setOpen(false); }}
              className={`w-full text-left px-4 py-3 hover:bg-[#364F9F]/5 transition-colors border-b border-gray-50 last:border-0 ${selectedBatchId === b.id ? "bg-[#364F9F]/5" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#162B4D]">{b.batchNumber || "Unnamed Batch"}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Added {formatDate(b.receivedDate)} · Exp <span className={`font-semibold ${tone}`}>{formatExpiry(b.expiryDate)}</span>
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-[#162B4D]">{b.quantity}</p>
                  <p className="text-[11px] text-gray-400">{unit}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const placeholder = mode === "add_existing" ? "Select a batch" : "FIFO (auto)";
  const selectedStyle = mode === "add_existing"
    ? "bg-[#364F9F]/5 border-[#364F9F]/30 text-[#162B4D]"
    : "bg-amber-50 border-amber-200 text-[#162B4D]";

  return (
    <div ref={wrapperRef} className="relative w-full" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full h-9 px-3 text-sm font-medium text-left border rounded-lg outline-none transition-all flex items-center justify-between gap-2
          focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F]
          ${selected ? selectedStyle : "border-gray-200 bg-white text-gray-400"}`}
      >
        <span className="truncate">{selected ? selected.batchNumber || "Unnamed" : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(dropdown, document.body)}
    </div>
  );
}

// ─── EXISTING BATCHES CARD (editable) ────────────────────────────────────────
function ExistingBatchesCard({
  batches, unit, productId, subHubId, onReload,
}: {
  batches: Batch[];
  unit: string;
  productId: string;
  subHubId: string;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState<Batch[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync local edit state when batches prop changes or panel opens
  useEffect(() => {
    setEdited(batches.map((b) => ({ ...b })));
    setDirty(false);
  }, [batches, open]);

  if (batches.length === 0) return null;

  function patchBatch(idx: number, patch: Partial<Batch>) {
    setEdited((prev) => prev.map((b, i) => i === idx ? { ...b, ...patch } : b));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/inventory/products/${productId}/batches?subHubId=${subHubId}`, {
        method: "PUT",
        body: JSON.stringify({ batches: edited }),
      });
      toast({ title: "Batches updated successfully" });
      setDirty(false);
      onReload();
    } catch (err: any) {
      toast({ title: "Failed to save batches", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEdited(batches.map((b) => ({ ...b })));
    setDirty(false);
  }

  return (
    <div className="mt-3 rounded-xl border border-[#364F9F]/15 bg-[#364F9F]/3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 bg-[#364F9F]/8 flex items-center gap-2 hover:bg-[#364F9F]/12 transition-colors"
      >
        <Layers className="w-3.5 h-3.5 text-[#364F9F]" />
        <span className="text-[11px] font-bold text-[#364F9F] uppercase tracking-widest flex-1 text-left">
          Existing Batches ({batches.length})
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#364F9F] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* Column headers */}
          <div className="px-3 py-1.5 bg-[#364F9F]/5 border-y border-[#364F9F]/10">
            <div className="grid grid-cols-6 gap-2">
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Batch ID</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Qty ({unit})</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Shelf Life (d)</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Received</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Expiry</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Notes</span>
            </div>
          </div>

          {/* Editable rows */}
          <div className="divide-y divide-[#364F9F]/10">
            {edited.map((b, i) => {
              const dl = daysUntil(b.expiryDate);
              const expColor = dl == null ? "border-gray-200"
                : dl < 0 ? "border-red-300 bg-red-50"
                : dl <= 7 ? "border-amber-300 bg-amber-50"
                : "border-emerald-200 bg-emerald-50";
              return (
                <div key={b.id} className="px-3 py-2 grid grid-cols-6 gap-2 items-center bg-white/50 hover:bg-white/80 transition-colors">
                  <input
                    type="text"
                    value={b.batchNumber}
                    onChange={(e) => patchBatch(i, { batchNumber: e.target.value.toUpperCase() })}
                    className="h-7 px-2 text-[11px] font-bold font-mono text-[#162B4D] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#364F9F]/30 uppercase"
                  />
                  <input
                    type="number"
                    min="0"
                    value={b.quantity}
                    onChange={(e) => patchBatch(i, { quantity: Number(e.target.value) })}
                    className="h-7 px-2 text-[11px] font-bold text-[#162B4D] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#364F9F]/30"
                  />
                  <input
                    type="number"
                    min="0"
                    value={b.shelfLifeDays ?? ""}
                    onChange={(e) => {
                      const days = e.target.value === "" ? null : Number(e.target.value);
                      let expiry = b.expiryDate;
                      if (days !== null && b.receivedDate) {
                        const d = new Date(b.receivedDate);
                        d.setDate(d.getDate() + days);
                        expiry = d.toISOString().slice(0, 10);
                      }
                      patchBatch(i, { shelfLifeDays: days, expiryDate: expiry });
                    }}
                    placeholder="—"
                    className="h-7 px-2 text-[11px] text-[#162B4D] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#364F9F]/30"
                  />
                  <input
                    type="date"
                    value={b.receivedDate?.slice(0, 10) ?? ""}
                    onChange={(e) => {
                      const received = e.target.value || null;
                      const patch: Partial<Batch> = { receivedDate: received };
                      if (received && b.expiryDate) {
                        const days = Math.round((new Date(b.expiryDate).getTime() - new Date(received).getTime()) / 86400000);
                        patch.shelfLifeDays = days >= 0 ? days : null;
                      }
                      patchBatch(i, patch);
                    }}
                    className="h-7 px-2 text-[11px] text-[#162B4D] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#364F9F]/30"
                  />
                  <input
                    type="date"
                    value={b.expiryDate?.slice(0, 10) ?? ""}
                    onChange={(e) => {
                      const expiry = e.target.value || null;
                      const patch: Partial<Batch> = { expiryDate: expiry };
                      if (expiry && b.receivedDate) {
                        const days = Math.round((new Date(expiry).getTime() - new Date(b.receivedDate).getTime()) / 86400000);
                        patch.shelfLifeDays = days >= 0 ? days : null;
                      }
                      patchBatch(i, patch);
                    }}
                    className={`h-7 px-2 text-[11px] text-[#162B4D] border rounded focus:outline-none focus:ring-1 focus:ring-[#364F9F]/30 ${expColor}`}
                  />
                  <input
                    type="text"
                    value={b.notes}
                    onChange={(e) => patchBatch(i, { notes: e.target.value })}
                    placeholder="Notes..."
                    className="h-7 px-2 text-[11px] text-gray-600 border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#364F9F]/30"
                  />
                </div>
              );
            })}
          </div>

          {/* Save / Cancel toolbar */}
          {dirty && (
            <div className="px-3 py-2 bg-[#364F9F]/5 border-t border-[#364F9F]/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-200 bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] font-semibold text-white bg-[#364F9F] hover:bg-[#2a3d7a] px-3 py-1 rounded transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function InventoryStockAdjustment() {
  const { toast } = useToast();
  const [superHubs, setSuperHubs] = useState<SuperHub[]>([]);
  const [subHubs, setSubHubs] = useState<SubHub[]>([]);
  const [selectedSuperHubId, setSelectedSuperHubId] = useState("");
  const [selectedSubHubId, setSelectedSubHubId] = useState("");
  const [selectedSuperHub, setSelectedSuperHub] = useState<SuperHub | null>(null);
  const [selectedSubHub, setSelectedSubHub] = useState<SubHub | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  const [formDate, setFormDate] = useState(toInputDate(new Date()));
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formRows, setFormRows] = useState<FormRow[]>([emptyRow()]);

  useEffect(() => {
    apiFetch("/api/super-hubs")
      .then((d) => setSuperHubs(d.superHubs ?? []))
      .catch((err) => toast({ title: "Failed to load super hubs", description: err.message, variant: "destructive" }));
  }, [toast]);

  const adminScope = useMemo(() => getCurrentAdminScope(), []);

  useEffect(() => {
    if (!superHubs.length) return;
    if (selectedSuperHubId) return;
    setSelectedSuperHubId(superHubs[0].id);
    setSelectedSuperHub(superHubs[0]);
  }, [superHubs]);

  useEffect(() => {
    if (!selectedSuperHubId) { setSubHubs([]); setSelectedSubHubId(""); setSelectedSuperHub(null); return; }
    const sh = superHubs.find((h) => h.id === selectedSuperHubId);
    if (sh) setSelectedSuperHub(sh);
    apiFetch(`/api/super-hubs/${selectedSuperHubId}/sub-hubs`)
      .then((d) => setSubHubs(d.subHubs ?? []))
      .catch((err) => toast({ title: "Failed to load sub hubs", description: err.message, variant: "destructive" }));
    setSelectedSubHubId("");
    setSelectedSubHub(null);
  }, [selectedSuperHubId, toast]);

  useEffect(() => {
    if (!subHubs.length) return;
    if (selectedSubHubId) return;
    setSelectedSubHubId(subHubs[0].id);
    setSelectedSubHub(subHubs[0]);
  }, [subHubs]);

  useEffect(() => {
    const sh = subHubs.find((h) => h.id === selectedSubHubId);
    if (sh) setSelectedSubHub(sh);
  }, [selectedSubHubId, subHubs]);

  function reload() {
    if (!selectedSubHubId) { setProducts([]); return; }
    apiFetch(`/api/inventory/products?subHubId=${selectedSubHubId}`)
      .then((res) => setProducts(res.products ?? []))
      .catch((err) => toast({ title: "Failed to load products", description: err.message, variant: "destructive" }));
  }

  useEffect(reload, [selectedSubHubId]);

  function addRow() { setFormRows((rows) => [...rows, emptyRow()]); }
  function removeRow(i: number) { setFormRows((rows) => rows.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: Partial<FormRow>) {
    setFormRows((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function selectProduct(i: number, p: Product) {
    // Only pass this product's own batches so the sequence counter is per-product.
    const productBatches: Batch[] = p.batches ?? [];
    const autoNum = generateNextBatchNumber(p.name, productBatches, p.shortCode);
    setFormRows((rows) => rows.map((r, idx) => idx === i ? {
      ...r,
      productId: p.id, productName: p.name, category: p.category || "",
      unit: p.unit, quantityBefore: p.quantity, search: p.name,
      batchNumber: r.mode === "add" ? autoNum : "",
      batchNotes: "",
      selectedBatchId: "",
    } : r));
  }

  function clearProduct(i: number) {
    updateRow(i, { productId: "", productName: "", category: "", unit: "", quantityBefore: 0, search: "", batchNumber: "", selectedBatchId: "" });
  }

  function onSearchChange(i: number, val: string) {
    updateRow(i, { search: val, productId: "", productName: "", category: "", unit: "", quantityBefore: 0, batchNumber: "", selectedBatchId: "" });
  }

  function changeMode(i: number, mode: FormMode) {
    const row = formRows[i];
    let batchNumber = "";
    if (mode === "add" && row.productId) {
      // Only use this product's own batches for per-product sequential counter.
      const prod = products.find((p) => p.id === row.productId);
      const productBatches: Batch[] = prod?.batches ?? [];
      batchNumber = generateNextBatchNumber(row.productName, productBatches, prod?.shortCode);
    }
    updateRow(i, { mode, batchNumber, batchNotes: "", selectedBatchId: "" });
  }

  function setShelfLife(i: number, val: string) {
    const days = Number(val);
    const expiry = val !== "" && Number.isFinite(days) ? addDaysISO(days) : "";
    updateRow(i, { shelfLifeDays: val, expiryDate: expiry });
  }

  function setExpiryDate(i: number, val: string) {
    let shelfLifeDays = "";
    if (val) {
      const days = Math.round((new Date(val).getTime() - Date.now()) / 86400000);
      if (days >= 0) shelfLifeDays = String(days);
    }
    updateRow(i, { expiryDate: val, shelfLifeDays });
  }

  function resetForm() {
    setFormDate(toInputDate(new Date()));
    setFormReason("");
    setFormNotes("");
    setFormRows([emptyRow()]);
  }

  async function handleSave() {
    const validRows = formRows.filter((r) =>
      r.productId && (
        (r.mode === "add" && r.addQuantity !== "" && Number(r.addQuantity) > 0) ||
        (r.mode === "add_existing" && r.selectedBatchId && r.addQuantity !== "" && Number(r.addQuantity) > 0) ||
        (r.mode === "remove" && r.removeQuantity !== "" && Number(r.removeQuantity) > 0)
      )
    );
    if (validRows.length === 0) { toast({ title: "Add at least one product with a quantity", variant: "destructive" }); return; }
    if (!formReason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    const missingExpiry = validRows.find((r) => r.mode === "add" && !r.shelfLifeDays && !r.expiryDate);
    if (missingExpiry) {
      toast({ title: "Set shelf life or expiry", description: `Add shelf life (days) or an expiry date for ${missingExpiry.productName}.`, variant: "destructive" });
      return;
    }
    const missingBatch = validRows.find((r) => r.mode === "add_existing" && !r.selectedBatchId);
    if (missingBatch) {
      toast({ title: "Select a batch", description: `Choose which existing batch to add into for ${missingBatch.productName}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          subHubId: selectedSubHubId,
          superHubId: selectedSuperHubId,
          date: formDate,
          reason: formReason,
          notes: formNotes,
          items: validRows.map((r) => {
            if (r.mode === "add") return {
              productId: r.productId, mode: "add",
              addQuantity: Number(r.addQuantity),
              shelfLifeDays: r.shelfLifeDays !== "" ? Number(r.shelfLifeDays) : undefined,
              expiryDate: r.expiryDate
                ? (r.expiryTime ? `${r.expiryDate}T${to24hTime(r.expiryTime)}:00` : r.expiryDate)
                : undefined,
              batchNumber: r.batchNumber || undefined,
              notes: r.batchNotes || undefined,
            };
            if (r.mode === "add_existing") return {
              productId: r.productId, mode: "add_existing",
              batchId: r.selectedBatchId,
              addQuantity: Number(r.addQuantity),
            };
            return {
              productId: r.productId, mode: "remove",
              removeQuantity: Number(r.removeQuantity),
              batchId: r.selectedBatchId || undefined,
            };
          }),
        }),
      });
      toast({ title: "Stock adjustment saved" });
      resetForm();
      reload();
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const usedIds = useMemo(() => new Set(formRows.map((r) => r.productId).filter(Boolean)), [formRows]);

  const headerSlot = document.getElementById("page-header-slot");
  const headerContent = (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="min-w-0 flex-shrink-0">
        <p className="text-sm font-bold text-[#162B4D] leading-tight">Inventory Stock Management</p>
        <p className="text-[11px] text-gray-400 leading-tight hidden sm:block">Adjust quantities for multiple products at once.</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {selectedSuperHub && <LockedHubBadge label="Super Hub" name={selectedSuperHub.name} location={selectedSuperHub.location} />}
        {selectedSuperHub && selectedSubHub && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
        {selectedSubHub && <LockedHubBadge label="Sub Hub" name={selectedSubHub.name} location={selectedSubHub.location} />}
        <div className="hidden">
          <Select value={selectedSuperHubId} onValueChange={setSelectedSuperHubId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{superHubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedSubHubId} onValueChange={setSelectedSubHubId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{subHubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // ─── FORM VIEW ───────────────────────────────────────────────────────────────
  return (
    <>
      {headerSlot && createPortal(headerContent, headerSlot)}
      <div className="space-y-6">
        {/* Header meta row */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-[#162B4D] mb-4">Adjustment Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-9 text-sm font-medium text-[#162B4D]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Reason <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Enter reason"
                  className="h-9 text-sm font-medium text-[#162B4D]"
                  list="inv-reason-list"
                />
                <datalist id="inv-reason-list">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Notes</Label>
                <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Write notes here..." className="h-9 text-sm text-gray-600" />
              </div>
            </div>
          </div>

          {/* Products section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#162B4D]">Products</h2>
              <span className="text-[11px] text-gray-400 font-medium">{formRows.filter(r => r.productId).length} / {formRows.length} selected</span>
            </div>

            <div className="space-y-3">
              {formRows.map((row, idx) => {
                const isAdd = row.mode === "add";
                const isAddExisting = row.mode === "add_existing";
                const isAddAny = isAdd || isAddExisting;
                const dLeft = isAdd ? daysUntil(row.expiryDate) : null;
                const expTone = dLeft == null ? "text-gray-400"
                  : dLeft < 0 ? "text-red-600"
                  : dLeft <= 7 ? "text-amber-600"
                  : "text-emerald-600";

                const prod = products.find((p) => p.id === row.productId);
                const prodBatches: Batch[] = prod?.batches ?? [];
                const activeBatches = prodBatches.filter(b => b.quantity > 0);

                const badgeClass = isAdd
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : isAddExisting
                  ? "bg-[#364F9F]/10 text-[#364F9F] border border-[#364F9F]/25"
                  : "bg-red-50 text-red-700 border border-red-200";
                const badgeLabel = isAdd ? "ADD BATCH" : isAddExisting ? "ADD TO BATCH" : "REDUCE";

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border transition-colors ${
                      row.productId
                        ? "border-gray-200 bg-white shadow-sm"
                        : "border-dashed border-gray-200 bg-gray-50/50"
                    }`}
                  >
                    {/* Row header */}
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
                      <span className="w-5 h-5 rounded-full bg-[#364F9F]/10 text-[#364F9F] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {row.productId ? row.productName : "New Product Row"}
                      </span>
                      {row.productId && (
                        <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      )}
                      {formRows.length > 1 && (
                        <button onClick={() => removeRow(idx)} className="ml-auto text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Row fields */}
                    <div className="px-4 py-3">
                      <div className="grid grid-cols-12 gap-3 items-start">
                        {/* Product selector */}
                        <div className="col-span-12 md:col-span-4 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product *</label>
                          <ProductSelector
                            row={row} idx={idx} allProducts={products} usedIds={usedIds}
                            onSelect={selectProduct} onClear={clearProduct} onSearchChange={onSearchChange}
                          />
                          {row.productId && (
                            <p className="text-[10px] text-gray-400 font-medium">
                              {row.unit} · <span className="text-[#162B4D] font-bold">{row.quantityBefore}</span> available
                            </p>
                          )}
                        </div>

                        {/* Mode */}
                        <div className="col-span-6 md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mode</label>
                          <Select value={row.mode} onValueChange={(v) => changeMode(idx, v as FormMode)}>
                            <SelectTrigger className="h-9 text-sm font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="add">
                                <span className="font-semibold text-emerald-700">+ New Batch</span>
                              </SelectItem>
                              <SelectItem value="add_existing">
                                <span className="font-semibold text-[#364F9F]">+ Add to Batch</span>
                              </SelectItem>
                              <SelectItem value="remove">
                                <span className="font-semibold text-red-700">– Reduce</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Quantity */}
                        <div className="col-span-6 md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quantity</label>
                          <input
                            type="number" min="0"
                            value={isAddAny ? row.addQuantity : row.removeQuantity}
                            onChange={(e) => updateRow(idx, isAddAny ? { addQuantity: e.target.value } : { removeQuantity: e.target.value })}
                            placeholder="0"
                            className="w-full h-9 px-3 text-sm font-bold text-[#162B4D] text-center border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F]"
                          />
                        </div>

                        {/* Conditional fields */}
                        {isAdd ? (
                          <>
                            {/* Shelf Life */}
                            <div className="col-span-6 md:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Shelf Life (days)</label>
                              <input
                                type="number" min="0"
                                value={row.shelfLifeDays}
                                onChange={(e) => setShelfLife(idx, e.target.value)}
                                placeholder="e.g. 7"
                                className="w-full h-9 px-3 text-sm font-medium text-center border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F]"
                              />
                            </div>
                            {/* Expiry Date + Time */}
                            <div className="col-span-6 md:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expiry Date &amp; Time</label>
                              <input
                                type="date"
                                value={row.expiryDate}
                                onChange={(e) => setExpiryDate(idx, e.target.value)}
                                className={`w-full h-9 px-2 text-xs font-semibold border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F] ${expTone}`}
                              />
                              <ClockPickerField
                                value={row.expiryTime}
                                onChange={(v) => updateRow(idx, { expiryTime: v })}
                              />
                              {dLeft != null && (
                                <p className={`text-[10px] font-bold ${expTone}`}>
                                  {dLeft < 0 ? `Expired ${Math.abs(dLeft)}d ago` : dLeft === 0 ? "Expires today" : `${dLeft}d left`}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (isAddExisting || row.mode === "remove") ? (
                          <div className="col-span-12 md:col-span-4 space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                              {isAddExisting ? "Select Batch to Add Into" : "Select Batch"}
                            </label>
                            {activeBatches.length > 0 ? (
                              <BatchSelector
                                batches={prodBatches}
                                unit={row.unit}
                                selectedBatchId={row.selectedBatchId}
                                onSelect={(batchId) => updateRow(idx, { selectedBatchId: batchId })}
                                mode={isAddExisting ? "add_existing" : "remove"}
                              />
                            ) : (
                              <div className="h-9 px-3 flex items-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg">
                                {row.productId ? "No active batches" : "Select product first"}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {/* Batch number + notes row for new batch mode only */}
                      {isAdd && row.productId && (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Hash className="w-3.5 h-3.5 text-[#364F9F]" />
                            <label className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Batch ID</label>
                          </div>
                          <input
                            type="text"
                            value={row.batchNumber}
                            onChange={(e) => updateRow(idx, { batchNumber: e.target.value.toUpperCase() })}
                            placeholder="Auto-generated"
                            className="w-36 h-8 px-3 text-xs font-bold text-[#364F9F] border border-[#364F9F]/30 bg-[#364F9F]/5 rounded-lg outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F] uppercase tracking-wider"
                          />
                          <span className="text-[10px] text-gray-400">Auto-generated · editable</span>
                          <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Batch Notes</label>
                          <input
                            type="text"
                            value={row.batchNotes}
                            onChange={(e) => updateRow(idx, { batchNotes: e.target.value })}
                            placeholder="Optional notes for this batch..."
                            className="flex-1 min-w-[160px] h-8 px-3 text-xs text-gray-700 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F]"
                          />
                        </div>
                      )}

                      {/* Existing batches collapsible */}
                      {row.productId && prodBatches.length > 0 && (
                        <ExistingBatchesCard
                          batches={prodBatches}
                          unit={row.unit}
                          productId={row.productId}
                          subHubId={selectedSubHubId}
                          onReload={reload}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={addRow}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#364F9F] hover:text-[#162B4D] transition-colors"
              >
                <Plus className="w-4 h-4" /> Add another product
              </button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={resetForm} className="font-semibold">Reset</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !selectedSubHubId}
                  className="bg-[#F05B4E] hover:bg-[#e04a3e] text-white font-semibold shadow-sm"
                >
                  {saving ? "Saving..." : "Save Adjustment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
