import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, MapPin, Plus, Edit2, Trash2, Layers, Database,
  Search, ArrowUpDown, SlidersHorizontal, LayoutGrid, LayoutList,
  X, CheckCircle2,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import {
  useGetSuperHubs,
  getGetSuperHubsQueryKey,
  useGetSubHubsBySuperHub,
  getGetSubHubsBySuperHubQueryKey,
  useCreateSubHub,
  useUpdateSubHub,
  useDeleteSubHub,
  useToggleSubHubStatus,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar } from "@/components/pagination-bar";
import { usePaginated } from "@/hooks/use-paginated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

type SortOption = "name_asc" | "name_desc" | "pincodes_asc" | "pincodes_desc" | "status";

function getAdminRole() {
  try {
    const raw = localStorage.getItem("fishtokri_admin");
    return raw ? JSON.parse(raw)?.role : null;
  } catch {
    return null;
  }
}

export default function HubDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const superHubId = params.id;
  const role = getAdminRole();
  const isSuperHub = role === "super_hub";

  const { data: superHubsData } = useGetSuperHubs(undefined, {
    query: { queryKey: getGetSuperHubsQueryKey() },
  });
  const superHub = superHubsData?.superHubs.find((h) => h.id === superHubId);

  const { data, isLoading } = useGetSubHubsBySuperHub(superHubId, {
    query: { queryKey: getGetSubHubsBySuperHubQueryKey(superHubId) },
  });
  const subHubs = data?.subHubs || [];

  const [formMode, setFormMode] = useState<null | "add" | "edit">(null);
  const [editingSubHub, setEditingSubHub] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [sort, setSort] = useState<SortOption>("name_asc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const stats = {
    total: subHubs.length,
    active: subHubs.filter((s) => s.status === "Active").length,
    totalPins: subHubs.reduce((acc, s) => acc + ((s as any).pincodes?.length ?? 0), 0),
  };

  const filtered = subHubs
    .filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q) ||
        ((s as any).pincodes || []).some((p: string) => p.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "pincodes_asc") return ((a as any).pincodes?.length ?? 0) - ((b as any).pincodes?.length ?? 0);
      if (sort === "pincodes_desc") return ((b as any).pincodes?.length ?? 0) - ((a as any).pincodes?.length ?? 0);
      if (sort === "status") return a.status.localeCompare(b.status);
      return 0;
    });

  const pagedSubs = usePaginated(filtered, 20, `${search}|${statusFilter}|${sort}`);
  const hasFilters = !!(search || statusFilter !== "all");

  const clearFilters = () => { setSearch(""); setStatusFilter("all"); };

  const openAdd = () => { setEditingSubHub(null); setFormMode("add"); };
  const openEdit = (sub: any) => { setEditingSubHub(sub); setFormMode("edit"); };

  if (formMode) {
    return (
      <SubHubForm
        subHub={editingSubHub}
        superHubId={superHubId}
        superHubName={superHub?.name}
        onBack={() => setFormMode(null)}
      />
    );
  }

  const headerSlot = document.getElementById("page-header-slot");

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }}>
      {headerSlot && createPortal(
        <div className="flex items-center justify-between w-full min-w-0">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[#162B4D] leading-tight">
              {superHub ? `${superHub.name} — Sub Hubs` : "Sub Hubs"}
            </h1>
            <p className="text-xs text-gray-500 leading-tight hidden sm:block">
              {superHub?.location || "Manage sub hubs for this super hub"}
            </p>
          </div>
          <span className="text-3xl font-bold text-[#162B4D] flex-shrink-0 ml-4">{stats.total}</span>
        </div>,
        headerSlot,
      )}

      {/* Back + Title */}
      <div className="flex items-center gap-3 mb-5">
        {!isSuperHub && (
          <button
            onClick={() => setLocation("/hubs")}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#162B4D] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {superHub ? (
            <>
              <h2 className="text-xl font-bold text-[#162B4D] flex items-center gap-2">
                {superHub.name}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${superHub.status === "Active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {superHub.status}
                </span>
              </h2>
              {superHub.location && (
                <p className="text-sm text-black flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  {superHub.location}
                </p>
              )}
            </>
          ) : (
            <Skeleton className="h-7 w-40" />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Total Sub Hubs", value: stats.total, color: "text-[#162B4D]" },
          { label: "Active", value: stats.active, color: "text-green-600" },
          { label: "Total Pincodes", value: stats.totalPins, color: "text-[#1A56DB]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white px-5 py-4 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, location or pincode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-gray-200 h-9 text-sm text-black"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="h-9 w-36 text-sm border-gray-200 bg-white text-black">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v: any) => setSort(v)}>
          <SelectTrigger className="h-9 w-44 text-sm border-gray-200 bg-white text-black">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name (A → Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z → A)</SelectItem>
            <SelectItem value="pincodes_desc">Pincodes (Most)</SelectItem>
            <SelectItem value="pincodes_asc">Pincodes (Least)</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-[#1A56DB] hover:underline font-medium flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-black font-medium">{filtered.length} of {subHubs.length}</span>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button onClick={() => setViewMode("list")} className={`w-8 h-8 flex items-center justify-center transition-colors ${viewMode === "list" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`} title="List view">
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode("grid")} className={`w-8 h-8 flex items-center justify-center transition-colors ${viewMode === "grid" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`} title="Grid view">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button onClick={openAdd} className="bg-[#1A56DB] hover:bg-[#1447B4] text-white h-9 px-4 text-sm font-semibold">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Sub Hub
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-20 text-center">
          <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-black font-medium">{hasFilters ? "No sub hubs match your filters." : "No sub hubs yet."}</p>
          <p className="text-gray-400 text-sm mt-1">{hasFilters ? "Try adjusting your search or filters." : 'Click "Add Sub Hub" to create one.'}</p>
        </div>
      ) : viewMode === "grid" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedSubs.pageItems.map((sub) => (
              <SubHubCard
                key={sub.id}
                sub={sub as any}
                onEdit={() => openEdit(sub)}
                onDelete={() => setDeleteId(sub.id)}
              />
            ))}
          </div>
          <div className="mt-4">
            <PaginationBar page={pagedSubs.page} pages={pagedSubs.pages} total={pagedSubs.total} onChange={pagedSubs.setPage} label="sub hubs" />
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold text-black uppercase tracking-wide">
                <th className="px-3 py-4 text-left">Sub Hub</th>
                <th className="px-3 py-4 text-left">Location</th>
                <th className="px-3 py-4 text-left">Pincodes</th>
                <th className="px-3 py-4 text-center">Status</th>
                <th className="px-3 py-4 text-center">Active</th>
                <th className="px-3 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {pagedSubs.pageItems.map((sub) => (
                <SubHubTableRow
                  key={sub.id}
                  sub={sub as any}
                  onEdit={() => openEdit(sub)}
                  onDelete={() => setDeleteId(sub.id)}
                />
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <PaginationBar page={pagedSubs.page} pages={pagedSubs.pages} total={pagedSubs.total} onChange={pagedSubs.setPage} label="sub hubs" />
          </div>
        </div>
      )}

      <DeleteSubDialog subId={deleteId} superHubId={superHubId} onClose={() => setDeleteId(null)} />
    </div>
  );
}

function SubHubCard({ sub, onEdit, onDelete }: { sub: any; onEdit: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const toggleStatus = useToggleSubHubStatus();

  const handleToggle = () => {
    toggleStatus.mutate({ id: sub.id }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getGetSubHubsBySuperHubQueryKey(sub.superHubId) });
      },
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="h-36 w-full relative bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden flex-shrink-0">
        {sub.imageUrl ? (
          <img src={sub.imageUrl} alt={sub.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Layers className="w-10 h-10 text-blue-200" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-4">
          <h3 className="text-white text-sm font-bold drop-shadow">{sub.name}</h3>
        </div>
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/90 shadow-sm ${sub.status === "Active" ? "text-green-600" : "text-red-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sub.status === "Active" ? "bg-green-500" : "bg-red-500"}`} />
            {sub.status}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        {sub.location && (
          <div className="flex items-center text-sm text-black gap-1 mb-3">
            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">{sub.location}</span>
          </div>
        )}

        {sub.pincodes?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {sub.pincodes.slice(0, 4).map((p: string) => (
              <span key={p} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">{p}</span>
            ))}
            {sub.pincodes.length > 4 && (
              <span className="text-[10px] text-gray-400 px-1 py-0.5">+{sub.pincodes.length - 4} more</span>
            )}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
          <Button
            onClick={() => setLocation(`/sub-hub-menu/${sub.id}`)}
            className="w-full h-8 text-xs font-semibold bg-[#162B4D] hover:bg-[#1E3A5F] text-white gap-2"
            size="sm"
          >
            <Layers className="w-3.5 h-3.5" />
            Open Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={onEdit} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors" title="Edit">
                <MaskIcon src={iconEdit} color="#1A56DB" className="w-[16px] h-[16px]" />
              </button>
              <button onClick={onDelete} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors" title="Delete">
                <MaskIcon src={iconDelete} color="#E02424" className="w-[16px] h-[16px]" />
              </button>
            </div>
            <Switch checked={sub.status === "Active"} onCheckedChange={handleToggle} className="data-[state=checked]:bg-[#1A56DB] scale-90" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SubHubTableRow({ sub, onEdit, onDelete }: { sub: any; onEdit: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const toggleStatus = useToggleSubHubStatus();

  const handleToggle = () => {
    toggleStatus.mutate({ id: sub.id }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getGetSubHubsBySuperHubQueryKey(sub.superHubId) });
      },
    });
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-3 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-blue-50 to-indigo-100">
            {sub.imageUrl ? (
              <img src={sub.imageUrl} alt={sub.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Layers className="w-4 h-4 text-blue-300" />
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-black text-sm">{sub.name}</p>
            {sub.dbName && <p className="text-xs text-gray-400 font-mono mt-0.5">{sub.dbName}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center gap-1 text-sm text-black">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          {sub.location || <span className="text-gray-400">—</span>}
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {(sub.pincodes || []).slice(0, 3).map((p: string) => (
            <span key={p} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">{p}</span>
          ))}
          {(sub.pincodes || []).length > 3 && (
            <span className="text-[10px] text-gray-400">+{sub.pincodes.length - 3}</span>
          )}
          {(sub.pincodes || []).length === 0 && <span className="text-sm text-gray-400">—</span>}
        </div>
      </td>
      <td className="px-3 py-4 text-center">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${sub.status === "Active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sub.status === "Active" ? "bg-green-500" : "bg-gray-400"}`} />
          {sub.status}
        </span>
      </td>
      <td className="px-3 py-4 text-center">
        <Switch checked={sub.status === "Active"} onCheckedChange={handleToggle} className="data-[state=checked]:bg-[#1A56DB] scale-90" />
      </td>
      <td className="px-3 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setLocation(`/sub-hub-menu/${sub.id}`)}
            className="h-7 px-2 flex items-center gap-1 rounded border border-[#162B4D] bg-[#162B4D] text-white text-xs font-semibold hover:bg-[#1E3A5F] transition-colors mr-1"
            title="Open Dashboard"
          >
            <Layers className="w-3 h-3" />
            Dashboard
          </button>
          <button onClick={onEdit} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors" title="Edit">
            <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
          </button>
          <button onClick={onDelete} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors" title="Delete">
            <MaskIcon src={iconDelete} color="#E02424" className="w-[18px] h-[18px]" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SubHubForm({ subHub, superHubId, superHubName, onBack }: {
  subHub: any | null;
  superHubId: string;
  superHubName?: string;
  onBack: () => void;
}) {
  const isEditing = !!subHub;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateSubHub();
  const updateMutation = useUpdateSubHub();

  const [name, setName] = useState(subHub?.name || "");
  const [location, setLocation] = useState(subHub?.location || "");
  const [imageUrl, setImageUrl] = useState(subHub?.imageUrl || "");
  const [pincodes, setPincodes] = useState<string[]>(subHub?.pincodes || []);
  const [pinInput, setPinInput] = useState("");
  const [isActive, setIsActive] = useState(subHub ? subHub.status === "Active" : true);
  const [dbName, setDbName] = useState(subHub?.dbName || "");

  function computeDbName(n: string) {
    return n.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  }

  const addPin = () => {
    const val = pinInput.trim();
    if (val && !pincodes.includes(val)) { setPincodes([...pincodes, val]); setPinInput(""); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name, location, imageUrl, pincodes,
      status: isActive ? "Active" : ("Inactive" as const),
      ...(isEditing ? { dbName } : {}),
    };
    if (isEditing) {
      updateMutation.mutate({ id: subHub.id, data: payload as any }, {
        onSuccess: () => {
          toast({ title: "Sub Hub updated" });
          queryClient.invalidateQueries({ queryKey: getGetSubHubsBySuperHubQueryKey(superHubId) });
          onBack();
        },
      });
    } else {
      createMutation.mutate({ id: superHubId, data: payload as any }, {
        onSuccess: () => {
          toast({ title: "Sub Hub created" });
          queryClient.invalidateQueries({ queryKey: getGetSubHubsBySuperHubQueryKey(superHubId) });
          queryClient.invalidateQueries({ queryKey: getGetSuperHubsQueryKey() });
          onBack();
        },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }} className="max-w-2xl mx-auto">
      {/* Back header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#162B4D] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-[#162B4D]">{isEditing ? "Edit Sub Hub" : "Add Sub Hub"}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {superHubName ? `Under ${superHubName}` : ""}
            {isEditing ? ` — Editing ${subHub.name}` : " — Set up a new sub hub"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic Details */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sub Hub Details</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600">Sub Hub Name *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thane" className="h-9 text-black" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Thane, Mumbai" className="h-9 text-black" />
            </div>
          </div>

          <ImageUpload value={imageUrl} onChange={setImageUrl} folder="fishtokri/sub-hubs" label="Sub Hub Image" />

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-semibold text-black">Active Status</p>
              <p className="text-xs text-gray-500">Sub hub will be visible and operational</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" />
          </div>
        </div>

        {/* Database Name (edit only) */}
        {isEditing && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Database</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Database Name
              </Label>
              <Input
                value={dbName}
                onChange={(e) => setDbName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                placeholder="e.g. thane_hub"
                className="h-9 font-mono text-sm text-black"
              />
              <p className="text-xs text-gray-400">Only letters, numbers and underscores allowed.</p>
            </div>
          </div>
        )}

        {/* Pincodes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Service Areas</p>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">Pincodes</Label>
            <div className="flex gap-2">
              <Input
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPin(); } }}
                placeholder="Type a pincode and press Enter"
                className="h-9 text-black flex-1"
              />
              <Button type="button" variant="secondary" onClick={addPin} className="h-9 px-4 text-sm flex-shrink-0">
                Add
              </Button>
            </div>
            {pincodes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2 p-3 bg-gray-50 rounded-lg">
                {pincodes.map((p) => (
                  <span
                    key={p}
                    onClick={() => setPincodes(pincodes.filter((x) => x !== p))}
                    className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full cursor-pointer hover:bg-red-50 hover:text-red-600 transition-colors font-medium border border-blue-100"
                  >
                    {p}
                    <X className="w-2.5 h-2.5" />
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-1">No pincodes added yet. Add pincodes to define the service area.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 pb-8">
          <Button type="button" variant="outline" onClick={onBack} className="h-10 px-6">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} className="bg-[#1A56DB] hover:bg-[#1447B4] text-white h-10 px-6 font-semibold">
            {isPending ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span>
            ) : (
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{isEditing ? "Save Changes" : "Create Sub Hub"}</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DeleteSubDialog({ subId, superHubId, onClose }: { subId: string | null; superHubId: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteSubHub();
  return (
    <Dialog open={!!subId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[#162B4D]">Delete Sub Hub</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button
            onClick={() => {
              if (!subId) return;
              deleteMutation.mutate({ id: subId }, {
                onSuccess: () => {
                  toast({ title: "Sub Hub deleted" });
                  queryClient.invalidateQueries({ queryKey: getGetSubHubsBySuperHubQueryKey(superHubId) });
                  queryClient.invalidateQueries({ queryKey: getGetSuperHubsQueryKey() });
                  onClose();
                },
              });
            }}
            className="bg-red-600 hover:bg-red-700 text-white h-9"
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
