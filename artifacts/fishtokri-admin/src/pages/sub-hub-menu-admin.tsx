import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "wouter";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, Plus, Edit2, Trash2, Search, X, Package, Tag, Ticket,
  Database, AlertCircle, CheckCircle, XCircle, Image,
  LayoutList, ShoppingBag, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, GripVertical,
  LayoutGrid, List, SlidersHorizontal, ArrowUpDown, Clock,
  Download, Upload, FilePen,
} from "lucide-react";
import recycleIcon from "@/assets/recycling-symbol.png";
import iconMenuProducts from "@/assets/icon-menu-products.png";
import iconMenuCategories from "@/assets/icon-menu-categories.png";
import iconMenuCombos from "@/assets/icon-menu-combos.png";
import iconMenuCoupons from "@/assets/icon-menu-coupons.png";
import iconMenuBanners from "@/assets/icon-menu-banners.png";
import iconMenuSections from "@/assets/icon-menu-sections.png";
import iconMenuTimeslots from "@/assets/icon-menu-timeslots.png";
import iconView from "@/assets/icon-view.png";
import iconEdit from "@/assets/icon-edit.png";
import iconDelete from "@/assets/icon-delete.png";
import { BRAND_COLORS } from "@/lib/brand";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar } from "@/components/pagination-bar";
import { usePaginated } from "@/hooks/use-paginated";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

function SortableItem({ id, children }: { id: string; children: (handle: React.ReactNode, isDragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  const handle = (
    <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none select-none" title="Drag to reorder">
      <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" />
    </span>
  );
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50 shadow-lg rounded-xl" : ""}>
      {children(handle, isDragging)}
    </div>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: React.ReactNode, isDragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const handle = (
    <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none select-none" title="Drag to reorder">
      <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" />
    </span>
  );
  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? "bg-indigo-50 shadow" : "hover:bg-gray-50/50 transition-colors"}>
      {children(handle, isDragging)}
    </tr>
  );
}

function getToken() {
  return localStorage.getItem("fishtokri_token") ?? "";
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

type Tab = "products" | "categories" | "combos" | "coupons" | "carousels" | "sections" | "timeslots";
type Layout = "list" | "grid";

type BatchForm = {
  _id?: string;
  batchNumber: string;
  quantity: string;
  shelfLifeDays: string;
  receivedDate: string;
  expiryDate: string;
  notes: string;
};

function emptyBatch(): BatchForm {
  return { batchNumber: "", quantity: "0", shelfLifeDays: "", receivedDate: new Date().toISOString().slice(0, 10), expiryDate: "", notes: "" };
}

function generateBatchPrefix(productName: string): string {
  const words = productName.trim().toUpperCase().replace(/[^A-Z\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "BAT";
  if (words.length === 1) return words[0].slice(0, 3).padEnd(3, "X");
  return (words[0].slice(0, 2) + words[1].slice(0, 2)).padEnd(4, "X");
}

function generateNextBatchNumber(productName: string, existingBatches: { batchNumber: string }[]): string {
  const prefix = generateBatchPrefix(productName);
  let maxNum = 0;
  for (const b of existingBatches) {
    if (b.batchNumber) {
      const bn = b.batchNumber.toUpperCase();
      if (bn.startsWith(prefix)) {
        const num = parseInt(bn.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(2, "0")}`;
}

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "products", label: "Products", icon: Package },
  { key: "categories", label: "Categories", icon: Tag },
  { key: "combos", label: "Combos", icon: ShoppingBag },
  { key: "coupons", label: "Coupons", icon: Ticket },
  { key: "carousels", label: "Banners", icon: Image },
  { key: "sections", label: "Sections", icon: LayoutList },
  { key: "timeslots", label: "Time Slots", icon: Clock },
];

// ─── SHARED TOOLBAR ───────────────────────────────────────────────────────────
interface SortOption { value: string; label: string }
interface FilterGroup { key: string; label: string; options: { value: string; label: string }[] }

function TabToolbar({
  search, onSearch,
  sortOptions, sortValue, onSortChange,
  filterGroups = [], filterValues = {}, onFilterChange,
  layout, onLayout,
  addLabel, onAdd,
  resultCount, totalCount,
  hideLayoutToggle,
}: {
  search: string; onSearch: (v: string) => void;
  sortOptions: SortOption[]; sortValue: string; onSortChange: (v: string) => void;
  filterGroups?: FilterGroup[]; filterValues?: Record<string, string>; onFilterChange?: (key: string, v: string) => void;
  layout: Layout; onLayout: (v: Layout) => void;
  addLabel: string; onAdd: () => void;
  resultCount: number; totalCount: number;
  hideLayoutToggle?: boolean;
}) {
  const activeFilters = filterGroups.filter((g) => filterValues[g.key] && filterValues[g.key] !== "all");
  const currentSort = sortOptions.find((s) => s.value === sortValue);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button onClick={() => onSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 px-3 text-sm gap-1.5 font-medium text-gray-600">
              <ArrowUpDown className="w-3.5 h-3.5" />
              {currentSort?.label ?? "Sort"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs text-gray-500">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sortOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onSortChange(opt.value)}
                className={`text-sm cursor-pointer ${sortValue === opt.value ? "font-semibold text-[#1A56DB]" : ""}`}
              >
                {sortValue === opt.value && <CheckCircle className="w-3.5 h-3.5 mr-2 text-[#1A56DB]" />}
                {sortValue !== opt.value && <span className="w-3.5 h-3.5 mr-2 inline-block" />}
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filters */}
        {filterGroups.length > 0 && onFilterChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`h-9 px-3 text-sm gap-1.5 font-medium ${activeFilters.length > 0 ? "border-[#1A56DB] text-[#1A56DB] bg-blue-50" : "text-gray-600"}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filter
                {activeFilters.length > 0 && (
                  <span className="ml-0.5 bg-[#1A56DB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {filterGroups.map((group, gi) => (
                <div key={group.key}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs text-gray-500">{group.label}</DropdownMenuLabel>
                  {group.options.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => onFilterChange(group.key, opt.value)}
                      className={`text-sm cursor-pointer ${filterValues[group.key] === opt.value ? "font-semibold text-[#1A56DB]" : ""}`}
                    >
                      {filterValues[group.key] === opt.value
                        ? <CheckCircle className="w-3.5 h-3.5 mr-2 text-[#1A56DB]" />
                        : <span className="w-3.5 h-3.5 mr-2 inline-block" />}
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
              {activeFilters.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => filterGroups.forEach((g) => onFilterChange(g.key, "all"))}
                    className="text-xs text-red-500 cursor-pointer font-medium"
                  >
                    <X className="w-3 h-3 mr-2" /> Clear all filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Layout toggle */}
        {!hideLayoutToggle && (
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => onLayout("list")}
              className={`w-9 h-9 flex items-center justify-center transition-colors ${layout === "list" ? "bg-[#1A56DB] text-white" : "text-gray-400 hover:bg-gray-50"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => onLayout("grid")}
              className={`w-9 h-9 flex items-center justify-center transition-colors border-l border-gray-200 ${layout === "grid" ? "bg-[#1A56DB] text-white" : "text-gray-400 hover:bg-gray-50"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add button */}
        <Button onClick={onAdd} className="bg-[#1A56DB] hover:bg-[#1447B4] text-white h-9 px-4 text-sm font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> {addLabel}
        </Button>
      </div>

      {/* Active filter chips + result count */}
      {(activeFilters.length > 0 || search || resultCount !== totalCount) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">
            {resultCount === totalCount ? `${totalCount} items` : `${resultCount} of ${totalCount}`}
          </span>
          {activeFilters.map((g) => {
            const opt = g.options.find((o) => o.value === filterValues[g.key]);
            return (
              <span key={g.key} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-[#1A56DB] border border-blue-100 px-2 py-0.5 rounded-full font-medium">
                {g.label}: {opt?.label}
                <button onClick={() => onFilterChange!(g.key, "all")} className="hover:text-red-500 ml-0.5"><X className="w-2.5 h-2.5" /></button>
              </span>
            );
          })}
          {search && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full font-medium">
              "{search}"
              <button onClick={() => onSearch("")} className="hover:text-red-500 ml-0.5"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
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

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center text-xs font-semibold bg-green-500 text-white px-3 py-1 rounded-full">Active</span>
    : <span className="inline-flex items-center text-xs font-semibold bg-gray-400 text-white px-3 py-1 rounded-full">Inactive</span>;
}

function ActionButtons({ onView, onEdit, onDelete }: { onView?: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {onView && (
        <button title="View" onClick={onView} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors">
          <MaskIcon src={iconView} color="#1A56DB" className="w-[18px] h-[18px]" />
        </button>
      )}
      <button title="Edit" onClick={onEdit} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors">
        <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
      </button>
      <button title="Delete" onClick={onDelete} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors">
        <MaskIcon src={iconDelete} color="#1A56DB" className="w-[18px] h-[18px]" />
      </button>
    </div>
  );
}

function DeleteDialog({ open, onCancel, onConfirm, title, description }: { open: boolean; onCancel: () => void; onConfirm: () => void; title: string; description: string }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ icon: Icon, message, sub }: { icon: any; message: string; sub?: string }) {
  return (
    <div className="py-16 text-center">
      <Icon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-400 font-medium">{message}</p>
      {sub && <p className="text-gray-300 text-sm mt-1">{sub}</p>}
    </div>
  );
}

// ─── EXCEL HELPERS (module-level) ────────────────────────────────────────────
const parseXlsxFile = (file: File): Promise<any[]> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[]);
    } catch (err) { reject(err); }
  };
  reader.onerror = () => reject(new Error("Failed to read file"));
  reader.readAsArrayBuffer(file);
});

async function buildAndDownloadExcel(
  items: any[],
  columns: { header: string; key: string; width: number }[],
  getRow: (item: any) => Record<string, any>,
  filename: string,
  sheetName: string,
  headerArgb: string,
  validations?: Array<{ col: string; formulae: string[] }>,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns;
  const hRow = ws.getRow(1);
  hRow.font = { bold: true };
  hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerArgb } };
  hRow.alignment = { vertical: "middle" };
  items.forEach((item) => ws.addRow(getRow(item)));
  if (validations?.length) {
    const end = Math.max(items.length + 1, 1) + 100;
    for (let row = 2; row <= end; row++) {
      validations.forEach(({ col, formulae }) => {
        ws.getCell(`${col}${row}`).dataValidation = { type: "list", allowBlank: true, errorStyle: "warning", formulae };
      });
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

type ExcelBarConfig = {
  busy: boolean;
  onImport: () => void;
  onEdit: () => void;
  onExport: () => void;
  onRefresh?: () => void;
  count: number;
} | null;

function ExcelBar({ busy, onImport, onEdit, onExport, count }: {
  busy: boolean;
  onImport: () => void;
  onEdit: () => void;
  onExport: () => void;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Excel</span>
      <button disabled={busy} onClick={onImport} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50 transition-colors">
        <Upload className="w-3.5 h-3.5" /> Import New
      </button>
      <button disabled={busy} onClick={onEdit} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50 transition-colors">
        <FilePen className="w-3.5 h-3.5" /> Edit
      </button>
      <button disabled={busy || count === 0} onClick={onExport} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 disabled:opacity-50 transition-colors">
        <Download className="w-3.5 h-3.5" /> Export ({count})
      </button>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SubHubMenuAdmin() {
  const params = useParams<{ id: string }>();
  const subHubId = params.id;
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("products");
  const [stats, setStats] = useState<any>(null);
  const [subHubName, setSubHubName] = useState("");
  const [dbName, setDbName] = useState("");
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [excelBar, setExcelBar] = useState<ExcelBarConfig>(null);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) { setLoadingStats(true); setStatsError(""); }
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/stats`);
      setStats(data.stats);
      setDbName(data.stats.dbName ?? "");
    } catch (err: any) {
      if (!silent) setStatsError(err.message);
    } finally {
      if (!silent) setLoadingStats(false);
    }
  }, [subHubId]);

  useEffect(() => {
    apiFetch("/api/sub-hubs").then((d) => {
      const sub = d.subHubs?.find((s: any) => s.id === subHubId);
      if (sub) { setSubHubName(sub.name); setDbName(sub.dbName); }
    }).catch(() => {});
    loadStats();
  }, [subHubId, loadStats]);

  useEffect(() => {
    const id = setInterval(() => { loadStats(true); }, 5000);
    return () => clearInterval(id);
  }, [loadStats]);

  const statCards = [
    { label: "Products", value: stats?.products ?? 0, img: iconMenuProducts },
    { label: "Categories", value: stats?.categories ?? 0, img: iconMenuCategories },
    { label: "Combos", value: stats?.combos ?? 0, img: iconMenuCombos },
    { label: "Coupons", value: stats?.coupons ?? 0, img: iconMenuCoupons },
    { label: "Banners", value: stats?.carousels ?? 0, img: iconMenuBanners },
    { label: "Sections", value: stats?.sections ?? 0, img: iconMenuSections },
    { label: "Time Slots", value: stats?.timeslots ?? 0, img: iconMenuTimeslots },
  ];

  const headerSlot = document.getElementById("page-header-slot");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {headerSlot && createPortal(
        <div className="flex items-center w-full gap-3 min-w-0">
          <button
            onClick={() => history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#162B4D] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-bold text-[#162B4D] whitespace-nowrap flex-shrink-0">
            {subHubName || "Sub Hub"} Sub Hub
          </h2>
          {excelBar && (
            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-gray-200">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:inline">Excel</span>
              <button
                disabled={excelBar.busy}
                onClick={excelBar.onImport}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50 transition-colors"
              >
                {excelBar.busy ? <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4-4 4M12 4v12" /></svg>}
                Import
              </button>
              <button
                disabled={excelBar.busy}
                onClick={excelBar.onEdit}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-50 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit
              </button>
              <button
                disabled={excelBar.busy}
                onClick={excelBar.onExport}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg>
                Export ({excelBar.count})
              </button>
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={() => { loadStats(); excelBar?.onRefresh?.(); }}
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
        </div>,
        headerSlot
      )}

      {statsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 font-semibold text-sm">Cannot connect to this sub hub's database</p>
            <p className="text-red-600 text-xs mt-1">{statsError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
        {loadingStats
          ? [1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : statCards.map(({ label, value, img }) => (
            <button
              key={label}
              onClick={() => setTab(TABS.find((t) => t.label === label)?.key ?? tab)}
              className={`bg-white rounded-xl border shadow-sm px-3 py-3 flex flex-col gap-2 text-left transition-all hover:shadow-md ${tab === TABS.find((t) => t.label === label)?.key ? "border-[#1A56DB] ring-1 ring-[#1A56DB]/20" : "border-gray-100"}`}
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              <img src={img} alt={label} className="w-9 h-9 object-contain" />
              <p className="text-2xl font-bold text-black leading-none">{value}</p>
              <p className="text-sm font-semibold text-black">{label}</p>
            </button>
          ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ fontFamily: "Poppins, sans-serif" }}>
        <div className="p-5">
          {!statsError && tab === "products" && <ProductsTab subHubId={subHubId} onSetExcel={setExcelBar} />}
          {!statsError && tab === "categories" && <CategoriesTab subHubId={subHubId} onRefreshStats={loadStats} onSetExcel={setExcelBar} />}
          {!statsError && tab === "combos" && <CombosTab subHubId={subHubId} onSetExcel={setExcelBar} />}
          {!statsError && tab === "coupons" && <CouponsTab subHubId={subHubId} onSetExcel={setExcelBar} />}
          {!statsError && tab === "carousels" && <CarouselsTab subHubId={subHubId} />}
          {!statsError && tab === "sections" && <SectionsTab subHubId={subHubId} onSetExcel={setExcelBar} />}
          {!statsError && tab === "timeslots" && <TimeSlotsTab subHubId={subHubId} onSetExcel={setExcelBar} />}
          {statsError && <div className="py-12 text-center text-gray-400 text-sm">Fix the database connection to manage this sub hub's menu.</div>}
        </div>
      </div>
    </div>
  );
}

// ─── PRODUCTS TAB ─────────────────────────────────────────────────────────────
const PRODUCT_COLS = [
  { key: "name", header: "Name" },
  { key: "description", header: "Description" },
  { key: "category", header: "Category" },
  { key: "subCategory", header: "Sub Category" },
  { key: "price", header: "Price" },
  { key: "originalPrice", header: "MRP" },
  { key: "discountPct", header: "Discount %" },
  { key: "unit", header: "Unit" },
  { key: "pieces", header: "Pieces" },
  { key: "serves", header: "Serves" },
  { key: "quantity", header: "Stock" },
  { key: "status", header: "Status (available/out_of_stock)" },
  { key: "isArchived", header: "Archived (yes/no)" },
  { key: "imageUrl", header: "Image URL" },
  { key: "limitedStockNote", header: "Limited Stock Note" },
];

function ProductsTab({ subHubId, onSetExcel }: { subHubId: string; onSetExcel: (cfg: ExcelBarConfig) => void }) {
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("name_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", category: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [initBatchesBusy, setInitBatchesBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const handleInitBatches = async () => {
    if (!confirm("This will add an initial batch (qty=0) to all products that don't have one yet. Continue?")) return;
    setInitBatchesBusy(true);
    try {
      const data = await apiFetch(`/api/inventory/init-product-batches`, { method: "POST", body: JSON.stringify({ subHubId }) });
      toast({ title: "Batches initialized", description: data.message });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setInitBatchesBusy(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pd, cd] = await Promise.all([
        apiFetch(`/api/sub-hubs/${subHubId}/menu/products`),
        apiFetch(`/api/sub-hubs/${subHubId}/menu/categories`),
      ]);
      setProducts(pd.products ?? []);
      setCategories(cd.categories ?? []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [subHubId, toast]);

  useEffect(() => { load(); }, [load]);

  const sortOptions: SortOption[] = [
    { value: "name_asc", label: "Name A→Z" },
    { value: "name_desc", label: "Name Z→A" },
    { value: "price_asc", label: "Price Low→High" },
    { value: "price_desc", label: "Price High→Low" },
    { value: "discount_desc", label: "Discount High→Low" },
    { value: "qty_desc", label: "Stock High→Low" },
  ];

  const catOptions = [{ value: "all", label: "All Categories" }, ...categories.map((c) => ({ value: c.name, label: c.name }))];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "available", label: "Available" }, { value: "out_of_stock", label: "Out of Stock" }, { value: "archived", label: "Archived" }] },
    { key: "category", label: "Category", options: catOptions },
  ];

  const processed = useMemo(() => {
    let items = [...products];
    if (search) items = items.filter((p) => [p.name, p.category, p.subCategory, p.description].filter(Boolean).some((f: string) => f.toLowerCase().includes(search.toLowerCase())));
    if (filters.status === "available") items = items.filter((p) => p.status === "available" && !p.isArchived);
    if (filters.status === "out_of_stock") items = items.filter((p) => p.status === "out_of_stock");
    if (filters.status === "archived") items = items.filter((p) => p.isArchived === true);
    if (filters.category !== "all") items = items.filter((p) => p.category === filters.category);
    items.sort((a, b) => {
      if (sortValue === "name_asc") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortValue === "name_desc") return (b.name ?? "").localeCompare(a.name ?? "");
      if (sortValue === "price_asc") return (a.price ?? 0) - (b.price ?? 0);
      if (sortValue === "price_desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sortValue === "discount_desc") return (b.discountPct ?? 0) - (a.discountPct ?? 0);
      if (sortValue === "qty_desc") return (b.quantity ?? 0) - (a.quantity ?? 0);
      return 0;
    });
    return items;
  }, [products, search, filters, sortValue]);

  const pagedProducts = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/products/${deleteId}`, { method: "DELETE" });
      toast({ title: "Product deleted" }); load();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const handleExport = async () => {
    if (processed.length === 0) { toast({ title: "Nothing to export", description: "No products match the current filters." }); return; }

    const wb = new ExcelJS.Workbook();

    // Hidden sheet for category dropdown (avoids 255-char Excel inline limit)
    const catNames: string[] = categories.map((c: any) => String(c.name ?? "")).filter(Boolean);
    const listsSheet = wb.addWorksheet("_Lists", { state: "veryHidden" });
    catNames.forEach((name, i) => { listsSheet.getCell(`A${i + 1}`).value = name; });

    const ws = wb.addWorksheet("Products");

    ws.columns = [
      { header: "Name",                            key: "name",             width: 28 },
      { header: "Description",                     key: "description",      width: 40 },
      { header: "Category",                        key: "category",         width: 18 },
      { header: "Price",                           key: "price",            width: 10 },
      { header: "MRP",                             key: "mrp",              width: 10 },
      { header: "Unit",                            key: "unit",             width: 16 },
      { header: "Gross Weight",                    key: "grossWeight",      width: 14 },
      { header: "Net Weight",                      key: "netWeight",        width: 14 },
      { header: "Pieces",                          key: "pieces",           width: 12 },
      { header: "Serves",                          key: "serves",           width: 12 },
      { header: "Stock",                           key: "stock",            width: 10 },
      { header: "Status (available/out_of_stock)", key: "status",           width: 30 },
      { header: "Archived (yes/no)",               key: "archived",         width: 16 },
      { header: "Image URL",                       key: "imageUrl",         width: 40 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6EAF8" } };
    headerRow.alignment = { vertical: "middle" };

    // Add data rows
    processed.forEach((p) => {
      ws.addRow({
        name: p.name ?? "",
        description: p.description ?? "",
        category: p.category ?? "",
        price: p.price ?? 0,
        mrp: p.originalPrice ?? 0,
        unit: p.unit ?? "",
        grossWeight: p.grossWeight ?? "",
        netWeight: p.netWeight ?? "",
        pieces: p.pieces ?? "",
        serves: p.serves ?? "",
        stock: p.quantity ?? 0,
        status: p.status ?? "available",
        archived: p.isArchived ? "yes" : "no",
        imageUrl: p.imageUrl ?? "",
      });
    });

    // Apply dropdown validations to data rows + 200 blank rows for new additions
    const lastDataRow = processed.length + 1;
    const validationEndRow = lastDataRow + 200;

    for (let row = 2; row <= validationEndRow; row++) {
      // Unit dropdown — column F (A=Name, B=Desc, C=Category, D=Price, E=MRP, F=Unit)
      ws.getCell(`F${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Unit",
        error: "Please select a valid unit from the dropdown.",
        formulae: ['"per kg,per 500g,per 250g,per 100g,per tray,per pack,per piece"'],
      };

      // Status dropdown — column L (G=GrossWeight, H=NetWeight, I=Pieces, J=Serves, K=Stock, L=Status)
      ws.getCell(`L${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Status",
        error: "Please select available or out_of_stock.",
        formulae: ['"available,out_of_stock"'],
      };

      // Archived dropdown — column M
      ws.getCell(`M${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Value",
        error: "Please enter yes or no.",
        formulae: ['"yes,no"'],
      };

      // Category dropdown — column C (uses hidden sheet reference to avoid 255-char limit)
      if (catNames.length > 0) {
        ws.getCell(`C${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          showErrorMessage: false,
          formulae: [`_Lists!$A$1:$A$${catNames.length}`],
        };
      }
    }

    // ── RECIPES SHEET ────────────────────────────────────────────────────────
    const recipeWs = wb.addWorksheet("Recipes");
    recipeWs.columns = [
      { header: "Product ID",    key: "productId",    width: 28 },
      { header: "Product Name",  key: "productName",  width: 28 },
      { header: "Recipe Title",  key: "title",        width: 28 },
      { header: "Description",   key: "description",  width: 40 },
      { header: "Prep Time",     key: "prepTime",     width: 12 },
      { header: "Cook Time",     key: "cookTime",     width: 12 },
      { header: "Total Time",    key: "totalTime",    width: 12 },
      { header: "Servings",      key: "servings",     width: 10 },
      { header: "Difficulty",    key: "difficulty",   width: 12 },
      { header: "Ingredients",   key: "ingredients",  width: 50 },
      { header: "Method Steps",  key: "method",       width: 60 },
      { header: "Image URL",     key: "image",        width: 40 },
    ];
    const rHeader = recipeWs.getRow(1);
    rHeader.font = { bold: true };
    rHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD5F5E3" } };
    rHeader.alignment = { vertical: "middle" };

    processed.forEach((p) => {
      const pid = String(p._id ?? "");
      const pname = p.name ?? "";
      (p.recipes ?? []).forEach((r: any) => {
        const ingredientsList = Array.isArray(r.ingredients) ? r.ingredients.join(" | ") : (r.ingredients ?? "");
        const methodList = Array.isArray(r.method) ? r.method.map((s: string, i: number) => `${i + 1}. ${s}`).join(" | ") : (r.method ?? "");
        recipeWs.addRow({
          productId:   pid,
          productName: pname,
          title:       r.title ?? "",
          description: r.description ?? "",
          prepTime:    r.prepTime ?? "",
          cookTime:    r.cookTime ?? "",
          totalTime:   r.totalTime ?? "",
          servings:    r.servings ?? "",
          difficulty:  r.difficulty ?? "",
          ingredients: ingredientsList,
          method:      methodList,
          image:       r.image ?? "",
        });
      });
    });

    // Difficulty dropdown for recipe sheet (col I)
    const recipeDataRows = recipeWs.rowCount;
    for (let row = 2; row <= Math.max(recipeDataRows + 50, 100); row++) {
      recipeWs.getCell(`I${row}`).dataValidation = {
        type: "list", allowBlank: true,
        formulae: ['"Easy,Medium,Hard"'],
      };
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-export-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${processed.length} products` });
  };

  const parseXlsx = (file: File): Promise<any[]> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(rows as any[]);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setXlsxBusy(true);
    try {
      const rawRows = await parseXlsx(file);
      const newRows = rawRows
        .map((r: any) => ({
          name: r["Name"] ?? r["name"] ?? "",
          description: r["Description"] ?? r["description"] ?? "",
          category: r["Category"] ?? r["category"] ?? "",
          price: Number(r["Price"] ?? r["price"] ?? 0),
          originalPrice: Number(r["MRP"] ?? r["originalPrice"] ?? 0),
          unit: r["Unit"] ?? r["unit"] ?? "per kg",
          grossWeight: String(r["Gross Weight"] ?? r["grossWeight"] ?? ""),
          netWeight: String(r["Net Weight"] ?? r["netWeight"] ?? ""),
          pieces: String(r["Pieces"] ?? r["pieces"] ?? ""),
          serves: String(r["Serves"] ?? r["serves"] ?? ""),
          quantity: Number(r["Stock"] ?? r["quantity"] ?? 0),
          status: r["Status (available/out_of_stock)"] ?? r["status"] ?? "available",
          isArchived: r["Archived (yes/no)"] ?? r["isArchived"] ?? "no",
          imageUrl: r["Image URL"] ?? r["imageUrl"] ?? "",
        }))
        .filter((r) => r.name);
      if (newRows.length === 0) { toast({ title: "No valid rows found", description: "Make sure the file has a Name column.", variant: "destructive" }); return; }
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/products/bulk-upsert`, {
        method: "POST", body: JSON.stringify({ products: newRows }),
      });
      toast({ title: `Import complete`, description: `${res.created} products added${res.errors?.length ? `, ${res.errors.length} skipped` : ""}.` });
      load();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleEditFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setXlsxBusy(true);
    try {
      const rawRows = await parseXlsx(file);
      const productMap = new Map(products.map((p) => [String(p._id), p]));
      const toUpdate = rawRows
        .map((r: any) => {
          const id = r["ID (do not edit)"] ?? r["_id"] ?? "";
          const orig = id ? productMap.get(String(id)) : null;
          const row = {
            _id: id,
            name: r["Name"] ?? r["name"] ?? orig?.name ?? "",
            description: r["Description"] ?? r["description"] ?? orig?.description ?? "",
            category: r["Category"] ?? r["category"] ?? orig?.category ?? "",
            price: Number(r["Price"] ?? r["price"] ?? orig?.price ?? 0),
            originalPrice: Number(r["MRP"] ?? r["originalPrice"] ?? orig?.originalPrice ?? 0),
            unit: r["Unit"] ?? r["unit"] ?? orig?.unit ?? "per kg",
            grossWeight: String(r["Gross Weight"] ?? r["grossWeight"] ?? orig?.grossWeight ?? ""),
            netWeight: String(r["Net Weight"] ?? r["netWeight"] ?? orig?.netWeight ?? ""),
            pieces: String(r["Pieces"] ?? r["pieces"] ?? orig?.pieces ?? ""),
            serves: String(r["Serves"] ?? r["serves"] ?? orig?.serves ?? ""),
            quantity: Number(r["Stock"] ?? r["quantity"] ?? orig?.quantity ?? 0),
            status: r["Status (available/out_of_stock)"] ?? r["status"] ?? orig?.status ?? "available",
            isArchived: r["Archived (yes/no)"] ?? r["isArchived"] ?? (orig?.isArchived ? "yes" : "no"),
            imageUrl: r["Image URL"] ?? r["imageUrl"] ?? orig?.imageUrl ?? "",
          };
          if (!row._id || !orig) return null;
          const changed =
            row.name !== orig.name || row.description !== (orig.description ?? "") ||
            row.category !== (orig.category ?? "") ||
            row.price !== orig.price || row.originalPrice !== orig.originalPrice ||
            row.unit !== (orig.unit ?? "") ||
            row.grossWeight !== String(orig.grossWeight ?? "") ||
            row.netWeight !== String(orig.netWeight ?? "") ||
            row.pieces !== String(orig.pieces ?? "") ||
            row.serves !== String(orig.serves ?? "") || row.quantity !== (orig.quantity ?? 0) ||
            row.status !== (orig.status ?? "available") ||
            (String(row.isArchived).toLowerCase() === "yes") !== (orig.isArchived === true) ||
            row.imageUrl !== (orig.imageUrl ?? "");
          return changed ? row : null;
        })
        .filter(Boolean);
      if (toUpdate.length === 0) { toast({ title: "No changes detected", description: "The file matches the current product data." }); return; }
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/products/bulk-upsert`, {
        method: "POST", body: JSON.stringify({ products: toUpdate }),
      });
      toast({ title: `Edit complete`, description: `${res.updated} products updated${res.errors?.length ? `, ${res.errors.length} skipped` : ""}.` });
      load();
    } catch (err: any) { toast({ title: "Edit failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const statusBadge = (p: any) => {
    if (p.isArchived) return <span className="inline-flex items-center text-sm font-semibold bg-gray-500 text-white px-4 py-1.5 rounded-full">Archived</span>;
    if (p.status === "out_of_stock" || (p.quantity ?? 0) === 0) return <span className="inline-flex items-center text-sm font-semibold bg-red-500 text-white px-4 py-1.5 rounded-full">Out of Stock</span>;
    return <span className="inline-flex items-center text-sm font-semibold bg-green-500 text-white px-4 py-1.5 rounded-full">Available</span>;
  };

  const _prodImportClick = useCallback(() => importRef.current?.click(), []);
  const _prodEditClick = useCallback(() => editRef.current?.click(), []);
  const _prodExportRef = useRef(handleExport);
  _prodExportRef.current = handleExport;
  const _prodStableExport = useCallback(() => { _prodExportRef.current(); }, []);
  useEffect(() => {
    onSetExcel({ busy: xlsxBusy, onImport: _prodImportClick, onEdit: _prodEditClick, onExport: _prodStableExport, onRefresh: load, count: processed.length });
    return () => onSetExcel(null);
  }, [xlsxBusy, processed.length, _prodImportClick, _prodEditClick, _prodStableExport, load, onSetExcel]);

  return (
    <div className="space-y-4">
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
      <input ref={editRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleEditFile} />

      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Product" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={products.length}
        hideLayoutToggle
      />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : processed.length === 0 ? (
        <EmptyState icon={Package} message="No products found" sub="Try adjusting your search or filters" />
      ) : (
        <div className="overflow-x-auto" style={{ fontFamily: "Poppins, sans-serif" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide min-w-[220px]">Product</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide">Category</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide">Price</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide">Weight / Unit</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide">Pieces / Serves</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide text-center">Stock</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide text-center">Recipes</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-sm font-bold text-black uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedProducts.pageItems.map((p) => (
                <tr key={String(p._id)} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-black text-base leading-tight">{p.name}</p>
                      {p.description && <p className="text-sm text-black mt-0.5 leading-tight line-clamp-1">{p.description}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-black">{p.category || "—"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-black text-base">₹{p.price}</p>
                    {p.originalPrice > p.price && (
                      <p className="text-sm text-black">
                        <span className="line-through">₹{p.originalPrice}</span>
                        <span className="ml-1 text-green-600 font-semibold">{p.discountPct}% off</span>
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-black font-medium">{p.unit || "—"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-black font-medium">{p.pieces || "—"}</p>
                    {p.serves && <p className="text-sm text-black">{p.serves}</p>}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-base font-bold ${(p.quantity ?? 0) === 0 ? "text-red-500" : (p.lowStockThreshold > 0 && (p.quantity ?? 0) <= p.lowStockThreshold) ? "text-amber-500" : "text-black"}`}>
                        {p.quantity ?? 0}
                      </span>
                      {p.lowStockThreshold > 0 && (p.quantity ?? 0) <= p.lowStockThreshold && (p.quantity ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap">
                          Low Stock
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {Array.isArray(p.recipes) && p.recipes.length > 0
                      ? <span className="inline-flex items-center gap-1 text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-semibold">{p.recipes.length} recipes</span>
                      : <span className="text-black text-sm">—</span>}
                  </td>
                  <td className="px-5 py-4">{statusBadge(p)}</td>
                  <td className="px-5 py-4">
                    <ActionButtons
                      onView={() => { setEditing(p); setModalOpen(true); }}
                      onEdit={() => { setEditing(p); setModalOpen(true); }}
                      onDelete={() => setDeleteId(String(p._id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={pagedProducts.page}
        pages={pagedProducts.pages}
        total={pagedProducts.total}
        onChange={pagedProducts.setPage}
        label="products"
      />

      <ProductModal isOpen={modalOpen} onClose={() => setModalOpen(false)} product={editing} subHubId={subHubId} categories={categories} onSaved={load} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Product" description="This will permanently remove the product from the menu." />
    </div>
  );
}

// ─── CATEGORIES TAB ───────────────────────────────────────────────────────────
function CategoriesTab({ subHubId, onRefreshStats, onSetExcel }: { subHubId: string; onRefreshStats: () => void; onSetExcel: (cfg: ExcelBarConfig) => void }) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("sort_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories`);
      setCategories(data.categories ?? []);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [subHubId, toast]);

  useEffect(() => { load(); }, [load]);

  const catColumns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Image URL", key: "imageUrl", width: 40 },
    { header: "Active (yes/no)", key: "isActive", width: 16 },
    { header: "Sort Order", key: "sortOrder", width: 12 },
    { header: "Sub Categories (pipe-separated names)", key: "subCategories", width: 46 },
  ];
  const catRow = (c: any) => ({
    name: c.name ?? "",
    imageUrl: c.imageUrl ?? "",
    isActive: c.isActive !== false ? "yes" : "no",
    sortOrder: c.sortOrder ?? 0,
    subCategories: Array.isArray(c.subCategories) ? c.subCategories.map((s: any) => s.name ?? s).join("|") : "",
  });

  const handleCatExport = async () => {
    setXlsxBusy(true);
    try {
      await buildAndDownloadExcel(processed, catColumns, catRow, "categories.xlsx", "Categories", "FFCE93D8",
        [{ col: "C", formulae: ['"yes,no"'] }]);
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleCatImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map((r) => ({ name: r["Name"], imageUrl: r["Image URL"] ?? "", isActive: String(r["Active (yes/no)"] ?? "yes"), sortOrder: r["Sort Order"], subCategories: r["Sub Categories (pipe-separated names)"] ?? "" }));
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Import complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load(); onRefreshStats();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleCatEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map((r) => ({ _id: r["ID (do not edit)"] ?? "", name: r["Name"], imageUrl: r["Image URL"] ?? "", isActive: String(r["Active (yes/no)"] ?? "yes"), sortOrder: r["Sort Order"], subCategories: r["Sub Categories (pipe-separated names)"] ?? "" }));
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Edit complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load(); onRefreshStats();
    } catch (err: any) { toast({ title: "Edit failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const sortOptions: SortOption[] = [
    { value: "sort_asc", label: "Sort Order" },
    { value: "name_asc", label: "Name A→Z" },
    { value: "name_desc", label: "Name Z→A" },
    { value: "subcats_desc", label: "Most Sub-categories" },
    { value: "status", label: "Status" },
  ];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  const processed = useMemo(() => {
    let items = [...categories];
    if (search) items = items.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()));
    if (filters.status === "active") items = items.filter((c) => c.isActive !== false);
    if (filters.status === "inactive") items = items.filter((c) => c.isActive === false);
    items.sort((a, b) => {
      if (sortValue === "name_asc") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortValue === "name_desc") return (b.name ?? "").localeCompare(a.name ?? "");
      if (sortValue === "sort_asc") return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (sortValue === "subcats_desc") return (b.subCategories?.length ?? 0) - (a.subCategories?.length ?? 0);
      if (sortValue === "status") return (b.isActive === false ? -1 : 1) - (a.isActive === false ? -1 : 1);
      return 0;
    });
    return items;
  }, [categories, search, filters, sortValue]);

  const pagedCategories = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);
  const isDragMode = sortValue === "sort_asc";
  const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sortOrder ?? 0)) + 1 : 1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const oldIdx = sorted.findIndex(c => String(c._id) === String(active.id));
    const newIdx = sorted.findIndex(c => String(c._id) === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((c, i) => ({ ...c, sortOrder: i + 1 }));
    setCategories(reordered);
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories/reorder`, { method: "PUT", body: JSON.stringify({ items: reordered.map(c => ({ id: String(c._id), sortOrder: c.sortOrder })) }) });
    } catch (err: any) { toast({ title: "Reorder failed", description: err.message, variant: "destructive" }); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories/${deleteId}`, { method: "DELETE" });
      toast({ title: "Category deleted" }); load(); onRefreshStats();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const _catImportClick = useCallback(() => importRef.current?.click(), []);
  const _catEditClick = useCallback(() => editRef.current?.click(), []);
  const _catExportRef = useRef(handleCatExport);
  _catExportRef.current = handleCatExport;
  const _catStableExport = useCallback(() => { _catExportRef.current(); }, []);
  useEffect(() => {
    onSetExcel({ busy: xlsxBusy, onImport: _catImportClick, onEdit: _catEditClick, onExport: _catStableExport, onRefresh: load, count: processed.length });
    return () => onSetExcel(null);
  }, [xlsxBusy, processed.length, _catImportClick, _catEditClick, _catStableExport, load, onSetExcel]);

  return (
    <div className="space-y-4">
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleCatImport} />
      <input ref={editRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleCatEdit} />
      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Category" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={categories.length}
        hideLayoutToggle
      />

      {isDragMode && !loading && categories.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs text-indigo-500 bg-indigo-50 rounded-lg">
          <GripVertical className="w-3 h-3" /><span>Drag categories to reorder — numbers update automatically</span>
        </div>
      )}
      {loading ? <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      : categories.length === 0 ? <EmptyState icon={Tag} message="No categories found" />
      : isDragMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...categories].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map(c => String(c._id))} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {[...categories].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map((c) => {
                const expanded = expandedId === String(c._id);
                return (
                  <SortableItem key={String(c._id)} id={String(c._id)}>
                    {(handle) => (
                      <div className="border border-gray-100 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                          <div className="flex-shrink-0">{handle}</div>
                          {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center flex-shrink-0"><Tag className="w-4 h-4 text-purple-300" /></div>}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#162B4D] text-sm">{c.name}</p>
                              <StatusBadge active={c.isActive !== false} />
                            </div>
                            {Array.isArray(c.subCategories) && c.subCategories.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{c.subCategories.length} sub-categories</p>}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">#{c.sortOrder ?? 0}</span>
                          <div className="flex items-center gap-1">
                            {Array.isArray(c.subCategories) && c.subCategories.length > 0 && (
                              <button onClick={() => setExpandedId(expanded ? null : String(c._id))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
                                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                            <ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} />
                          </div>
                        </div>
                        {expanded && Array.isArray(c.subCategories) && c.subCategories.length > 0 && (
                          <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {c.subCategories.map((s: any) => <span key={s.name} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-full">{s.name}</span>)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </SortableItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {pagedCategories.pageItems.map((c) => {
            const expanded = expandedId === String(c._id);
            return (
              <div key={String(c._id)} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                  {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center flex-shrink-0"><Tag className="w-4 h-4 text-purple-300" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#162B4D] text-sm">{c.name}</p>
                      <StatusBadge active={c.isActive !== false} />
                    </div>
                    {Array.isArray(c.subCategories) && c.subCategories.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{c.subCategories.length} sub-categories</p>}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">#{c.sortOrder ?? 0}</span>
                  <div className="flex items-center gap-1">
                    {Array.isArray(c.subCategories) && c.subCategories.length > 0 && (
                      <button onClick={() => setExpandedId(expanded ? null : String(c._id))} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                    <ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} />
                  </div>
                </div>
                {expanded && Array.isArray(c.subCategories) && c.subCategories.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.subCategories.map((s: any) => <span key={s.name} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-full">{s.name}</span>)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PaginationBar
        page={pagedCategories.page}
        pages={pagedCategories.pages}
        total={pagedCategories.total}
        onChange={pagedCategories.setPage}
        label="categories"
      />

      <CategoryModal isOpen={modalOpen} onClose={() => setModalOpen(false)} category={editing} subHubId={subHubId} onSaved={() => { load(); onRefreshStats(); }} nextOrder={nextOrder} allItems={categories} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Category" description="This will permanently remove the category." />
    </div>
  );
}

// ─── COMBOS TAB ───────────────────────────────────────────────────────────────
function CombosTab({ subHubId, onSetExcel }: { subHubId: string; onSetExcel: (cfg: ExcelBarConfig) => void }) {
  const { toast } = useToast();
  const [combos, setCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("sort_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos`);
      setCombos(data.combos ?? []);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [subHubId, toast]);

  useEffect(() => { load(); }, [load]);

  const comboColumns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Description", key: "description", width: 40 },
    { header: "Serves", key: "serves", width: 14 },
    { header: "Weight", key: "weight", width: 14 },
    { header: "Sale Price", key: "discountedPrice", width: 14 },
    { header: "Original Price", key: "originalPrice", width: 14 },
    { header: "Discount %", key: "discount", width: 13 },
    { header: "Includes (pipe-separated)", key: "includes", width: 40 },
    { header: "Tags (pipe-separated)", key: "tags", width: 30 },
    { header: "Active (yes/no)", key: "isActive", width: 16 },
    { header: "Sort Order", key: "sortOrder", width: 12 },
  ];
  const comboRow = (c: any) => ({
    name: c.name ?? "", description: c.description ?? "",
    serves: c.serves ?? "", weight: c.weight ?? "",
    discountedPrice: c.discountedPrice ?? 0, originalPrice: c.originalPrice ?? 0, discount: c.discount ?? 0,
    includes: Array.isArray(c.includes) ? c.includes.join("|") : "",
    tags: Array.isArray(c.tags) ? c.tags.join("|") : "",
    isActive: c.isActive !== false ? "yes" : "no", sortOrder: c.sortOrder ?? 0,
  });
  const parseComboRow = (r: any) => ({
    _id: r["ID (do not edit)"] ?? "", name: r["Name"], description: r["Description"] ?? "",
    serves: r["Serves"] ?? "", weight: r["Weight"] ?? "",
    discountedPrice: r["Sale Price"], originalPrice: r["Original Price"], discount: r["Discount %"],
    includes: r["Includes (pipe-separated)"] ?? "", tags: r["Tags (pipe-separated)"] ?? "",
    isActive: String(r["Active (yes/no)"] ?? "yes"), sortOrder: r["Sort Order"],
  });

  const handleComboExport = async () => {
    setXlsxBusy(true);
    try {
      await buildAndDownloadExcel(processed, comboColumns, comboRow, "combos.xlsx", "Combos", "FFB8CCE4",
        [{ col: "J", formulae: ['"yes,no"'] }]);
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleComboImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseComboRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Import complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleComboEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseComboRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Edit complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Edit failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const sortOptions: SortOption[] = [
    { value: "sort_asc", label: "Sort Order" },
    { value: "name_asc", label: "Name A→Z" },
    { value: "name_desc", label: "Name Z→A" },
    { value: "price_asc", label: "Price Low→High" },
    { value: "price_desc", label: "Price High→Low" },
    { value: "discount_desc", label: "Discount High→Low" },
  ];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  const processed = useMemo(() => {
    let items = [...combos];
    if (search) items = items.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase()));
    if (filters.status === "active") items = items.filter((c) => c.isActive !== false);
    if (filters.status === "inactive") items = items.filter((c) => c.isActive === false);
    items.sort((a, b) => {
      if (sortValue === "name_asc") return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortValue === "name_desc") return (b.name ?? "").localeCompare(a.name ?? "");
      if (sortValue === "price_asc") return (a.price ?? 0) - (b.price ?? 0);
      if (sortValue === "price_desc") return (b.price ?? 0) - (a.price ?? 0);
      if (sortValue === "discount_desc") return (b.discount ?? 0) - (a.discount ?? 0);
      if (sortValue === "sort_asc") return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return 0;
    });
    return items;
  }, [combos, search, filters, sortValue]);

  const pagedCombos = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);
  const isDragMode = sortValue === "sort_asc";
  const nextOrder = combos.length > 0 ? Math.max(...combos.map(c => c.sortOrder ?? 0)) + 1 : 1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...combos].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const oldIdx = sorted.findIndex(c => String(c._id) === String(active.id));
    const newIdx = sorted.findIndex(c => String(c._id) === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((c, i) => ({ ...c, sortOrder: i + 1 }));
    setCombos(reordered);
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos/reorder`, { method: "PUT", body: JSON.stringify({ items: reordered.map(c => ({ id: String(c._id), sortOrder: c.sortOrder })) }) });
    } catch (err: any) { toast({ title: "Reorder failed", description: err.message, variant: "destructive" }); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos/${deleteId}`, { method: "DELETE" });
      toast({ title: "Combo deleted" }); load();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const _comboImportClick = useCallback(() => importRef.current?.click(), []);
  const _comboEditClick = useCallback(() => editRef.current?.click(), []);
  const _comboExportRef = useRef(handleComboExport);
  _comboExportRef.current = handleComboExport;
  const _comboStableExport = useCallback(() => { _comboExportRef.current(); }, []);
  useEffect(() => {
    onSetExcel({ busy: xlsxBusy, onImport: _comboImportClick, onEdit: _comboEditClick, onExport: _comboStableExport, onRefresh: load, count: processed.length });
    return () => onSetExcel(null);
  }, [xlsxBusy, processed.length, _comboImportClick, _comboEditClick, _comboStableExport, load, onSetExcel]);

  return (
    <div className="space-y-4">
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleComboImport} />
      <input ref={editRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleComboEdit} />
      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Combo" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={combos.length}
        hideLayoutToggle
      />

      {isDragMode && !loading && combos.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs text-indigo-500 bg-indigo-50 rounded-lg">
          <GripVertical className="w-3 h-3" /><span>Drag combos to reorder — numbers update automatically</span>
        </div>
      )}
      {loading ? <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      : combos.length === 0 ? <EmptyState icon={ShoppingBag} message="No combos found" />
      : isDragMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...combos].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map(c => String(c._id))} strategy={verticalListSortingStrategy}>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Combo</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {[...combos].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map((c) => (
                    <SortableRow key={String(c._id)} id={String(c._id)}>
                      {(handle) => (
                        <>
                          <td className="px-3 py-3">{handle}</td>
                          <td className="px-4 py-3 text-xs font-bold text-gray-400">#{c.sortOrder ?? 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-9 h-9 rounded-lg object-cover border border-gray-100 flex-shrink-0" /> : <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0"><ShoppingBag className="w-4 h-4 text-indigo-200" /></div>}
                              <div><p className="font-semibold text-[#162B4D] text-sm">{c.name}</p>{c.description && <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.description}</p>}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className="font-bold text-[#162B4D]">₹{c.discountedPrice ?? c.price}</span>{c.originalPrice > (c.discountedPrice ?? c.price) && <span className="text-xs text-gray-400 line-through ml-1">₹{c.originalPrice}</span>}</td>
                          <td className="px-4 py-3">{c.discount > 0 ? <span className="text-xs bg-green-50 text-green-600 font-semibold px-1.5 py-0.5 rounded-full">{c.discount}% off</span> : "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{Array.isArray(c.includes) ? c.includes.length : 0}</td>
                          <td className="px-4 py-3"><StatusBadge active={c.isActive !== false} /></td>
                          <td className="px-4 py-3"><ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} /></td>
                        </>
                      )}
                    </SortableRow>
                  ))}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Combo</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {pagedCombos.pageItems.map((c) => {
                return (
                  <tr key={String(c._id)} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-9 h-9 rounded-lg object-cover border border-gray-100 flex-shrink-0" /> : <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0"><ShoppingBag className="w-4 h-4 text-indigo-200" /></div>}
                        <div>
                          <p className="font-semibold text-[#162B4D] text-sm">{c.name}</p>
                          {c.description && <p className="text-xs text-gray-400 truncate max-w-[180px]">{c.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="font-bold text-[#162B4D]">₹{c.discountedPrice ?? c.price}</span>{c.originalPrice > (c.discountedPrice ?? c.price) && <span className="text-xs text-gray-400 line-through ml-1">₹{c.originalPrice}</span>}</td>
                    <td className="px-4 py-3">{c.discount > 0 ? <span className="text-xs bg-green-50 text-green-600 font-semibold px-1.5 py-0.5 rounded-full">{c.discount}% off</span> : "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{Array.isArray(c.includes) ? c.includes.length : 0}</td>
                    <td className="px-4 py-3"><StatusBadge active={c.isActive !== false} /></td>
                    <td className="px-4 py-3"><ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={pagedCombos.page}
        pages={pagedCombos.pages}
        total={pagedCombos.total}
        onChange={pagedCombos.setPage}
        label="combos"
      />

      <ComboModal isOpen={modalOpen} onClose={() => setModalOpen(false)} combo={editing} subHubId={subHubId} onSaved={load} nextOrder={nextOrder} allItems={combos} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Combo" description="This will permanently remove the combo." />
    </div>
  );
}

// ─── COUPONS TAB ──────────────────────────────────────────────────────────────
function CouponsTab({ subHubId, onSetExcel }: { subHubId: string; onSetExcel: (cfg: ExcelBarConfig) => void }) {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("code_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", type: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons`);
      setCoupons(data.coupons ?? []);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [subHubId, toast]);

  useEffect(() => { load(); }, [load]);

  const couponColumns = [
    { header: "Code", key: "code", width: 18 },
    { header: "Title", key: "title", width: 28 },
    { header: "Description", key: "description", width: 40 },
    { header: "Type (percentage/flat)", key: "type", width: 22 },
    { header: "Discount Value", key: "discountValue", width: 16 },
    { header: "Min Order Amount", key: "minOrderAmount", width: 18 },
    { header: "Max Usage", key: "maxUsage", width: 12 },
    { header: "First Time Only (yes/no)", key: "isFirstTimeOnly", width: 24 },
    { header: "Active (yes/no)", key: "isActive", width: 16 },
    { header: "Expires At", key: "expiresAt", width: 20 },
  ];
  const couponRow = (c: any) => ({
    code: c.code ?? "", title: c.title ?? "", description: c.description ?? "",
    type: c.type ?? "percentage", discountValue: c.discountValue ?? 0, minOrderAmount: c.minOrderAmount ?? 0,
    maxUsage: c.maxUsage ?? "", isFirstTimeOnly: c.isFirstTimeOnly ? "yes" : "no",
    isActive: c.isActive !== false ? "yes" : "no",
    expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : "",
  });
  const parseCouponRow = (r: any) => ({
    _id: r["ID (do not edit)"] ?? "", code: r["Code"], title: r["Title"] ?? "", description: r["Description"] ?? "",
    type: r["Type (percentage/flat)"], discountValue: r["Discount Value"], minOrderAmount: r["Min Order Amount"],
    maxUsage: r["Max Usage"], isFirstTimeOnly: String(r["First Time Only (yes/no)"] ?? "no"),
    isActive: String(r["Active (yes/no)"] ?? "yes"), expiresAt: r["Expires At"] ?? "",
  });

  const handleCouponExport = async () => {
    setXlsxBusy(true);
    try {
      await buildAndDownloadExcel(processed, couponColumns, couponRow, "coupons.xlsx", "Coupons", "FFFCE4D6",
        [{ col: "D", formulae: ['"percentage,flat"'] }, { col: "H", formulae: ['"yes,no"'] }, { col: "I", formulae: ['"yes,no"'] }]);
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleCouponImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseCouponRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Import complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleCouponEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseCouponRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Edit complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Edit failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const sortOptions: SortOption[] = [
    { value: "code_asc", label: "Code A→Z" },
    { value: "discount_desc", label: "Discount High→Low" },
    { value: "minorder_asc", label: "Min Order Low→High" },
    { value: "expiry_asc", label: "Expiry Soonest" },
  ];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
    { key: "type", label: "Type", options: [{ value: "all", label: "All Types" }, { value: "percentage", label: "Percentage" }, { value: "flat", label: "Flat" }] },
    { key: "firstTime", label: "Eligibility", options: [{ value: "all", label: "All" }, { value: "yes", label: "First Time Only" }] },
  ];

  const processed = useMemo(() => {
    let items = [...coupons];
    if (search) items = items.filter((c) => c.code?.toLowerCase().includes(search.toLowerCase()));
    if (filters.status === "active") items = items.filter((c) => c.isActive !== false);
    if (filters.status === "inactive") items = items.filter((c) => c.isActive === false);
    if (filters.type !== "all") items = items.filter((c) => c.type === filters.type);
    if (filters.firstTime === "yes") items = items.filter((c) => c.isFirstTimeOnly === true);
    items.sort((a, b) => {
      if (sortValue === "code_asc") return (a.code ?? "").localeCompare(b.code ?? "");
      if (sortValue === "discount_desc") return (b.discountValue ?? 0) - (a.discountValue ?? 0);
      if (sortValue === "minorder_asc") return (a.minOrderAmount ?? 0) - (b.minOrderAmount ?? 0);
      if (sortValue === "expiry_asc") return new Date(a.expiresAt ?? "9999").getTime() - new Date(b.expiresAt ?? "9999").getTime();
      return 0;
    });
    return items;
  }, [coupons, search, filters, sortValue]);

  const pagedCoupons = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons/${deleteId}`, { method: "DELETE" });
      toast({ title: "Coupon deleted" }); load();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const _couponImportClick = useCallback(() => importRef.current?.click(), []);
  const _couponEditClick = useCallback(() => editRef.current?.click(), []);
  const _couponExportRef = useRef(handleCouponExport);
  _couponExportRef.current = handleCouponExport;
  const _couponStableExport = useCallback(() => { _couponExportRef.current(); }, []);
  useEffect(() => {
    onSetExcel({ busy: xlsxBusy, onImport: _couponImportClick, onEdit: _couponEditClick, onExport: _couponStableExport, onRefresh: load, count: processed.length });
    return () => onSetExcel(null);
  }, [xlsxBusy, processed.length, _couponImportClick, _couponEditClick, _couponStableExport, load, onSetExcel]);

  return (
    <div className="space-y-4">
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleCouponImport} />
      <input ref={editRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleCouponEdit} />
      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Coupon" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={coupons.length}
        hideLayoutToggle
      />

      {loading ? <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      : processed.length === 0 ? <EmptyState icon={Ticket} message="No coupons found" />
      : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Min Order</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Max Uses</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {pagedCoupons.pageItems.map((c) => (
                <tr key={String(c._id)} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-[#162B4D] text-sm tracking-wider bg-gray-100 px-2 py-0.5 rounded">{c.code}</span>
                    {c.isFirstTimeOnly && <span className="ml-2 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-semibold">1st Time</span>}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-500 text-xs">{c.type}</td>
                  <td className="px-4 py-3 font-semibold text-[#162B4D]">{c.type === "percentage" ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">₹{c.minOrderAmount}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.maxUsage ? `${c.maxUsage} per customer` : "Unlimited"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN") : "No expiry"}</td>
                  <td className="px-4 py-3"><StatusBadge active={c.isActive !== false} /></td>
                  <td className="px-4 py-3"><ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        page={pagedCoupons.page}
        pages={pagedCoupons.pages}
        total={pagedCoupons.total}
        onChange={pagedCoupons.setPage}
        label="coupons"
      />

      <CouponModal isOpen={modalOpen} onClose={() => setModalOpen(false)} coupon={editing} subHubId={subHubId} onSaved={load} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Coupon" description="This will permanently remove the coupon." />
    </div>
  );
}

// ─── CAROUSELS TAB ────────────────────────────────────────────────────────────
function CarouselsTab({ subHubId }: { subHubId: string }) {
  const { toast } = useToast();
  const [carousels, setCarousels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("order_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/carousels`);
      setCarousels(data.carousels ?? []);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [subHubId, toast]);

  useEffect(() => { load(); }, [load]);

  const sortOptions: SortOption[] = [
    { value: "order_asc", label: "Display Order" },
    { value: "title_asc", label: "Title A→Z" },
    { value: "status", label: "Status" },
  ];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  const processed = useMemo(() => {
    let items = [...carousels];
    if (search) items = items.filter((c) => c.title?.toLowerCase().includes(search.toLowerCase()) || c.imageUrl?.toLowerCase().includes(search.toLowerCase()));
    if (filters.status === "active") items = items.filter((c) => c.isActive !== false);
    if (filters.status === "inactive") items = items.filter((c) => c.isActive === false);
    items.sort((a, b) => {
      if (sortValue === "order_asc") return (a.order ?? 0) - (b.order ?? 0);
      if (sortValue === "title_asc") return (a.title ?? "").localeCompare(b.title ?? "");
      if (sortValue === "status") return (b.isActive === false ? -1 : 1) - (a.isActive === false ? -1 : 1);
      return 0;
    });
    return items;
  }, [carousels, search, filters, sortValue]);

  const pagedCarousels = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);
  const isDragMode = sortValue === "order_asc";
  const nextOrder = carousels.length > 0 ? Math.max(...carousels.map(c => c.order ?? 0)) + 1 : 1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...carousels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const oldIdx = sorted.findIndex(c => String(c._id) === String(active.id));
    const newIdx = sorted.findIndex(c => String(c._id) === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((c, i) => ({ ...c, order: i + 1 }));
    setCarousels(reordered);
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/carousels/reorder`, { method: "PUT", body: JSON.stringify({ items: reordered.map(c => ({ id: String(c._id), order: c.order })) }) });
    } catch (err: any) { toast({ title: "Reorder failed", description: err.message, variant: "destructive" }); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/carousels/${deleteId}`, { method: "DELETE" });
      toast({ title: "Banner deleted" }); load();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const toggleStatus = async (c: any) => {
    const newActive = !(c.isActive !== false);
    setCarousels((prev) => prev.map((x) => String(x._id) === String(c._id) ? { ...x, isActive: newActive } : x));
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/carousels/${c._id}`, { method: "PUT", body: JSON.stringify({ isActive: newActive }) });
    } catch (err: any) {
      setCarousels((prev) => prev.map((x) => String(x._id) === String(c._id) ? { ...x, isActive: !newActive } : x));
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Banner" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={carousels.length}
        hideLayoutToggle
      />

      {isDragMode && !loading && carousels.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs text-indigo-500 bg-indigo-50 rounded-lg">
          <GripVertical className="w-3 h-3" /><span>Drag banners to reorder — numbers update automatically</span>
        </div>
      )}
      {loading ? <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      : carousels.length === 0 ? <EmptyState icon={Image} message="No banners found" />
      : isDragMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...carousels].sort((a,b)=>(a.order??0)-(b.order??0)).map(c => String(c._id))} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {[...carousels].sort((a,b)=>(a.order??0)-(b.order??0)).map((c) => (
                <SortableItem key={String(c._id)} id={String(c._id)}>
                  {(handle) => (
                    <div className="border border-gray-100 rounded-xl overflow-hidden flex gap-3 bg-white p-3 hover:shadow-sm transition-shadow items-center">
                      <div className="flex items-center gap-2 flex-shrink-0">{handle}<span className="text-xs font-bold text-gray-400">#{c.order}</span></div>
                      <div className="w-28 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                        {c.imageUrl ? <img src={c.imageUrl} alt={c.title ?? "Banner"} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Image className="w-4 h-4 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#162B4D] text-sm">{c.title || <span className="text-gray-400 font-normal italic">No title</span>}</p>
                        {c.linkUrl && <p className="text-xs text-gray-400 truncate">{c.linkUrl}</p>}
                      </div>
                      <Switch checked={c.isActive !== false} onCheckedChange={() => toggleStatus(c)} className="data-[state=checked]:bg-[#1A56DB] data-[state=unchecked]:bg-gray-400 flex-shrink-0" />
                      <ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} />
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-3">
          {pagedCarousels.pageItems.map((c) => (
            <div key={String(c._id)} className="border border-gray-100 rounded-xl overflow-hidden flex gap-3 bg-white p-3 hover:shadow-sm transition-shadow items-center">
              <div className="flex items-center gap-2 text-gray-300 flex-shrink-0">
                <GripVertical className="w-4 h-4" />
                <span className="text-xs font-bold text-gray-400">#{c.order}</span>
              </div>
              <div className="w-28 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                {c.imageUrl ? <img src={c.imageUrl} alt={c.title ?? "Banner"} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Image className="w-4 h-4 text-gray-300" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#162B4D] text-sm">{c.title || <span className="text-gray-400 font-normal italic">No title</span>}</p>
                {c.linkUrl && <p className="text-xs text-gray-400 truncate">{c.linkUrl}</p>}
              </div>
              <Switch checked={c.isActive !== false} onCheckedChange={() => toggleStatus(c)} className="data-[state=checked]:bg-[#1A56DB] data-[state=unchecked]:bg-gray-400 flex-shrink-0" />
              <ActionButtons onEdit={() => { setEditing(c); setModalOpen(true); }} onDelete={() => setDeleteId(String(c._id))} />
            </div>
          ))}
        </div>
      )}

      <PaginationBar
        page={pagedCarousels.page}
        pages={pagedCarousels.pages}
        total={pagedCarousels.total}
        onChange={pagedCarousels.setPage}
        label="banners"
      />

      <CarouselModal isOpen={modalOpen} onClose={() => setModalOpen(false)} carousel={editing} subHubId={subHubId} onSaved={load} nextOrder={nextOrder} allItems={carousels} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Banner" description="This will permanently remove the banner from the carousel." />
    </div>
  );
}

// ─── SECTIONS TAB ─────────────────────────────────────────────────────────────
function SectionsTab({ subHubId, onSetExcel }: { subHubId: string; onSetExcel: (cfg: ExcelBarConfig) => void }) {
  const { toast } = useToast();
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("sort_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", type: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections`);
      setSections(data.sections ?? []);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [subHubId, toast]);

  const sectionColumns = [
    { header: "Title", key: "title", width: 28 },
    { header: "Type (products/combos/categories/carousels)", key: "type", width: 42 },
    { header: "Sort Order", key: "sortOrder", width: 12 },
    { header: "Active (yes/no)", key: "isActive", width: 16 },
  ];
  const sectionRow = (s: any) => ({ title: s.title ?? "", type: s.type ?? "products", sortOrder: s.sortOrder ?? 0, isActive: s.isActive !== false ? "yes" : "no" });
  const parseSectionRow = (r: any) => ({ _id: r["ID (do not edit)"] ?? "", title: r["Title"], type: r["Type (products/combos/categories/carousels)"], sortOrder: r["Sort Order"], isActive: String(r["Active (yes/no)"] ?? "yes") });

  const handleSectionExport = async () => {
    setXlsxBusy(true);
    try {
      await buildAndDownloadExcel(processed, sectionColumns, sectionRow, "sections.xlsx", "Sections", "FFD9EAD3",
        [{ col: "B", formulae: ['"products,combos,categories,carousels"'] }, { col: "D", formulae: ['"yes,no"'] }]);
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleSectionImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseSectionRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Import complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleSectionEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseSectionRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Edit complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Edit failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  useEffect(() => { load(); }, [load]);

  const sortOptions: SortOption[] = [
    { value: "sort_asc", label: "Sort Order" },
    { value: "title_asc", label: "Title A→Z" },
    { value: "title_desc", label: "Title Z→A" },
    { value: "type", label: "Content Type" },
  ];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
    { key: "type", label: "Content Type", options: [{ value: "all", label: "All Types" }, { value: "products", label: "Products" }, { value: "combos", label: "Combos" }, { value: "categories", label: "Categories" }, { value: "carousels", label: "Carousels" }] },
  ];

  const TYPE_COLORS: Record<string, string> = {
    products: "bg-blue-50 text-blue-600 border-blue-100",
    combos: "bg-indigo-50 text-indigo-600 border-indigo-100",
    categories: "bg-purple-50 text-purple-600 border-purple-100",
    carousels: "bg-pink-50 text-pink-600 border-pink-100",
  };

  const processed = useMemo(() => {
    let items = [...sections];
    if (search) items = items.filter((s) => s.title?.toLowerCase().includes(search.toLowerCase()));
    if (filters.status === "active") items = items.filter((s) => s.isActive !== false);
    if (filters.status === "inactive") items = items.filter((s) => s.isActive === false);
    if (filters.type !== "all") items = items.filter((s) => s.type === filters.type);
    items.sort((a, b) => {
      if (sortValue === "title_asc") return (a.title ?? "").localeCompare(b.title ?? "");
      if (sortValue === "title_desc") return (b.title ?? "").localeCompare(a.title ?? "");
      if (sortValue === "type") return (a.type ?? "").localeCompare(b.type ?? "");
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    return items;
  }, [sections, search, filters, sortValue]);

  const pagedSections = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);
  const isDragMode = sortValue === "sort_asc";
  const nextOrder = sections.length > 0 ? Math.max(...sections.map(s => s.sortOrder ?? 0)) + 1 : 1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...sections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const oldIdx = sorted.findIndex(s => String(s._id) === String(active.id));
    const newIdx = sorted.findIndex(s => String(s._id) === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((s, i) => ({ ...s, sortOrder: i + 1 }));
    setSections(reordered);
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections/reorder`, { method: "PUT", body: JSON.stringify({ items: reordered.map(s => ({ id: String(s._id), sortOrder: s.sortOrder })) }) });
    } catch (err: any) { toast({ title: "Reorder failed", description: err.message, variant: "destructive" }); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections/${deleteId}`, { method: "DELETE" });
      toast({ title: "Section deleted" }); load();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const _sectionImportClick = useCallback(() => importRef.current?.click(), []);
  const _sectionEditClick = useCallback(() => editRef.current?.click(), []);
  const _sectionExportRef = useRef(handleSectionExport);
  _sectionExportRef.current = handleSectionExport;
  const _sectionStableExport = useCallback(() => { _sectionExportRef.current(); }, []);
  useEffect(() => {
    onSetExcel({ busy: xlsxBusy, onImport: _sectionImportClick, onEdit: _sectionEditClick, onExport: _sectionStableExport, onRefresh: load, count: processed.length });
    return () => onSetExcel(null);
  }, [xlsxBusy, processed.length, _sectionImportClick, _sectionEditClick, _sectionStableExport, load, onSetExcel]);

  return (
    <div className="space-y-4">
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSectionImport} />
      <input ref={editRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSectionEdit} />
      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Section" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={sections.length}
        hideLayoutToggle
      />

      {isDragMode && !loading && sections.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs text-indigo-500 bg-indigo-50 rounded-lg">
          <GripVertical className="w-3 h-3" /><span>Drag sections to reorder — numbers update automatically</span>
        </div>
      )}
      {loading ? <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      : sections.length === 0 ? <EmptyState icon={LayoutList} message="No sections found" />
      : isDragMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...sections].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map(s => String(s._id))} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {[...sections].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map((s) => (
                <SortableItem key={String(s._id)} id={String(s._id)}>
                  {(handle) => (
                    <div className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-2 flex-shrink-0">{handle}<span className="text-xs font-bold text-gray-400">#{s.sortOrder}</span></div>
                      <p className="font-semibold text-[#162B4D] text-sm flex-1 min-w-0 truncate">{s.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize border flex-shrink-0 ${TYPE_COLORS[s.type] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>{s.type}</span>
                      <StatusBadge active={s.isActive !== false} />
                      <ActionButtons onEdit={() => { setEditing(s); setModalOpen(true); }} onDelete={() => setDeleteId(String(s._id))} />
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {pagedSections.pageItems.map((s) => (
            <div key={String(s._id)} className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center gap-2 text-gray-300 flex-shrink-0">
                <GripVertical className="w-4 h-4" />
                <span className="text-xs font-bold text-gray-400">#{s.sortOrder}</span>
              </div>
              <p className="font-semibold text-[#162B4D] text-sm flex-1 min-w-0 truncate">{s.title}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize border flex-shrink-0 ${TYPE_COLORS[s.type] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>{s.type}</span>
              <StatusBadge active={s.isActive !== false} />
              <ActionButtons onEdit={() => { setEditing(s); setModalOpen(true); }} onDelete={() => setDeleteId(String(s._id))} />
            </div>
          ))}
        </div>
      )}

      <PaginationBar
        page={pagedSections.page}
        pages={pagedSections.pages}
        total={pagedSections.total}
        onChange={pagedSections.setPage}
        label="sections"
      />

      <SectionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} section={editing} subHubId={subHubId} onSaved={load} nextOrder={nextOrder} allItems={sections} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Section" description="This will permanently remove this homepage section." />
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
const BLANK_RECIPE = () => ({
  title: "", description: "", image: "",
  totalTime: "", prepTime: "", cookTime: "",
  servings: 2, difficulty: "Medium",
  ingredients: [""], method: [""],
});

function RecipeEditor({ recipe, onChange, onRemove }: { recipe: any; onChange: (r: any) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [imageMode, setImageMode] = useState<"url" | "upload">("url");
  const [imageUploading, setImageUploading] = useState(false);
  const upd = (k: string, v: any) => onChange({ ...recipe, [k]: v });

  const handleImageFile = async (file: File) => {
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/upload?folder=fishtokri/recipes", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      upd("image", data.url);
    } catch (err: any) {
      alert(err.message ?? "Upload failed");
    } finally {
      setImageUploading(false);
    }
  };
  const updList = (k: string, i: number, v: string) => onChange({ ...recipe, [k]: recipe[k].map((x: string, idx: number) => idx === i ? v : x) });
  const addItem = (k: string) => onChange({ ...recipe, [k]: [...recipe[k], ""] });
  const removeItem = (k: string, i: number) => onChange({ ...recipe, [k]: recipe[k].filter((_: any, idx: number) => idx !== i) });

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 hover:bg-gray-50 transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <p className="font-medium text-[#162B4D] text-sm truncate">{recipe.title || <span className="text-gray-400 italic font-normal">Untitled Recipe</span>}</p>
          {recipe.totalTime && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{recipe.totalTime}</span>}
          {recipe.difficulty && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{recipe.difficulty}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          {/* Title + Description */}
          <div className="space-y-2">
            <div className="space-y-1"><Label className="text-xs font-semibold text-gray-500">Recipe Title *</Label><Input value={recipe.title} onChange={(e) => upd("title", e.target.value)} placeholder="e.g. Classic Chicken Curry" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs font-semibold text-gray-500">Description</Label><textarea value={recipe.description} onChange={(e) => upd("description", e.target.value)} placeholder="Brief description of this recipe..." className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB]/30 outline-none resize-none h-16" /></div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-gray-500">Recipe Image</Label>
              <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit mb-1.5">
                <button type="button" onClick={() => setImageMode("url")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${imageMode === "url" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>URL</button>
                <button type="button" onClick={() => setImageMode("upload")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${imageMode === "upload" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Upload</button>
              </div>
              {imageMode === "url" ? (
                <Input value={recipe.image} onChange={(e) => upd("image", e.target.value)} placeholder="https://..." className="h-8 text-sm" />
              ) : (
                <div className="space-y-1.5">
                  <label className={`flex items-center justify-center gap-2 h-9 px-3 rounded-lg border-2 border-dashed cursor-pointer text-sm transition-colors ${imageUploading ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-gray-200 hover:border-[#1A56DB] text-gray-500 hover:text-[#1A56DB]"}`}>
                    {imageUploading ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Uploading...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg> Choose image from device</>}
                    <input type="file" accept="image/*" className="hidden" disabled={imageUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
                  </label>
                  {recipe.image && <p className="text-[10px] text-green-600 truncate">Uploaded: {recipe.image}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Timing + Serving */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Timing & Servings</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Prep Time</Label><Input value={recipe.prepTime} onChange={(e) => upd("prepTime", e.target.value)} placeholder="15 min" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Cook Time</Label><Input value={recipe.cookTime} onChange={(e) => upd("cookTime", e.target.value)} placeholder="35 min" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Total Time</Label><Input value={recipe.totalTime} onChange={(e) => upd("totalTime", e.target.value)} placeholder="50 min" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-semibold text-gray-500">Servings</Label><Input type="number" min="1" value={recipe.servings} onChange={(e) => upd("servings", Number(e.target.value))} className="h-8 text-sm" /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-[10px] font-semibold text-gray-500">Difficulty</Label>
                <Select value={recipe.difficulty} onValueChange={(v) => upd("difficulty", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Easy">Easy</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="Hard">Hard</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredients</p>
              <button type="button" onClick={() => addItem("ingredients")} className="text-xs text-[#1A56DB] font-medium flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-1.5">
              {(recipe.ingredients ?? []).map((ing: string, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-gray-300 w-5 flex-shrink-0 text-right">{i + 1}.</span>
                  <Input value={ing} onChange={(e) => updList("ingredients", i, e.target.value)} placeholder={`e.g. 500g chicken curry cut`} className="h-7 text-sm flex-1" />
                  {(recipe.ingredients?.length ?? 0) > 1 && <button type="button" onClick={() => removeItem("ingredients", i)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>}
                </div>
              ))}
            </div>
          </div>

          {/* Method */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Method Steps</p>
              <button type="button" onClick={() => addItem("method")} className="text-xs text-[#1A56DB] font-medium flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" /> Add step</button>
            </div>
            <div className="space-y-2">
              {(recipe.method ?? []).map((step: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-[10px] font-bold text-gray-300 w-5 flex-shrink-0 text-right mt-1.5">{i + 1}.</span>
                  <textarea value={step} onChange={(e) => updList("method", i, e.target.value)} placeholder={`Step ${i + 1}...`} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB]/30 outline-none resize-none h-14" />
                  {(recipe.method?.length ?? 0) > 1 && <button type="button" onClick={() => removeItem("method", i)} className="text-gray-300 hover:text-red-500 flex-shrink-0 mt-1.5"><X className="w-3 h-3" /></button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductModal({ isOpen, onClose, product, subHubId, categories, onSaved }: any) {
  const { toast } = useToast();
  const isEditing = !!product;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [unit, setUnit] = useState("per kg");
  const [grossWeight, setGrossWeight] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [pieces, setPieces] = useState("");
  const [serves, setServes] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [status, setStatus] = useState("available");
  const [isArchived, setIsArchived] = useState(false);
  const [imageUrl, setProductImageUrl] = useState("");
  const [productImageMode, setProductImageMode] = useState<"url" | "upload">("url");
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [couponIds, setCouponIds] = useState<string[]>([]);
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<BatchForm[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState("0");

  const discountPct = useMemo(() => {
    const p = Number(price), op = Number(originalPrice);
    return op > p && p > 0 ? Math.round(((op - p) / op) * 100) : 0;
  }, [price, originalPrice]);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons`).then((d) => {
      setAvailableCoupons(d.coupons ?? []);
    }).catch(() => {});
    if (product) {
      setName(product.name ?? "");
      setDescription(product.description ?? "");
      setCategory(product.category ?? "");
      setSubCategory(product.subCategory ?? "");
      setPrice(String(product.price ?? ""));
      setOriginalPrice(String(product.originalPrice ?? ""));
      setUnit(product.unit ?? "per kg");
      setGrossWeight(product.grossWeight ?? "");
      setNetWeight(product.netWeight ?? "");
      setPieces(product.pieces ?? "");
      setServes(product.serves ?? "");
      setQuantity(String(product.quantity ?? 0));
      setStatus(product.status ?? "available");
      setIsArchived(product.isArchived === true);
      setProductImageUrl(product.imageUrl ?? "");
      setRecipes(Array.isArray(product.recipes) ? product.recipes.map((r: any) => ({
        title: r.title ?? "", description: r.description ?? "", image: r.image ?? "",
        totalTime: r.totalTime ?? "", prepTime: r.prepTime ?? "", cookTime: r.cookTime ?? "",
        servings: r.servings ?? 2, difficulty: r.difficulty ?? "Medium",
        ingredients: Array.isArray(r.ingredients) && r.ingredients.length > 0 ? r.ingredients : [""],
        method: Array.isArray(r.method) && r.method.length > 0 ? r.method : [""],
      })) : []);
      setCouponIds(Array.isArray(product.couponIds) ? product.couponIds.map((id: any) => String(id?.$oid ?? id?._id ?? id)) : []);
      setLowStockThreshold(String(product.lowStockThreshold ?? 0));
      // Load batches from inventory API
      setBatchesLoading(true);
      apiFetch(`/api/inventory/products/${product._id}/batches?subHubId=${subHubId}`)
        .then((d) => {
          const loaded: BatchForm[] = (d.batches ?? []).map((b: any) => ({
            _id: String(b._id ?? ""),
            batchNumber: b.batchNumber ?? "",
            quantity: String(b.quantity ?? 0),
            shelfLifeDays: b.shelfLifeDays != null ? String(b.shelfLifeDays) : "",
            receivedDate: b.receivedDate ? new Date(b.receivedDate).toISOString().slice(0, 10) : "",
            expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().slice(0, 10) : "",
            notes: b.notes ?? "",
          }));
          setBatches(loaded);
        })
        .catch(() => setBatches([]))
        .finally(() => setBatchesLoading(false));
    } else {
      setName(""); setDescription(""); setCategory(""); setSubCategory("");
      setPrice(""); setOriginalPrice(""); setUnit("per kg");
      setGrossWeight(""); setNetWeight(""); setPieces(""); setServes(""); setQuantity("0"); setStatus("available");
      setIsArchived(false); setProductImageUrl(""); setProductImageMode("url"); setRecipes([]);
      setCouponIds([]);
      setLowStockThreshold("0");
      setBatches([emptyBatch()]);
    }
  }, [isOpen, product]);

  const selectedCat = categories?.find((c: any) => c.name === category);
  const subCats: string[] = selectedCat?.subCategories?.map((s: any) => s.name ?? s) ?? [];

  const handleProductImageFile = async (file: File) => {
    setProductImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/upload?folder=fishtokri/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      setProductImageUrl(data.url);
    } catch (err: any) {
      alert(err.message ?? "Upload failed");
    } finally {
      setProductImageUploading(false);
    }
  };

  const batchesTotal = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);

  const saveBatches = async (productId: string) => {
    const batchPayload = batches.map((b) => ({
      _id: b._id || undefined,
      batchNumber: b.batchNumber || "",
      quantity: Number(b.quantity) || 0,
      shelfLifeDays: b.shelfLifeDays !== "" ? Number(b.shelfLifeDays) : null,
      receivedDate: b.receivedDate || null,
      expiryDate: b.expiryDate || null,
      notes: b.notes || "",
    }));
    await apiFetch(`/api/inventory/products/${productId}/batches?subHubId=${subHubId}`, {
      method: "PUT",
      body: JSON.stringify({ batches: batchPayload }),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const cleanedRecipes = recipes.map((r) => ({
      ...r,
      ingredients: r.ingredients.filter((s: string) => s.trim()),
      method: r.method.filter((s: string) => s.trim()),
    }));
    const payload = {
      name, description, category, subCategory,
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || Number(price) || 0,
      discountPct,
      unit, grossWeight, netWeight, pieces, serves,
      quantity: batchesTotal,
      status, isArchived, imageUrl,
      lowStockThreshold: Number(lowStockThreshold) || 0,
      recipes: cleanedRecipes,
      couponIds,
    };
    try {
      let productId: string;
      if (isEditing) {
        await apiFetch(`/api/sub-hubs/${subHubId}/menu/products/${product._id}`, { method: "PUT", body: JSON.stringify(payload) });
        productId = String(product._id);
        toast({ title: "Product updated" });
      } else {
        const created = await apiFetch(`/api/sub-hubs/${subHubId}/menu/products`, { method: "POST", body: JSON.stringify(payload) });
        productId = String(created.product._id);
        toast({ title: "Product added" });
      }
      await saveBatches(productId);
      onSaved(); onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[760px] overflow-y-auto p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <SheetTitle className="text-[#162B4D]">{isEditing ? "Edit Product" : "Add Product"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-4 flex-1 overflow-y-auto">

          {/* ── BASIC INFO ─────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">Basic Info</p>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Product Name *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Curry Cut" className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Description</Label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this product..." className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB]/30 outline-none resize-none h-16" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>{categories?.map((c: any) => <SelectItem key={String(c._id)} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* ── PRICING ────────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">Pricing</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600">Sale Price (₹) *</Label>
                  <Input required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600">Original Price / MRP (₹)</Label>
                  <Input type="number" min="0" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="0" className="h-9" />
                </div>
              </div>
              {discountPct > 0 && (
                <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-green-700 font-semibold">Customer saves {discountPct}% — ₹{Number(originalPrice) - Number(price)} off</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">Unit</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["per kg", "per 500g", "per 250g", "per 100g", "per tray", "per pack", "per piece"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Gross Weight</Label><Input value={grossWeight} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*/, "$1"); setGrossWeight(v); }} inputMode="decimal" placeholder="e.g. 550" className="h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Net Weight</Label><Input value={netWeight} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*/, "$1"); setNetWeight(v); }} inputMode="decimal" placeholder="e.g. 500" className="h-9" /></div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Pieces</Label><Input value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="e.g. 8–10 Pieces" className="h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Serves</Label><Input value={serves} onChange={(e) => setServes(e.target.value)} placeholder="e.g. Serves 4" className="h-9" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600">Stock (Qty)</Label>
                  <Input type="number" readOnly value={batchesTotal} className="h-9 bg-gray-50 text-gray-500 cursor-not-allowed" title="Derived from batches below" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                    Low Stock Alert
                  </Label>
                  <Input
                    type="number" min="0"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    placeholder="e.g. 5"
                    className="h-9"
                    title="Warn when stock drops below this number (0 = disabled)"
                  />
                </div>
              </div>
              {Number(lowStockThreshold) > 0 && batchesTotal <= Number(lowStockThreshold) && (
                <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-amber-700 font-semibold">Stock is at or below the low-stock threshold ({lowStockThreshold})</span>
                </div>
              )}
            </div>
          </section>

          {/* ── STATUS ─────────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">Status & Media</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">Product Image</Label>
                <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit mb-1.5">
                  <button type="button" onClick={() => setProductImageMode("url")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${productImageMode === "url" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>URL</button>
                  <button type="button" onClick={() => setProductImageMode("upload")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${productImageMode === "upload" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Upload</button>
                </div>
                {productImageMode === "url" ? (
                  <div className="space-y-1.5">
                    <Input value={imageUrl} onChange={(e) => setProductImageUrl(e.target.value)} placeholder="https://..." className="h-9" />
                    {imageUrl && <img src={imageUrl} alt="Preview" className="w-full h-28 object-cover rounded-lg border border-gray-100" onError={(e) => { (e.target as any).style.display = "none"; }} />}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className={`flex items-center justify-center gap-2 h-10 px-3 rounded-lg border-2 border-dashed cursor-pointer text-sm transition-colors ${productImageUploading ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-gray-200 hover:border-[#1A56DB] text-gray-500 hover:text-[#1A56DB]"}`}>
                      {productImageUploading ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Uploading...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg> Choose image from device</>}
                      <input type="file" accept="image/*" className="hidden" disabled={productImageUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleProductImageFile(f); e.target.value = ""; }} />
                    </label>
                    {imageUrl && <img src={imageUrl} alt="Preview" className="w-full h-28 object-cover rounded-lg border border-gray-100" onError={(e) => { (e.target as any).style.display = "none"; }} />}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-600">Availability</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                      <SelectItem value="unavailable">Unavailable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>

          {/* ── BATCHES ────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100 after:ml-2">
                Stock Batches ({batches.length}){batchesTotal > 0 && <span className="text-blue-600 font-bold normal-case">— Total: {batchesTotal}</span>}
              </p>
              <button
                type="button"
                onClick={() => {
                  const autoNum = name.trim() ? generateNextBatchNumber(name, batches) : "";
                  setBatches([...batches, { ...emptyBatch(), batchNumber: autoNum }]);
                }}
                className="text-xs text-[#1A56DB] font-semibold flex items-center gap-1 hover:underline ml-4 flex-shrink-0"
              >
                <Plus className="w-3 h-3" /> Add Batch
              </button>
            </div>
            {batchesLoading ? (
              <div className="text-xs text-gray-400 py-3">Loading batches...</div>
            ) : batches.length === 0 ? (
              <div className="text-center py-5 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                No batches yet. Click "Add Batch" to track stock.
              </div>
            ) : (
              <div className="space-y-2">
                {batches.map((b, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Batch #</label>
                        <Input
                          value={b.batchNumber}
                          onChange={(e) => setBatches(batches.map((x, idx) => idx === i ? { ...x, batchNumber: e.target.value } : x))}
                          placeholder="Auto-generated"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Quantity *</label>
                        <Input
                          type="number" min="0"
                          value={b.quantity}
                          onChange={(e) => setBatches(batches.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                          placeholder="0"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Shelf Life (days)</label>
                        <Input
                          type="number" min="0"
                          value={b.shelfLifeDays}
                          onChange={(e) => {
                            const days = e.target.value;
                            const base = b.receivedDate;
                            let expiry = b.expiryDate;
                            if (days !== "" && base) {
                              const d = new Date(base);
                              d.setDate(d.getDate() + Number(days));
                              expiry = d.toISOString().slice(0, 10);
                            }
                            setBatches(batches.map((x, idx) => idx === i ? { ...x, shelfLifeDays: days, expiryDate: expiry } : x));
                          }}
                          placeholder="e.g. 3"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Received Date</label>
                        <Input
                          type="date"
                          value={b.receivedDate}
                          onChange={(e) => {
                            const base = e.target.value;
                            const days = b.shelfLifeDays;
                            let expiry = b.expiryDate;
                            if (base && days !== "") {
                              const d = new Date(base);
                              d.setDate(d.getDate() + Number(days));
                              expiry = d.toISOString().slice(0, 10);
                            }
                            setBatches(batches.map((x, idx) => idx === i ? { ...x, receivedDate: base, expiryDate: expiry } : x));
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Expiry Date</label>
                        <Input
                          type="date"
                          value={b.expiryDate}
                          onChange={(e) => setBatches(batches.map((x, idx) => idx === i ? { ...x, expiryDate: e.target.value } : x))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                        <Input
                          value={b.notes}
                          onChange={(e) => setBatches(batches.map((x, idx) => idx === i ? { ...x, notes: e.target.value } : x))}
                          placeholder="Optional notes..."
                          className="h-8 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setBatches(batches.filter((_, idx) => idx !== i))}
                        className="h-8 px-2 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md border border-gray-200 transition-colors"
                        title="Remove batch"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── RECIPES ────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recipes ({recipes.length})</p>
              <button
                type="button"
                onClick={() => setRecipes([...recipes, BLANK_RECIPE()])}
                className="text-xs text-[#1A56DB] font-semibold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3 h-3" /> Add Recipe
              </button>
            </div>
            {recipes.length === 0
              ? <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">No recipes yet. Click "Add Recipe" to include cooking instructions.</div>
              : <div className="space-y-2">{recipes.map((r, i) => (
                  <RecipeEditor
                    key={i}
                    recipe={r}
                    onChange={(updated) => setRecipes(recipes.map((x, idx) => idx === i ? updated : x))}
                    onRemove={() => setRecipes(recipes.filter((_, idx) => idx !== i))}
                  />
                ))}</div>}
          </section>

          {/* ── COUPONS ─────────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">Assigned Coupons</p>
            {availableCoupons.length === 0
              ? <div className="text-center py-5 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">No coupons found. Add coupons in the Coupons tab first.</div>
              : <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {availableCoupons.map((c: any) => {
                    const id = String(c._id);
                    const checked = couponIds.includes(id);
                    return (
                      <label key={id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? "border-[#1A56DB] bg-blue-50/50" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                        <input type="checkbox" checked={checked} onChange={() => setCouponIds(checked ? couponIds.filter((x) => x !== id) : [...couponIds, id])} className="w-4 h-4 accent-[#1A56DB]" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#162B4D] font-mono tracking-wide">{c.code}</span>
                            {c.title && <span className="text-xs text-gray-500 truncate">{c.title}</span>}
                          </div>
                          <p className="text-[10px] text-gray-400">{c.type === "percentage" ? `${c.discountValue}% off` : `₹${c.discountValue} off`}{c.minOrderAmount ? ` · min ₹${c.minOrderAmount}` : ""}</p>
                        </div>
                        {!c.isActive && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0">Inactive</span>}
                      </label>
                    );
                  })}
                </div>}
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 mt-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9 px-6">
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Product"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CategoryModal({ isOpen, onClose, category, subHubId, onSaved, nextOrder = 1, allItems = [] }: any) {
  const { toast } = useToast();
  const isEditing = !!category;
  const [name, setName] = useState(""); const [imageUrl, setImageUrl] = useState("");
  const [isActive, setIsActive] = useState(true); const [sortOrder, setSortOrder] = useState("1");
  const [catImageMode, setCatImageMode] = useState<"url" | "upload">("url");
  const [catImageUploading, setCatImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (category) { setName(category.name ?? ""); setImageUrl(category.imageUrl ?? ""); setIsActive(category.isActive !== false); setSortOrder(String(category.sortOrder ?? 0)); }
      else { setName(""); setImageUrl(""); setIsActive(true); setSortOrder(String(nextOrder)); }
      setCatImageMode("url");
    }
  }, [isOpen, category, nextOrder]);

  const handleCatImageFile = async (file: File) => {
    setCatImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/upload?folder=fishtokri/categories", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      setImageUrl(data.url);
    } catch (err: any) {
      alert(err.message ?? "Upload failed");
    } finally {
      setCatImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const soNum = Number(sortOrder) || 0;
    const dup = allItems.some((x: any) => (x.sortOrder ?? 0) === soNum && String(x._id) !== String(category?._id));
    if (dup) { toast({ title: "Duplicate order number", description: `Sort order ${soNum} is already used by another category.`, variant: "destructive" }); setSaving(false); return; }
    const payload = { name, imageUrl, isActive, sortOrder: soNum };
    try {
      if (isEditing) { await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories/${category._id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Category updated" }); }
      else { await apiFetch(`/api/sub-hubs/${subHubId}/menu/categories`, { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Category added" }); }
      onSaved(); onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[#162B4D]">{isEditing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Category Name *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fish" className="h-9" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">Category Image</Label>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit mb-1.5">
              <button type="button" onClick={() => setCatImageMode("url")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${catImageMode === "url" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>URL</button>
              <button type="button" onClick={() => setCatImageMode("upload")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${catImageMode === "upload" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Upload</button>
            </div>
            {catImageMode === "url" ? (
              <div className="space-y-1.5">
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="h-9" />
                {imageUrl && <img src={imageUrl} alt="Preview" className="w-full h-24 object-cover rounded-lg border border-gray-100" onError={(e) => { (e.target as any).style.display = "none"; }} />}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className={`flex items-center justify-center gap-2 h-10 px-3 rounded-lg border-2 border-dashed cursor-pointer text-sm transition-colors ${catImageUploading ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-gray-200 hover:border-[#1A56DB] text-gray-500 hover:text-[#1A56DB]"}`}>
                  {catImageUploading ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Uploading...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg> Choose image from device</>}
                  <input type="file" accept="image/*" className="hidden" disabled={catImageUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCatImageFile(f); e.target.value = ""; }} />
                </label>
                {imageUrl && <img src={imageUrl} alt="Preview" className="w-full h-24 object-cover rounded-lg border border-gray-100" onError={(e) => { (e.target as any).style.display = "none"; }} />}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Sort Order</Label><Input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" /></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><Label className="text-sm">Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" /></div>
          </div>
          <DialogFooter className="pt-1"><Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9">{isEditing ? "Save Changes" : "Add Category"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ComboInclude = { productId: string; label: string; quantity: number };

function ComboModal({ isOpen, onClose, combo, subHubId, onSaved, nextOrder = 1, allItems = [] }: any) {
  const { toast } = useToast();
  const isEditing = !!combo;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [discountedPrice, setDiscountedPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [serves, setServes] = useState("");
  const [weight, setWeight] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("1");
  const [includes, setIncludes] = useState<ComboInclude[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch(`/api/sub-hubs/${subHubId}/menu/products`).then((pd) => setAvailableProducts(pd.products ?? [])).catch(() => {});
    if (combo) {
      setName(combo.name ?? ""); setDescription(combo.description ?? "");
      setFullDescription(combo.fullDescription ?? "");
      setDiscountedPrice(String(combo.discountedPrice ?? combo.price ?? ""));
      setOriginalPrice(String(combo.originalPrice ?? ""));
      setServes(combo.serves ?? ""); setWeight(combo.weight ?? "");
      setTagsStr(Array.isArray(combo.tags) ? combo.tags.join(", ") : "");
      setIncludes(Array.isArray(combo.includes) ? combo.includes.map((i: any) => ({
        productId: String(i.productId ?? ""),
        label: i.label ?? "",
        quantity: Math.max(1, Number(i.quantity) || 1),
      })) : []);
      setIsActive(combo.isActive !== false); setSortOrder(String(combo.sortOrder ?? 0));
    } else {
      setName(""); setDescription(""); setFullDescription(""); setDiscountedPrice(""); setOriginalPrice("");
      setServes(""); setWeight(""); setTagsStr(""); setIncludes([]); setIsActive(true); setSortOrder(String(nextOrder));
    }
    setProductSearch(""); setSelectedCategory("all");
  }, [isOpen, combo, nextOrder]);

  useEffect(() => {
    if (includes.length === 0) return;
    let origTotal = 0;
    let discTotal = 0;
    for (const inc of includes) {
      const prod = availableProducts.find((p) => String(p._id) === inc.productId);
      if (!prod) continue;
      const qty = Math.max(1, Number(inc.quantity) || 1);
      origTotal += (Number(prod.originalPrice) || Number(prod.price) || 0) * qty;
      discTotal += (Number(prod.discountedPrice) || Number(prod.price) || 0) * qty;
    }
    if (origTotal > 0) setOriginalPrice(String(origTotal));
    if (discTotal > 0) setDiscountedPrice(String(discTotal));
  }, [includes, availableProducts]);

  const toggleProduct = (product: any) => {
    const id = String(product._id);
    if (includes.find((i) => i.productId === id)) {
      setIncludes(includes.filter((i) => i.productId !== id));
    } else {
      setIncludes([...includes, { productId: id, label: product.name, quantity: 1 }]);
    }
  };

  const categoryNames = Array.from(new Set(availableProducts.map((p) => p.category).filter(Boolean)));

  const filteredProducts = availableProducts.filter((p) => {
    const matchCat = selectedCategory === "all" || p.category === selectedCategory;
    const matchSearch = !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const soNum = Number(sortOrder) || 0;
    const dup = allItems.some((x: any) => (x.sortOrder ?? 0) === soNum && String(x._id) !== String(combo?._id));
    if (dup) { toast({ title: "Duplicate order number", description: `Sort order ${soNum} is already used by another combo.`, variant: "destructive" }); setSaving(false); return; }
    const dp = Number(discountedPrice) || 0; const op = Number(originalPrice) || 0;
    const payload = {
      name, description, fullDescription, serves, weight,
      discountedPrice: dp, originalPrice: op,
      discount: op > dp && dp > 0 ? Math.round(((op - dp) / op) * 100) : 0,
      includes,
      tags: tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
      isActive, sortOrder: soNum,
    };
    try {
      if (isEditing) { await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos/${combo._id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Combo updated" }); }
      else { await apiFetch(`/api/sub-hubs/${subHubId}/menu/combos`, { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Combo added" }); }
      onSaved(); onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[#162B4D]">{isEditing ? "Edit Combo" : "Add Combo"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-1">

          {/* Basic info */}
          <section className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Combo Name *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family Fish Combo" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Short Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief tagline" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Full Description</Label><textarea value={fullDescription} onChange={(e) => setFullDescription(e.target.value)} placeholder="Detailed description of the combo..." className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB]/30 outline-none resize-none h-16" /></div>
          </section>

          {/* Pricing & details */}
          <section className="space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">Pricing & Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Discounted Price (₹) *</Label><Input required type="number" min="0" value={discountedPrice} onChange={(e) => setDiscountedPrice(e.target.value)} placeholder="0" className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Original Price (₹)</Label><Input type="number" min="0" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="0" className="h-9" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Serves</Label><Input value={serves} onChange={(e) => setServes(e.target.value)} placeholder="e.g. 2-3 persons" className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Weight</Label><Input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 500g" className="h-9" /></div>
            </div>
          </section>

          {/* Product selection — category filter then products */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">
              Select Products ({includes.length} selected)
            </p>

            {/* Selected products chips */}
            {includes.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {includes.map((item, i) => {
                  const prod = availableProducts.find((p) => String(p._id) === item.productId);
                  const qty = Math.max(1, Number(item.quantity) || 1);
                  const unitDisc = Number(prod?.discountedPrice) || Number(prod?.price) || 0;
                  const unitOrig = Number(prod?.originalPrice) || Number(prod?.price) || 0;
                  return (
                    <div key={item.productId} className="flex flex-col gap-1.5 p-2 bg-[#EEF3FB] border border-[#C5D5F5] rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1A56DB] flex-shrink-0" />
                        <span className="text-[10px] text-gray-400 flex-shrink-0 w-16 truncate">{prod?.category ?? ""}</span>
                        <div className="flex-1 min-w-0">
                          <Input
                            value={item.label}
                            onChange={(e) => setIncludes(includes.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                            placeholder="Label shown to customer"
                            className="h-7 text-xs border-[#C5D5F5] bg-white"
                          />
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[10px] text-gray-500 whitespace-nowrap">Qty: 1</span>
                        </div>
                        <button type="button" onClick={() => setIncludes(includes.filter((_, idx) => idx !== i))} className="text-blue-200 hover:text-red-500 flex-shrink-0 transition-colors"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      {prod && (
                        <div className="flex items-center gap-3 pl-5">
                          <span className="text-[10px] text-gray-400">Per unit:</span>
                          <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                            ₹{unitDisc.toLocaleString("en-IN")} discounted
                          </span>
                          {unitOrig > 0 && unitOrig !== unitDisc && (
                            <span className="text-[10px] text-gray-400 line-through">₹{unitOrig.toLocaleString("en-IN")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Category filter chips */}
            {categoryNames.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                <button type="button" onClick={() => setSelectedCategory("all")}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${selectedCategory === "all" ? "bg-[#1A56DB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  All
                </button>
                {categoryNames.map((cat) => (
                  <button key={cat} type="button" onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${selectedCategory === cat ? "bg-[#1A56DB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Product list */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-2 py-1.5 border-b border-gray-100 bg-gray-50">
                <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products..." className="h-7 text-xs" />
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                {filteredProducts.length === 0
                  ? <p className="text-center text-xs text-gray-400 py-5">No products found</p>
                  : filteredProducts.map((p) => {
                    const id = String(p._id);
                    const selected = includes.some((i) => i.productId === id);
                    return (
                      <label key={id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${selected ? "bg-[#EEF3FB]" : "hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={selected} onChange={() => toggleProduct(p)} className="w-4 h-4 accent-[#1A56DB] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#162B4D] truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.category}{p.subCategory ? ` › ${p.subCategory}` : ""}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {p.discountedPrice > 0 && <p className="text-xs font-semibold text-[#162B4D]">₹{p.discountedPrice}</p>}
                          {p.originalPrice > p.discountedPrice && <p className="text-[10px] text-gray-400 line-through">₹{p.originalPrice}</p>}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          </section>

          {/* Tags + settings */}
          <section className="space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 after:flex-1 after:h-px after:bg-gray-100">Tags & Settings</p>
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Tags <span className="font-normal text-gray-400">(comma-separated)</span></Label><Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="Family Size, Value" className="h-9" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Sort Order</Label><Input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" /></div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><Label className="text-sm">Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" /></div>
            </div>
          </section>

          <DialogFooter className="pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9 px-6">{saving ? "Saving..." : isEditing ? "Save Changes" : "Add Combo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CouponModal({ isOpen, onClose, coupon, subHubId, onSaved }: any) {
  const { toast } = useToast();
  const isEditing = !!coupon;
  const [code, setCode] = useState(""); const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState(""); const [minOrderAmount, setMinOrderAmount] = useState("");
  const [maxUsage, setMaxUsage] = useState(""); const [isFirstTimeOnly, setIsFirstTimeOnly] = useState(false);
  const [isActive, setIsActive] = useState(true); const [expiresAt, setExpiresAt] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCatFilter, setProductCatFilter] = useState("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch(`/api/sub-hubs/${subHubId}/menu/categories`).then((d) => setAvailableCategories(d.categories ?? [])).catch(() => {});
    apiFetch(`/api/sub-hubs/${subHubId}/menu/products`).then((d) => setAvailableProducts(d.products ?? [])).catch(() => {});
    if (coupon) {
      setCode(coupon.code ?? ""); setTitle(coupon.title ?? ""); setDescription(coupon.description ?? "");
      setType(coupon.type ?? "percentage"); setDiscountValue(String(coupon.discountValue ?? ""));
      setMinOrderAmount(String(coupon.minOrderAmount ?? "")); setMaxUsage(coupon.maxUsage ? String(coupon.maxUsage) : "");
      setIsFirstTimeOnly(coupon.isFirstTimeOnly === true); setIsActive(coupon.isActive !== false);
      setExpiresAt(coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().split("T")[0] : "");
      setSelectedCategoryIds(Array.isArray(coupon.applicableCategories) ? coupon.applicableCategories : []);
      setSelectedProductIds(Array.isArray(coupon.applicableProducts) ? coupon.applicableProducts : []);
    } else {
      setCode(""); setTitle(""); setDescription(""); setType("percentage");
      setDiscountValue(""); setMinOrderAmount(""); setMaxUsage(""); setIsFirstTimeOnly(false);
      setIsActive(true); setExpiresAt(""); setSelectedCategoryIds([]); setSelectedProductIds([]);
    }
    setCategorySearch(""); setProductSearch(""); setProductCatFilter("all");
  }, [isOpen, coupon]);

  const toggleCategory = (id: string) =>
    setSelectedCategoryIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleProduct = (id: string) =>
    setSelectedProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const filteredCategories = availableCategories.filter((c) =>
    !categorySearch || c.name?.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const selectedCategoryNames = selectedCategoryIds
    .map((id) => availableCategories.find((c) => String(c._id) === id)?.name)
    .filter(Boolean) as string[];

  const restrictedByCategory = selectedCategoryIds.length > 0;

  const productCategoryNames = restrictedByCategory
    ? selectedCategoryNames
    : Array.from(new Set(availableProducts.map((p) => p.category).filter(Boolean)));

  const filteredProducts = availableProducts.filter((p) => {
    const matchCat = restrictedByCategory
      ? selectedCategoryNames.includes(p.category)
      : productCatFilter === "all" || p.category === productCatFilter;
    const matchSearch = !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload: any = {
      code, title, description, type,
      discountValue: Number(discountValue) || 0, minOrderAmount: Number(minOrderAmount) || 0,
      applicableCategories: selectedCategoryIds,
      applicableProducts: selectedProductIds,
      isFirstTimeOnly, isActive,
    };
    if (isFirstTimeOnly) payload.maxUsage = 1;
    else if (maxUsage) payload.maxUsage = Number(maxUsage);
    if (expiresAt) payload.expiresAt = expiresAt;
    try {
      if (isEditing) { await apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons/${coupon._id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Coupon updated" }); }
      else { await apiFetch(`/api/sub-hubs/${subHubId}/menu/coupons`, { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Coupon added" }); }
      onSaved(); onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[#162B4D]">{isEditing ? "Edit Coupon" : "Add Coupon"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Coupon Code *</Label><Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. FISH10" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Display Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Deal" className="h-9" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short coupon description" className="h-9" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Discount Type</Label><Select value={type} onValueChange={(v) => { setType(v); if (v === "percentage" && Number(discountValue) > 100) setDiscountValue("100"); }}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentage (%)</SelectItem><SelectItem value="flat">Flat (₹)</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Discount Value *</Label><Input required type="number" min="0" max={type === "percentage" ? 100 : undefined} value={discountValue} onChange={(e) => { const v = e.target.value; setDiscountValue(type === "percentage" && Number(v) > 100 ? "100" : v); }} placeholder={type === "percentage" ? "10" : "50"} className="h-9" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Min Order (₹)</Label><Input type="number" min="0" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} placeholder="0" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Max Usage</Label><Input type="number" min="0" value={isFirstTimeOnly ? "1" : maxUsage} onChange={(e) => setMaxUsage(e.target.value)} placeholder="Unlimited" disabled={isFirstTimeOnly} className="h-9 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Expiry Date</Label><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-9" /></div>

          {/* Applicable Categories */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">
              Applicable Categories
              <span className="font-normal text-gray-400 ml-1">
                {selectedCategoryIds.length > 0 ? `(${selectedCategoryIds.length} selected)` : "(all categories)"}
              </span>
            </Label>
            {selectedCategoryIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {selectedCategoryIds.map((id) => {
                  const cat = availableCategories.find((c) => String(c._id) === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 text-xs rounded-full px-2 py-0.5">
                      {cat ? cat.name : id}
                      <button type="button" onClick={() => toggleCategory(id)} className="hover:text-blue-900 ml-0.5">×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 p-1.5 border-b border-gray-100 bg-gray-50">
                <input
                  type="checkbox"
                  title="Select all"
                  checked={filteredCategories.length > 0 && filteredCategories.every((c) => selectedCategoryIds.includes(String(c._id)))}
                  ref={(el) => { if (el) el.indeterminate = filteredCategories.some((c) => selectedCategoryIds.includes(String(c._id))) && !filteredCategories.every((c) => selectedCategoryIds.includes(String(c._id))); }}
                  onChange={() => {
                    const allIds = filteredCategories.map((c) => String(c._id));
                    const allChecked = allIds.every((id) => selectedCategoryIds.includes(id));
                    setSelectedCategoryIds(allChecked ? selectedCategoryIds.filter((id) => !allIds.includes(id)) : Array.from(new Set([...selectedCategoryIds, ...allIds])));
                  }}
                  className="rounded text-[#1A56DB] ml-1"
                />
                <Input value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Search categories..." className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-1 flex-1" />
              </div>
              <div className="max-h-32 overflow-y-auto">
                {availableCategories.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Loading categories…</p>
                ) : filteredCategories.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No categories found</p>
                ) : (
                  filteredCategories.map((cat) => {
                    const id = String(cat._id);
                    const checked = selectedCategoryIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleCategory(id)} className="rounded text-[#1A56DB]" />
                        <span className="text-xs text-gray-700 flex-1">{cat.name}</span>
                        {cat.subCategories?.length > 0 && <span className="text-xs text-gray-400">{cat.subCategories.length} sub</span>}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Applicable Products */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">
              Applicable Products
              <span className="font-normal text-gray-400 ml-1">
                {selectedProductIds.length > 0
                  ? `(${selectedProductIds.length} selected)`
                  : restrictedByCategory
                    ? `(from selected categories)`
                    : "(all products)"}
              </span>
            </Label>
            {selectedProductIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {selectedProductIds.map((id) => {
                  const prod = availableProducts.find((p) => String(p._id) === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-100 text-xs rounded-full px-2 py-0.5">
                      {prod ? prod.name : id}
                      <button type="button" onClick={() => toggleProduct(id)} className="hover:text-green-900 ml-0.5">×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-1.5 p-1.5 border-b border-gray-100 bg-gray-50">
                <input
                  type="checkbox"
                  title="Select all"
                  checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedProductIds.includes(String(p._id)))}
                  ref={(el) => { if (el) el.indeterminate = filteredProducts.some((p) => selectedProductIds.includes(String(p._id))) && !filteredProducts.every((p) => selectedProductIds.includes(String(p._id))); }}
                  onChange={() => {
                    const allIds = filteredProducts.map((p) => String(p._id));
                    const allChecked = allIds.every((id) => selectedProductIds.includes(id));
                    setSelectedProductIds(allChecked ? selectedProductIds.filter((id) => !allIds.includes(id)) : Array.from(new Set([...selectedProductIds, ...allIds])));
                  }}
                  className="rounded text-[#1A56DB] ml-1"
                />
                <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products..." className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-1 flex-1" />
                {!restrictedByCategory && productCategoryNames.length > 0 && (
                  <select value={productCatFilter} onChange={(e) => setProductCatFilter(e.target.value)} className="h-7 text-xs border border-gray-200 rounded px-1 bg-white text-gray-600">
                    <option value="all">All</option>
                    {productCategoryNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto">
                {availableProducts.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Loading products…</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">
                    {restrictedByCategory ? "No products in selected categories" : "No products found"}
                  </p>
                ) : (
                  filteredProducts.map((prod) => {
                    const id = String(prod._id);
                    const checked = selectedProductIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleProduct(id)} className="rounded text-[#1A56DB]" />
                        <span className="text-xs text-gray-700 flex-1">{prod.name}</span>
                        {prod.category && <span className="text-xs text-gray-400">{prod.category}</span>}
                        {prod.discountedPrice != null && <span className="text-xs font-medium text-gray-600">₹{prod.discountedPrice}</span>}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg flex-1"><Label className="text-sm">First Time Only</Label><Switch checked={isFirstTimeOnly} onCheckedChange={setIsFirstTimeOnly} className="data-[state=checked]:bg-[#1A56DB]" /></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg flex-1"><Label className="text-sm">Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" /></div>
          </div>
          <DialogFooter className="pt-1"><Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9">{isEditing ? "Save Changes" : "Add Coupon"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CarouselModal({ isOpen, onClose, carousel, subHubId, onSaved, nextOrder = 1, allItems = [] }: any) {
  const { toast } = useToast();
  const isEditing = !!carousel;
  const [imageUrl, setImageUrl] = useState("");
  const [imageMode, setImageMode] = useState<"url" | "upload">("url");
  const [imageUploading, setImageUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [order, setOrder] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (carousel) {
        setImageUrl(carousel.imageUrl ?? ""); setTitle(carousel.title ?? "");
        setOrder(String(carousel.order ?? 0)); setIsActive(carousel.isActive !== false);
      } else {
        setImageUrl(""); setTitle(""); setOrder(String(nextOrder)); setIsActive(true);
      }
      setImageMode("url"); setImageUploading(false);
    }
  }, [isOpen, carousel, nextOrder]);

  const handleImageFile = async (file: File) => {
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/upload?folder=fishtokri/banners", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");
      setImageUrl(data.url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) { toast({ title: "Image required", description: "Please provide or upload a banner image.", variant: "destructive" }); return; }
    const orderNum = Number(order) || 0;
    const dup = allItems.some((x: any) => (x.order ?? 0) === orderNum && String(x._id) !== String(carousel?._id));
    if (dup) { toast({ title: "Duplicate order number", description: `Order ${orderNum} is already used by another banner. Please choose a unique number.`, variant: "destructive" }); return; }
    setSaving(true);
    const payload = { imageUrl, title: title || null, order: orderNum, isActive };
    try {
      if (isEditing) { await apiFetch(`/api/sub-hubs/${subHubId}/menu/carousels/${carousel._id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Banner updated" }); }
      else { await apiFetch(`/api/sub-hubs/${subHubId}/menu/carousels`, { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Banner added" }); }
      onSaved(); onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="text-[#162B4D]">{isEditing ? "Edit Banner" : "Add Banner"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {/* Image */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-600">Image *</Label>
              <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
                <button type="button" onClick={() => setImageMode("url")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${imageMode === "url" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>URL</button>
                <button type="button" onClick={() => setImageMode("upload")} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${imageMode === "upload" ? "bg-white text-[#162B4D] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Upload</button>
              </div>
            </div>
            {imageMode === "url" ? (
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="h-9" />
            ) : (
              <label className={`flex items-center justify-center gap-2 h-10 px-3 rounded-lg border-2 border-dashed cursor-pointer text-sm transition-colors ${imageUploading ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed" : "border-gray-200 hover:border-[#1A56DB] text-gray-500 hover:text-[#1A56DB]"}`}>
                {imageUploading
                  ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> Uploading…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg> Choose image from device</>}
                <input type="file" accept="image/*" className="hidden" disabled={imageUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
              </label>
            )}
            {imageUrl && <img src={imageUrl} alt="Preview" className="w-full h-28 object-cover rounded-lg border border-gray-100 mt-1" onError={(e) => { (e.target as any).style.display = "none"; }} />}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">Title <span className="font-normal text-gray-400">(optional)</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Special" className="h-9" />
          </div>

          {/* Order + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Display Order</Label><Input type="number" min="0" value={order} onChange={(e) => setOrder(e.target.value)} className="h-9" /></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><Label className="text-sm">Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" /></div>
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button>
            <Button type="submit" disabled={saving || imageUploading} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9">{saving ? "Saving…" : isEditing ? "Save Changes" : "Add Banner"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionModal({ isOpen, onClose, section, subHubId, onSaved, nextOrder = 1, allItems = [] }: any) {
  const { toast } = useToast();
  const isEditing = !!section;
  const [title, setTitle] = useState(""); const [type, setType] = useState("products");
  const [sortOrder, setSortOrder] = useState("1"); const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchItems = useCallback(async (contentType: string, sectionId?: string) => {
    setLoadingItems(true);
    try {
      const endpoint = contentType === "combos" ? "combos" : "products";
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/${endpoint}`);
      const items: any[] = data[endpoint] ?? [];
      setAvailableItems(items);
      if (sectionId) {
        const preSelected = items
          .filter((item: any) => {
            const ids = (item.sectionId ?? []).map((id: any) => String(id?.$oid ?? id?._id ?? id));
            return ids.includes(sectionId);
          })
          .map((item: any) => String(item._id));
        setSelectedItemIds(preSelected);
      } else {
        setSelectedItemIds([]);
      }
    } catch { setAvailableItems([]); setSelectedItemIds([]); }
    finally { setLoadingItems(false); }
  }, [subHubId]);

  useEffect(() => {
    if (!isOpen) return;
    if (section) {
      setTitle(section.title ?? ""); setType(section.type ?? "products");
      setSortOrder(String(section.sortOrder ?? 0)); setIsActive(section.isActive !== false);
      fetchItems(section.type ?? "products", String(section._id));
    } else {
      setTitle(""); setType("products"); setSortOrder(String(nextOrder)); setIsActive(true);
      fetchItems("products");
    }
    setItemSearch("");
  }, [isOpen, section, nextOrder, fetchItems]);

  const handleTypeChange = (val: string) => {
    setType(val);
    fetchItems(val, section ? String(section._id) : undefined);
    setItemSearch("");
  };

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const soNum = Number(sortOrder) || 0;
    const dup = allItems.some((x: any) => (x.sortOrder ?? 0) === soNum && String(x._id) !== String(section?._id));
    if (dup) { toast({ title: "Duplicate order number", description: `Sort order ${soNum} is already used by another section.`, variant: "destructive" }); setSaving(false); return; }
    const payload = { title, type, sortOrder: soNum, isActive };
    try {
      let sectionId: string;
      if (isEditing) {
        await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections/${section._id}`, { method: "PUT", body: JSON.stringify(payload) });
        sectionId = String(section._id);
        toast({ title: "Section updated" });
      } else {
        const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections`, { method: "POST", body: JSON.stringify(payload) });
        sectionId = String(res.section._id);
        toast({ title: "Section added" });
      }
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/sections/${sectionId}/items`, {
        method: "PUT",
        body: JSON.stringify({ type, itemIds: selectedItemIds }),
      });
      onSaved(); onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const filteredItems = availableItems.filter((item) =>
    !itemSearch || item.name?.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const itemLabel = type === "combos" ? "Combos" : "Products";

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[#162B4D]">{isEditing ? "Edit Section" : "Add Section"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Section Title *</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Today's Special" className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Content Type</Label><Select value={type} onValueChange={handleTypeChange}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="products">Products</SelectItem><SelectItem value="combos">Combos</SelectItem></SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Sort Order</Label><Input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" /></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><Label className="text-sm">Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" /></div>
          </div>

          {/* Item selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-600">{itemLabel} ({selectedItemIds.length} selected)</Label>
              {selectedItemIds.length > 0 && (
                <button type="button" onClick={() => setSelectedItemIds([])} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear all</button>
              )}
            </div>
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder={`Search ${itemLabel.toLowerCase()}...`}
              className="h-8 text-xs"
            />
            <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto">
              {loadingItems ? (
                <div className="py-6 text-center text-xs text-gray-400">Loading {itemLabel.toLowerCase()}…</div>
              ) : filteredItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">No {itemLabel.toLowerCase()} found</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredItems.map((item) => {
                    const id = String(item._id);
                    const checked = selectedItemIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleItem(id)} className="w-4 h-4 accent-[#1A56DB] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                          {item.category && <p className="text-[10px] text-gray-400">{item.category}</p>}
                        </div>
                        {(item.discountedPrice ?? item.price) != null && (
                          <span className="ml-auto text-xs text-gray-500 shrink-0">₹{item.discountedPrice ?? item.price}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-1"><Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9">{isEditing ? "Save Changes" : "Add Section"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── TIME SLOTS TAB ────────────────────────────────────────────────────────────
function TimeSlotsTab({ subHubId, onSetExcel }: { subHubId: string; onSetExcel: (cfg: ExcelBarConfig) => void }) {
  const { toast } = useToast();
  const [timeslots, setTimeslots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("sort_asc");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", type: "all" });
  const layout: Layout = "list";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots`);
      setTimeslots(data.timeslots ?? []);
    } catch { setTimeslots([]); } finally { setLoading(false); }
  }, [subHubId]);

  const slotColumns = [
    { header: "Label", key: "label", width: 24 },
    { header: "Start Time (HH:MM)", key: "startTime", width: 20 },
    { header: "End Time (HH:MM)", key: "endTime", width: 20 },
    { header: "Instant (yes/no)", key: "isInstant", width: 18 },
    { header: "Extra Charge", key: "extraCharge", width: 14 },
    { header: "Active (yes/no)", key: "isActive", width: 16 },
    { header: "Sort Order", key: "sortOrder", width: 12 },
  ];
  const slotRow = (s: any) => ({ label: s.label ?? "", startTime: s.startTime ?? "", endTime: s.endTime ?? "", isInstant: s.isInstant ? "yes" : "no", extraCharge: s.extraCharge ?? 0, isActive: s.isActive !== false ? "yes" : "no", sortOrder: s.sortOrder ?? 0 });
  const parseSlotRow = (r: any) => ({ _id: r["ID (do not edit)"] ?? "", label: r["Label"], startTime: r["Start Time (HH:MM)"], endTime: r["End Time (HH:MM)"], isInstant: String(r["Instant (yes/no)"] ?? "no"), extraCharge: r["Extra Charge"], isActive: String(r["Active (yes/no)"] ?? "yes"), sortOrder: r["Sort Order"] });

  const handleSlotExport = async () => {
    setXlsxBusy(true);
    try {
      await buildAndDownloadExcel(processed, slotColumns, slotRow, "timeslots.xlsx", "Time Slots", "FFFFF2CC",
        [{ col: "D", formulae: ['"yes,no"'] }, { col: "F", formulae: ['"yes,no"'] }]);
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleSlotImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseSlotRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Import complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Import failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  const handleSlotEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setXlsxBusy(true);
    try {
      const rows = await parseXlsxFile(file);
      const items = rows.map(parseSlotRow);
      const res = await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots/bulk-upsert`, { method: "POST", body: JSON.stringify({ items }) });
      toast({ title: "Edit complete", description: `Created: ${res.created}, Updated: ${res.updated}${res.errors?.length ? `, Errors: ${res.errors.length}` : ""}` });
      load();
    } catch (err: any) { toast({ title: "Edit failed", description: err.message, variant: "destructive" }); }
    finally { setXlsxBusy(false); }
  };

  useEffect(() => { load(); }, [load]);

  const sortOptions: SortOption[] = [
    { value: "sort_asc", label: "Sort Order" },
    { value: "label_asc", label: "Label A→Z" },
    { value: "time_asc", label: "Start Time" },
    { value: "status", label: "Status" },
  ];
  const filterGroups: FilterGroup[] = [
    { key: "status", label: "Status", options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
    { key: "type", label: "Type", options: [{ value: "all", label: "All" }, { value: "instant", label: "Instant" }, { value: "scheduled", label: "Scheduled" }] },
  ];

  const processed = useMemo(() => {
    let items = [...timeslots];
    if (search) items = items.filter((s) => s.label?.toLowerCase().includes(search.toLowerCase()));
    if (filters.status === "active") items = items.filter((s) => s.isActive !== false);
    if (filters.status === "inactive") items = items.filter((s) => s.isActive === false);
    if (filters.type === "instant") items = items.filter((s) => s.isInstant === true);
    if (filters.type === "scheduled") items = items.filter((s) => s.isInstant !== true);
    items.sort((a, b) => {
      if (sortValue === "sort_asc") return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (sortValue === "label_asc") return (a.label ?? "").localeCompare(b.label ?? "");
      if (sortValue === "time_asc") return (a.startTime ?? "").localeCompare(b.startTime ?? "");
      if (sortValue === "status") return (b.isActive === false ? -1 : 1) - (a.isActive === false ? -1 : 1);
      return 0;
    });
    return items;
  }, [timeslots, search, filters, sortValue]);

  const pagedTimeslots = usePaginated(processed, 20, `${search}|${JSON.stringify(filters)}|${sortValue}`);
  const isDragMode = sortValue === "sort_asc";
  const nextOrder = timeslots.length > 0 ? Math.max(...timeslots.map(s => s.sortOrder ?? 0)) + 1 : 1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...timeslots].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const oldIdx = sorted.findIndex(s => String(s._id) === String(active.id));
    const newIdx = sorted.findIndex(s => String(s._id) === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((s, i) => ({ ...s, sortOrder: i + 1 }));
    setTimeslots(reordered);
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots/reorder`, { method: "PUT", body: JSON.stringify({ items: reordered.map(s => ({ id: String(s._id), sortOrder: s.sortOrder })) }) });
    } catch (err: any) { toast({ title: "Reorder failed", description: err.message, variant: "destructive" }); load(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots/${deleteId}`, { method: "DELETE" });
      toast({ title: "Time slot deleted" }); load();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setDeleteId(null); }
  };

  const _slotImportClick = useCallback(() => importRef.current?.click(), []);
  const _slotEditClick = useCallback(() => editRef.current?.click(), []);
  const _slotExportRef = useRef(handleSlotExport);
  _slotExportRef.current = handleSlotExport;
  const _slotStableExport = useCallback(() => { _slotExportRef.current(); }, []);
  useEffect(() => {
    onSetExcel({ busy: xlsxBusy, onImport: _slotImportClick, onEdit: _slotEditClick, onExport: _slotStableExport, onRefresh: load, count: processed.length });
    return () => onSetExcel(null);
  }, [xlsxBusy, processed.length, _slotImportClick, _slotEditClick, _slotStableExport, onSetExcel, load]);

  return (
    <div className="space-y-4">
      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSlotImport} />
      <input ref={editRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSlotEdit} />
      <TabToolbar
        search={search} onSearch={setSearch}
        sortOptions={sortOptions} sortValue={sortValue} onSortChange={setSortValue}
        filterGroups={filterGroups} filterValues={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        layout={layout} onLayout={() => {}}
        addLabel="Add Slot" onAdd={() => { setEditing(null); setModalOpen(true); }}
        resultCount={processed.length} totalCount={timeslots.length}
        hideLayoutToggle
      />

      {isDragMode && !loading && timeslots.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs text-indigo-500 bg-indigo-50 rounded-lg">
          <GripVertical className="w-3 h-3" /><span>Drag time slots to reorder — numbers update automatically</span>
        </div>
      )}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : timeslots.length === 0 ? (
        <EmptyState icon={Clock} message="No time slots found" sub="Try adjusting your search or filters" />
      ) : isDragMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...timeslots].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map(s => String(s._id))} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {[...timeslots].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).map((s) => (
                <SortableItem key={String(s._id)} id={String(s._id)}>
                  {(handle) => (
                    <div className="flex items-center gap-4 p-3.5 bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-shadow">
                      <div className="flex-shrink-0">{handle}</div>
                      <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-5 h-5 text-cyan-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-[#162B4D] text-sm">{displayTime(s.startTime)} – {displayTime(s.endTime)}</p>
                          {s.isInstant && <span className="text-[10px] bg-orange-50 text-orange-600 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Instant</span>}
                          <StatusBadge active={s.isActive !== false} />
                        </div>
                        <p className="text-xs text-gray-400">{displayTime(s.startTime)} – {displayTime(s.endTime)}{s.extraCharge > 0 ? ` · +₹${s.extraCharge} extra` : ""}</p>
                      </div>
                      {(s.orderLimit ?? 0) > 0 && (
                        <div className="flex items-center gap-1 mr-1 flex-shrink-0">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">T: {s.todaysOrderCount ?? 0}/{s.orderLimit}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">N: {s.nextDayOrderCount ?? 0}/{s.orderLimit}</span>
                        </div>
                      )}
                      <span className="text-xs font-bold text-gray-400">#{s.sortOrder ?? 0}</span>
                      <ActionButtons onEdit={() => { setEditing(s); setModalOpen(true); }} onDelete={() => setDeleteId(String(s._id))} />
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {pagedTimeslots.pageItems.map((s) => (
            <div key={String(s._id)} className="flex items-center gap-4 p-3.5 bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-cyan-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[#162B4D] text-sm">{displayTime(s.startTime)} – {displayTime(s.endTime)}</p>
                  {s.isInstant && <span className="text-[10px] bg-orange-50 text-orange-600 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Instant</span>}
                  <StatusBadge active={s.isActive !== false} />
                </div>
                <p className="text-xs text-gray-400">{displayTime(s.startTime)} – {displayTime(s.endTime)}{s.extraCharge > 0 ? ` · +₹${s.extraCharge} extra` : ""}</p>
              </div>
              {(s.orderLimit ?? 0) > 0 && (
                <div className="flex items-center gap-1 mr-1 flex-shrink-0">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">T: {s.todaysOrderCount ?? 0}/{s.orderLimit}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">N: {s.nextDayOrderCount ?? 0}/{s.orderLimit}</span>
                </div>
              )}
              <span className="text-xs text-gray-300 font-mono hidden sm:block">#{s.sortOrder ?? 0}</span>
              <ActionButtons onEdit={() => { setEditing(s); setModalOpen(true); }} onDelete={() => setDeleteId(String(s._id))} />
            </div>
          ))}
        </div>
      )}

      <PaginationBar
        page={pagedTimeslots.page}
        pages={pagedTimeslots.pages}
        total={pagedTimeslots.total}
        onChange={pagedTimeslots.setPage}
        label="time slots"
      />

      <TimeslotModal isOpen={modalOpen} onClose={() => setModalOpen(false)} timeslot={editing} subHubId={subHubId} onSaved={load} nextOrder={nextOrder} allItems={timeslots} />
      <DeleteDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Time Slot" description="This action cannot be undone." />
    </div>
  );
}

function parse12h(time: string): { h: number; m: number; ampm: "AM" | "PM" } {
  if (!time) return { h: 12, m: 0, ampm: "AM" };
  // Already in 12h format: "09:30 PM" or "9:30 am"
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    return { h: parseInt(match[1], 10), m: parseInt(match[2], 10), ampm: match[3].toUpperCase() as "AM" | "PM" };
  }
  // Legacy 24h format: "21:30"
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

function displayTime(t: string): string {
  if (!t) return "--";
  const { h, m, ampm } = parse12h(t);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

function TimePickerField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { h, m, ampm } = parse12h(value);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hour" | "minute">("hour");

  const timeLabel = value
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`
    : "-- : -- --";

  const SIZE = 200;
  const CENTER = SIZE / 2;
  const R = 78;

  const hourItems  = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
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
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-gray-600">{label}</Label>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMode("hour"); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-input bg-white text-sm font-medium text-[#162B4D] hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A56DB]/30"
          >
            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
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
              <line x1={CENTER} y1={CENTER} x2={handX} y2={handY} stroke="#1A56DB" strokeWidth="2" strokeLinecap="round" />
              <circle cx={CENTER} cy={CENTER} r="4" fill="#1A56DB" />
              <circle cx={handX} cy={handY} r="3.5" fill="#1A56DB" />
              {items.map((item, i) => {
                const angle = (i / items.length) * 2 * Math.PI - Math.PI / 2;
                const x = CENTER + R * Math.cos(angle);
                const y = CENTER + R * Math.sin(angle);
                const isSelected = mode === "hour" ? h === item : m === item;
                return (
                  <g key={item}>
                    {isSelected && <circle cx={x} cy={y} r="15" fill="#1A56DB" />}
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
    </div>
  );
}

function TimeslotModal({ isOpen, onClose, timeslot, subHubId, onSaved, nextOrder = 1, allItems = [] }: any) {
  const { toast } = useToast();
  const isEditing = !!timeslot;
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("1");
  const [orderLimit, setOrderLimit] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (timeslot) {
        setStartTime(timeslot.startTime ? displayTime(timeslot.startTime) : "");
        setEndTime(timeslot.endTime ? displayTime(timeslot.endTime) : "");
        setIsActive(timeslot.isActive !== false);
        setSortOrder(String(timeslot.sortOrder ?? 0));
        setOrderLimit(String(timeslot.orderLimit ?? 0));
      } else {
        setStartTime(""); setEndTime(""); setIsActive(true); setSortOrder(String(nextOrder)); setOrderLimit("0");
      }
    }
  }, [isOpen, timeslot, nextOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (!startTime || !endTime) { toast({ title: "Please select both start and end times.", variant: "destructive" }); setSaving(false); return; }
    const soNum = Number(sortOrder) || 0;
    const dup = allItems.some((x: any) => (x.sortOrder ?? 0) === soNum && String(x._id) !== String(timeslot?._id));
    if (dup) { toast({ title: "Duplicate order number", description: `Sort order ${soNum} is already used by another time slot.`, variant: "destructive" }); setSaving(false); return; }
    const label = `${startTime} - ${endTime}`;
    const payload = { startTime, endTime, label, isActive, sortOrder: soNum, orderLimit: Number(orderLimit) || 0 };
    try {
      if (isEditing) { await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots/${timeslot._id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Time slot updated" }); }
      else { await apiFetch(`/api/sub-hubs/${subHubId}/menu/timeslots`, { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Time slot added" }); }
      onSaved(); onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="text-[#162B4D]">{isEditing ? "Edit Time Slot" : "Add Time Slot"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <TimePickerField label="Start Time *" value={startTime} onChange={setStartTime} />
            <TimePickerField label="End Time *" value={endTime} onChange={setEndTime} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold text-gray-600">Sort Order</Label><Input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" /></div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"><Label className="text-sm">Active</Label><Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">Order Limit</Label>
            <Input
              type="number"
              min="0"
              value={orderLimit}
              onChange={(e) => setOrderLimit(e.target.value)}
              className="h-9"
              placeholder="0"
            />
            <p className="text-[11px] text-gray-400">Set to 0 for no limit.</p>
          </div>
          <DialogFooter className="pt-1"><Button type="button" variant="outline" onClick={onClose} className="h-9">Cancel</Button><Button type="submit" disabled={saving} className="bg-[#1A56DB] hover:bg-[#1447B4] h-9">{isEditing ? "Save Changes" : "Add Slot"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
