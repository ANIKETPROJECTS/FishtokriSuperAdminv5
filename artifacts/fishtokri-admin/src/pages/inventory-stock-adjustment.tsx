import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2, Plus, Search, X, Trash2, ChevronDown, ChevronRight,
  Lock, PackageOpen, Calendar, Hash, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
type Product = { id: string; name: string; category: string; unit: string; quantity: number; batches?: Batch[] };

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
  batchNumber: string;
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

function generateNextBatchNumber(productName: string, existingBatches: Batch[]): string {
  const prefix = generateBatchPrefix(productName);
  let maxNum = 0;
  for (const b of existingBatches) {
    if (b.batchNumber) {
      const bn = b.batchNumber.toUpperCase();
      if (bn.startsWith(prefix)) {
        const numStr = bn.slice(prefix.length);
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(2, "0")}`;
}

function emptyRow(): FormRow {
  return {
    productId: "", productName: "", category: "", unit: "", quantityBefore: 0,
    mode: "add", addQuantity: "", shelfLifeDays: "", expiryDate: "", batchNumber: "",
    removeQuantity: "", selectedBatchId: "", search: "",
  };
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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
      position: "fixed", top: r.bottom + 4, left: r.left,
      width: isSearching ? Math.max(r.width, 272) : 560, zIndex: 9999,
    };
  }

  const dropdown = (
    <div ref={portalRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
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
    <div ref={wrapperRef} className="relative w-full" onMouseEnter={doOpen}>
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

  const selected = activeBatches.find((b) => b.id === selectedBatchId);

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
    style = { position: "fixed", top: r.bottom + 4, left: r.left, minWidth: Math.max(r.width, 280), zIndex: 9999 };
  }

  const dropdown = (
    <div ref={portalRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
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
    <div ref={wrapperRef} className="relative w-full">
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

// ─── EXISTING BATCHES CARD ───────────────────────────────────────────────────
function ExistingBatchesCard({ batches, unit }: { batches: Batch[]; unit: string }) {
  const activeBatches = batches.filter((b) => b.quantity > 0);
  const [open, setOpen] = useState(false);
  if (activeBatches.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-[#364F9F]/15 bg-[#364F9F]/3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 bg-[#364F9F]/8 flex items-center gap-2 hover:bg-[#364F9F]/12 transition-colors"
      >
        <Layers className="w-3.5 h-3.5 text-[#364F9F]" />
        <span className="text-[11px] font-bold text-[#364F9F] uppercase tracking-widest flex-1 text-left">
          Existing Batches ({activeBatches.length})
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#364F9F] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="px-4 py-1.5 bg-[#364F9F]/5 border-y border-[#364F9F]/10">
            <div className="grid grid-cols-4 gap-3">
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Batch ID</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Qty Available</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Added Date</span>
              <span className="text-[10px] font-bold text-[#364F9F] uppercase tracking-wider">Expiry Date</span>
            </div>
          </div>
          <div className="divide-y divide-[#364F9F]/10">
            {activeBatches.map((b) => {
              const dl = daysUntil(b.expiryDate);
              const expBg = dl == null ? "bg-gray-100 text-gray-600 border-gray-200"
                : dl < 0 ? "bg-red-50 text-red-700 border-red-200"
                : dl <= 7 ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200";
              const expLabel = dl == null ? "No expiry"
                : dl < 0 ? `Expired ${Math.abs(dl)}d ago`
                : dl === 0 ? "Expires today"
                : `${dl}d left`;

              return (
                <div key={b.id} className="px-4 py-2.5 grid grid-cols-4 gap-3 items-center hover:bg-white/60 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash className="w-3 h-3 text-[#364F9F] flex-shrink-0" />
                    <span className="text-[12px] font-bold text-[#162B4D] truncate">{b.batchNumber || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PackageOpen className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-[12px] font-bold text-[#162B4D]">{b.quantity}</span>
                    <span className="text-[11px] text-gray-400 font-medium">{unit}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-[11px] text-gray-500 font-medium">{formatDate(b.receivedDate)}</span>
                  </div>
                  <div>
                    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${expBg}`}>
                      {b.expiryDate ? formatExpiry(b.expiryDate) : "—"}
                      <span className="ml-1 opacity-75">· {expLabel}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
    const mumbai = superHubs.find((h) => h.name.toLowerCase().includes("mumbai"));
    if (mumbai && !selectedSuperHubId) {
      setSelectedSuperHubId(mumbai.id);
      setSelectedSuperHub(mumbai);
      return;
    }
    if (selectedSuperHubId) return;
    if (adminScope.role === "super_hub" && superHubs.length === 1) {
      setSelectedSuperHubId(superHubs[0].id);
      setSelectedSuperHub(superHubs[0]);
    }
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
    const thane = subHubs.find((h) => h.name.toLowerCase().includes("thane"));
    if (thane && !selectedSubHubId) {
      setSelectedSubHubId(thane.id);
      setSelectedSubHub(thane);
      return;
    }
    if (selectedSubHubId) return;
    if (adminScope.role === "super_hub" && subHubs.length === 1) {
      setSelectedSubHubId(subHubs[0].id);
      setSelectedSubHub(subHubs[0]);
    }
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
    const batches: Batch[] = p.batches ?? [];
    const autoNum = generateNextBatchNumber(p.name, batches);
    setFormRows((rows) => rows.map((r, idx) => idx === i ? {
      ...r,
      productId: p.id, productName: p.name, category: p.category || "",
      unit: p.unit, quantityBefore: p.quantity, search: p.name,
      batchNumber: r.mode === "add" ? autoNum : "",
      selectedBatchId: "",
    } : r));
  }

  function onSearchChange(i: number, val: string) {
    updateRow(i, { search: val, productId: "", productName: "", category: "", unit: "", quantityBefore: 0, batchNumber: "", selectedBatchId: "" });
  }

  function changeMode(i: number, mode: FormMode) {
    const row = formRows[i];
    let batchNumber = "";
    if (mode === "add" && row.productId) {
      const prod = products.find((p) => p.id === row.productId);
      const batches = prod?.batches ?? [];
      batchNumber = generateNextBatchNumber(row.productName, batches);
    }
    updateRow(i, { mode, batchNumber, selectedBatchId: "" });
  }

  function setShelfLife(i: number, val: string) {
    const days = Number(val);
    const expiry = val !== "" && Number.isFinite(days) ? addDaysISO(days) : "";
    updateRow(i, { shelfLifeDays: val, expiryDate: expiry });
  }

  function setExpiryDate(i: number, val: string) {
    updateRow(i, { expiryDate: val, shelfLifeDays: "" });
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
              expiryDate: r.expiryDate || undefined,
              batchNumber: r.batchNumber || undefined,
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
        <p className="text-sm font-bold text-[#162B4D] leading-tight">Inventory Stock Adjustment</p>
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
                            {/* Expiry Date */}
                            <div className="col-span-6 md:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expiry Date</label>
                              <input
                                type="date"
                                value={row.expiryDate}
                                onChange={(e) => setExpiryDate(idx, e.target.value)}
                                className={`w-full h-9 px-2 text-xs font-semibold border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#364F9F]/20 focus:border-[#364F9F] ${expTone}`}
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

                      {/* Batch number row for new batch mode only */}
                      {isAdd && row.productId && (
                        <div className="mt-3 flex items-center gap-3">
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
                          <span className="text-[10px] text-gray-400">Auto-generated from product name · editable</span>
                        </div>
                      )}

                      {/* Existing batches collapsible */}
                      {row.productId && activeBatches.length > 0 && (
                        <ExistingBatchesCard batches={prodBatches} unit={row.unit} />
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
