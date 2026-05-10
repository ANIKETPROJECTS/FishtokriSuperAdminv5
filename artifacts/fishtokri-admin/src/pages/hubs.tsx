import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Edit2, Trash2, MapPin, Building2, X, UserPlus, Layers,
  Search, ArrowUpDown, SlidersHorizontal, LayoutGrid, LayoutList,
  ArrowLeft, CheckCircle2,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { PaginationBar } from "@/components/pagination-bar";
import { usePaginated } from "@/hooks/use-paginated";
import {
  useGetSuperHubs,
  getGetSuperHubsQueryKey,
  useCreateSuperHub,
  useUpdateSuperHub,
  useDeleteSuperHub,
  useToggleSuperHubStatus,
  useCreateUser,
  getGetUsersQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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

type SortOption = "name_asc" | "name_desc" | "subhubs_asc" | "subhubs_desc" | "status";
type UserEntry = { name: string; email: string; phone: string; role: "super_hub" | "sub_hub" };

export default function Hubs() {
  const { data: superHubsData, isLoading } = useGetSuperHubs(undefined, {
    query: { queryKey: getGetSuperHubsQueryKey() },
  });

  const superHubs = superHubsData?.superHubs || [];

  const [formMode, setFormMode] = useState<null | "add" | "edit">(null);
  const [editingHub, setEditingHub] = useState<any>(null);
  const [deleteSuperHubId, setDeleteSuperHubId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("all");
  const [sort, setSort] = useState<SortOption>("name_asc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const stats = {
    total: superHubs.length,
    active: superHubs.filter((h) => h.status === "Active").length,
    totalSubHubs: superHubs.reduce((acc, h) => acc + h.subHubCount, 0),
  };

  const filtered = superHubs
    .filter((h) => {
      const q = search.toLowerCase();
      const matchesSearch = !q || h.name.toLowerCase().includes(q) || (h.location || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || h.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "subhubs_asc") return a.subHubCount - b.subHubCount;
      if (sort === "subhubs_desc") return b.subHubCount - a.subHubCount;
      if (sort === "status") return a.status.localeCompare(b.status);
      return 0;
    });

  const pagedHubs = usePaginated(filtered, 20, `${search}|${statusFilter}|${sort}`);
  const hasFilters = !!(search || statusFilter !== "all");

  const clearFilters = () => { setSearch(""); setStatusFilter("all"); };

  const openAdd = () => { setEditingHub(null); setFormMode("add"); };
  const openEdit = (hub: any) => { setEditingHub(hub); setFormMode("edit"); };

  if (formMode) {
    return (
      <SuperHubForm
        hub={editingHub}
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
            <h1 className="text-sm font-bold text-[#162B4D] leading-tight">Hubs</h1>
            <p className="text-xs text-gray-500 leading-tight hidden sm:block">
              Manage your distribution network hierarchy — super hubs and sub hubs.
            </p>
          </div>
          <span className="text-3xl font-bold text-[#162B4D] flex-shrink-0 ml-4">{stats.total}</span>
        </div>,
        headerSlot,
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Total Super Hubs", value: stats.total, color: "text-[#162B4D]" },
          { label: "Active Super Hubs", value: stats.active, color: "text-green-600" },
          { label: "Total Sub Hubs", value: stats.totalSubHubs, color: "text-[#1A56DB]" },
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
            placeholder="Search by name or location..."
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
            <SelectItem value="subhubs_desc">Sub Hubs (Most)</SelectItem>
            <SelectItem value="subhubs_asc">Sub Hubs (Least)</SelectItem>
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
          <span className="text-xs text-black font-medium">{filtered.length} of {superHubs.length}</span>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button onClick={() => setViewMode("list")} className={`w-8 h-8 flex items-center justify-center transition-colors ${viewMode === "list" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`} title="List view">
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode("grid")} className={`w-8 h-8 flex items-center justify-center transition-colors ${viewMode === "grid" ? "bg-[#162B4D] text-white" : "text-black hover:bg-gray-50"}`} title="Grid view">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button
            onClick={openAdd}
            className="bg-[#1A56DB] hover:bg-[#1447B4] text-white h-9 px-4 text-sm font-semibold"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Super Hub
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-20 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-black font-medium">{hasFilters ? "No hubs match your filters." : "No super hubs yet."}</p>
          <p className="text-gray-400 text-sm mt-1">{hasFilters ? "Try adjusting your search or filters." : 'Click "Add Super Hub" to get started.'}</p>
        </div>
      ) : viewMode === "grid" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedHubs.pageItems.map((hub) => (
              <SuperHubCard
                key={hub.id}
                hub={hub}
                onEdit={() => openEdit(hub)}
                onDelete={() => setDeleteSuperHubId(hub.id)}
              />
            ))}
          </div>
          <div className="mt-4">
            <PaginationBar page={pagedHubs.page} pages={pagedHubs.pages} total={pagedHubs.total} onChange={pagedHubs.setPage} label="hubs" />
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold text-black uppercase tracking-wide">
                <th className="px-3 py-4 text-left">Hub</th>
                <th className="px-3 py-4 text-left">Location</th>
                <th className="px-3 py-4 text-center">Sub Hubs</th>
                <th className="px-3 py-4 text-center">Status</th>
                <th className="px-3 py-4 text-center">Active</th>
                <th className="px-3 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {pagedHubs.pageItems.map((hub) => (
                <SuperHubTableRow
                  key={hub.id}
                  hub={hub}
                  onEdit={() => openEdit(hub)}
                  onDelete={() => setDeleteSuperHubId(hub.id)}
                />
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <PaginationBar page={pagedHubs.page} pages={pagedHubs.pages} total={pagedHubs.total} onChange={pagedHubs.setPage} label="hubs" />
          </div>
        </div>
      )}

      <DeleteSuperDialog hubId={deleteSuperHubId} onClose={() => setDeleteSuperHubId(null)} />
    </div>
  );
}

function SuperHubCard({ hub, onEdit, onDelete }: { hub: any; onEdit: () => void; onDelete: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const toggleStatus = useToggleSuperHubStatus();

  const handleToggle = () => {
    toggleStatus.mutate({ id: hub.id }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getGetSuperHubsQueryKey() });
      },
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="h-40 w-full relative bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden flex-shrink-0">
        {hub.imageUrl ? (
          <img src={hub.imageUrl} alt={hub.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 className="w-12 h-12 text-blue-200" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-4">
          <h3 className="text-white text-base font-bold drop-shadow">{hub.name}</h3>
        </div>
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/90 shadow-sm ${hub.status === "Active" ? "text-green-600" : "text-red-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${hub.status === "Active" ? "bg-green-500" : "bg-red-500"}`} />
            {hub.status}
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center text-sm text-black gap-1">
            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">{hub.location || "Location not set"}</span>
          </div>
          <span className="text-xs bg-blue-50 text-[#1A56DB] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
            {hub.subHubCount} Sub Hubs
          </span>
        </div>

        <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
          <Button
            onClick={() => setLocation(`/hubs/${hub.id}`)}
            className="w-full h-8 text-xs font-semibold bg-[#162B4D] hover:bg-[#1E3A5F] text-white gap-2"
            size="sm"
          >
            <Layers className="w-3.5 h-3.5" />
            View Sub Hubs
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={onEdit}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
                title="Edit"
              >
                <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={onDelete}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <MaskIcon src={iconDelete} color="#E02424" className="w-[18px] h-[18px]" />
              </button>
            </div>
            <Switch
              checked={hub.status === "Active"}
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-[#1A56DB] scale-90"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SuperHubTableRow({ hub, onEdit, onDelete }: { hub: any; onEdit: () => void; onDelete: () => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const toggleStatus = useToggleSuperHubStatus();

  const handleToggle = () => {
    toggleStatus.mutate({ id: hub.id }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getGetSuperHubsQueryKey() });
      },
    });
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-3 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-blue-50 to-indigo-100">
            {hub.imageUrl ? (
              <img src={hub.imageUrl} alt={hub.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="w-4 h-4 text-blue-300" />
              </div>
            )}
          </div>
          <p className="font-semibold text-black text-sm">{hub.name}</p>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center gap-1 text-sm text-black">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          {hub.location || <span className="text-gray-400">—</span>}
        </div>
      </td>
      <td className="px-3 py-4 text-center">
        <button
          onClick={() => setLocation(`/hubs/${hub.id}`)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A56DB] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors"
        >
          <Layers className="w-3 h-3" />
          {hub.subHubCount} Sub Hubs
        </button>
      </td>
      <td className="px-3 py-4 text-center">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${hub.status === "Active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${hub.status === "Active" ? "bg-green-500" : "bg-gray-400"}`} />
          {hub.status}
        </span>
      </td>
      <td className="px-3 py-4 text-center">
        <Switch
          checked={hub.status === "Active"}
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-[#1A56DB] scale-90"
        />
      </td>
      <td className="px-3 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <MaskIcon src={iconEdit} color="#1A56DB" className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <MaskIcon src={iconDelete} color="#E02424" className="w-[18px] h-[18px]" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SuperHubForm({ hub, onBack }: { hub: any | null; onBack: () => void }) {
  const isEditing = !!hub;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateSuperHub();
  const updateMutation = useUpdateSuperHub();
  const createUserMutation = useCreateUser();

  const [name, setName] = useState(hub?.name || "");
  const [location, setLocation] = useState(hub?.location || "");
  const [imageUrl, setImageUrl] = useState(hub?.imageUrl || "");
  const [isActive, setIsActive] = useState(hub ? hub.status === "Active" : true);

  const [users, setUsers] = useState<UserEntry[]>([]);
  const [newUser, setNewUser] = useState<UserEntry>({ name: "", email: "", phone: "", role: "super_hub" });

  const addUser = () => {
    if (!newUser.name || !newUser.email) return;
    setUsers([...users, newUser]);
    setNewUser({ name: "", email: "", phone: "", role: "super_hub" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, location, imageUrl, status: isActive ? "Active" : ("Inactive" as const) };
    if (isEditing) {
      updateMutation.mutate({ id: hub.id, data: payload }, {
        onSuccess: () => {
          toast({ title: "Super Hub updated" });
          queryClient.invalidateQueries({ queryKey: getGetSuperHubsQueryKey() });
          onBack();
        },
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: async (res) => {
          const superHubId = (res as any)?.superHub?.id;
          if (users.length > 0 && superHubId) {
            for (const u of users) {
              try {
                await createUserMutation.mutateAsync({ data: { ...u, superHubId: String(superHubId), status: "Active" } as any });
              } catch {}
            }
            queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
          }
          toast({ title: `Super Hub created${users.length > 0 ? ` with ${users.length} user(s)` : ""}` });
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
          <h2 className="text-xl font-bold text-[#162B4D]">{isEditing ? "Edit Super Hub" : "Add Super Hub"}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{isEditing ? `Editing ${hub.name}` : "Set up a new super hub for your distribution network"}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Hub Details Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hub Details</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600">Hub Name *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mumbai" className="h-9 text-black" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Mumbai, Maharashtra" className="h-9 text-black" />
            </div>
          </div>

          <ImageUpload value={imageUrl} onChange={setImageUrl} folder="fishtokri/super-hubs" label="Hub Image" />

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-semibold text-black">Active Status</p>
              <p className="text-xs text-gray-500">Hub will be visible and operational</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-[#1A56DB]" />
          </div>
        </div>

        {/* Users Card (create only) */}
        {!isEditing && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Add Users</p>
              {users.length > 0 && (
                <span className="text-xs font-semibold text-[#1A56DB] bg-blue-50 px-2 py-0.5 rounded-full">{users.length} added</span>
              )}
            </div>
            <p className="text-xs text-gray-500">Optionally add users to manage this hub. You can also add them later from Admin Users.</p>

            <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-2">
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Name" className="h-9 text-sm text-black" />
                <Input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="Email" className="h-9 text-sm text-black" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} placeholder="Phone (optional)" className="h-9 text-sm text-black" />
                <Select value={newUser.role} onValueChange={(v: any) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger className="h-9 text-sm text-black"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_hub">Super Hub Admin</SelectItem>
                    <SelectItem value="sub_hub">Sub Hub Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={addUser} disabled={!newUser.name || !newUser.email} className="w-full h-9 text-sm border-dashed">
                <UserPlus className="w-4 h-4 mr-1.5" /> Add User to List
              </Button>
            </div>

            {users.length > 0 && (
              <div className="space-y-2">
                {users.map((u, i) => (
                  <div key={i} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#1A56DB]">{u.name[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.email} · {u.role === "super_hub" ? "Super Hub Admin" : "Sub Hub Admin"}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setUsers(users.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 pb-8">
          <Button type="button" variant="outline" onClick={onBack} className="h-10 px-6">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} className="bg-[#1A56DB] hover:bg-[#1447B4] text-white h-10 px-6 font-semibold">
            {isPending ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span>
            ) : (
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{isEditing ? "Save Changes" : "Create Super Hub"}</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DeleteSuperDialog({ hubId, onClose }: { hubId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteSuperHub();
  return (
    <Dialog open={!!hubId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[#162B4D]">Delete Super Hub</DialogTitle>
          <DialogDescription>This action cannot be undone. All associated sub hubs will also be removed.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-9">Cancel</Button>
          <Button
            onClick={() => {
              if (!hubId) return;
              deleteMutation.mutate({ id: hubId }, {
                onSuccess: () => {
                  toast({ title: "Super Hub deleted" });
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
