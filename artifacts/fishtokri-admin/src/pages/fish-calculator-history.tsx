import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { FishCalculatorTabs } from "@/components/fish-calculator-tabs";

type RecordItem = {
  id: string;
  record_date: string;
  created_at: string;
  inputs: {
    buy_price_per_kg?: number;
    wastage_percent?: number;
    margin_percent?: number;
    total_kg?: number;
    total_purchase_kg?: number;
    expiry_date?: string;
    raw_fish_product_name?: string;
    batch_number?: string;
  };
  config: any;
  outputs: {
    final_sale_price_per_gram?: number;
    packet_prices?: Record<string, number>;
  };
};

type EditState = {
  id: string | null;
  buy_price_per_kg: string;
  wastage_percent: string;
  margin_percent: string;
  total_kg: string;
};

const PACKET_WEIGHTS = [100, 250, 500, 750, 1000] as const;

function fmt2(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
}

function packetPriceForWeight(r: RecordItem, w: number): number | null {
  const fromSaved = r.outputs?.packet_prices || {};
  const k = `${w}g`;
  const saved = fromSaved[k];
  if (typeof saved === "number" && Number.isFinite(saved)) return saved;
  const finalPerGram = Number(r.outputs?.final_sale_price_per_gram);
  if (!Number.isFinite(finalPerGram)) return null;
  return Math.round(finalPerGram * w * 100) / 100;
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function FishCalculatorHistoryPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [limit, setLimit] = useState(50);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ id: null, buy_price_per_kg: "", wastage_percent: "", margin_percent: "", total_kg: "" });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      params.set("limit", String(limit));
      const data = await apiFetch(`/api/fish-calculator/records?${params}`);
      setRecords(data);
    } catch (e: any) {
      toast({ title: e.message || "Failed to load history", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const name = String(r.inputs.raw_fish_product_name || "").toLowerCase();
      const date = String(r.record_date || "").toLowerCase();
      const buy = String(r.inputs.buy_price_per_kg ?? "").toLowerCase();
      return name.includes(q) || date.includes(q) || buy.includes(q);
    });
  }, [records, query]);

  function startEdit(r: RecordItem) {
    const totalKg = r.inputs.total_kg ?? r.inputs.total_purchase_kg;
    setEdit({
      id: r.id,
      buy_price_per_kg: String(r.inputs.buy_price_per_kg ?? ""),
      wastage_percent: String(r.inputs.wastage_percent ?? ""),
      margin_percent: String(r.inputs.margin_percent ?? ""),
      total_kg: totalKg != null ? String(totalKg) : "",
    });
  }

  function cancelEdit() {
    setEdit({ id: null, buy_price_per_kg: "", wastage_percent: "", margin_percent: "", total_kg: "" });
  }

  const editError = useMemo(() => {
    if (!edit.id) return null;
    const buy = parseNum(edit.buy_price_per_kg);
    const wastage = parseNum(edit.wastage_percent);
    const margin = parseNum(edit.margin_percent);
    if (buy === null || buy <= 0) return "Buy must be > 0.";
    if (wastage === null || wastage < 0 || wastage >= 100) return "Wastage must be ≥ 0 and < 100.";
    if (margin === null || margin < 0) return "Margin must be ≥ 0.";
    return null;
  }, [edit]);

  async function saveEdit() {
    if (!edit.id || editError) { toast({ title: editError || "Fix errors first", variant: "destructive" }); return; }
    setSavingId(edit.id);
    try {
      const totalKg = parseNum(edit.total_kg);
      const r = records.find((x) => x.id === edit.id);
      const payload: any = {
        buy_price_per_kg: Number(edit.buy_price_per_kg),
        wastage_percent: Number(edit.wastage_percent),
        margin_percent: Number(edit.margin_percent),
      };
      if (totalKg !== null) {
        if (r?.inputs.total_purchase_kg !== undefined) payload.total_purchase_kg = totalKg;
        else payload.total_kg = totalKg;
      }
      const updated = await apiFetch(`/api/fish-calculator/records/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setRecords((prev) => prev.map((rec) => (rec.id === edit.id ? updated : rec)));
      cancelEdit();
      toast({ title: "Updated" });
    } catch (e: any) {
      toast({ title: e.message || "Failed to update", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this record?")) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/fish-calculator/records/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: e.message || "Failed to delete", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  function exportCSV() {
    if (!filtered.length) { toast({ title: "No records to export", variant: "destructive" }); return; }
    const headers = ["Date", "Batch", "Product", "Buy (₹/kg)", "Wastage (%)", "Margin (%)", "Total (kg)", "Expiry", "Final (₹/g)", "100g", "250g", "500g", "750g", "1000g"];
    const rows = filtered.map((r) => [
      r.record_date,
      r.inputs.batch_number || "",
      r.inputs.raw_fish_product_name || "",
      r.inputs.buy_price_per_kg ?? "",
      fmt2(r.inputs.wastage_percent),
      r.inputs.margin_percent ?? "",
      fmt2((r.inputs.total_kg ?? r.inputs.total_purchase_kg) ?? "-"),
      r.inputs.expiry_date || "",
      fmt2(r.outputs?.final_sale_price_per_gram),
      ...PACKET_WEIGHTS.map((w) => fmt2(packetPriceForWeight(r, w) ?? "-")),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fish_purchase_history_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <FishCalculatorTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">History</h1>
          <p className="text-sm text-gray-500 mt-1">Filter by date and track calculations.</p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          disabled={!filtered.length}
          className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-[#364F9F] font-medium disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From date</label>
            <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To date</label>
            <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Limit</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="px-5 py-2 bg-[#F05B4E] hover:bg-[#d94a3d] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <input
            className="ml-auto border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[180px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
          Saved calculations ({filtered.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                {["Date", "Batch", "Product", "Buy (₹/kg)", "Wastage %", "Margin %", "Total kg", "Expiry", "Final ₹/g", "100g", "250g", "500g", "750g", "1000g", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-mono text-gray-700 whitespace-nowrap">{r.record_date}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-500 whitespace-nowrap">{r.inputs.batch_number || "-"}</td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.inputs.raw_fish_product_name || "-"}</td>
                  <td className="px-3 py-2.5">
                    {edit.id === r.id ? (
                      <input className="w-24 border border-gray-200 rounded px-2 py-1 text-xs" inputMode="decimal" value={edit.buy_price_per_kg} onChange={(e) => setEdit((s) => ({ ...s, buy_price_per_kg: e.target.value }))} />
                    ) : r.inputs.buy_price_per_kg}
                  </td>
                  <td className="px-3 py-2.5">
                    {edit.id === r.id ? (
                      <input className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" inputMode="decimal" value={edit.wastage_percent} onChange={(e) => setEdit((s) => ({ ...s, wastage_percent: e.target.value }))} />
                    ) : fmt2(r.inputs.wastage_percent)}
                  </td>
                  <td className="px-3 py-2.5">
                    {edit.id === r.id ? (
                      <input className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" inputMode="decimal" value={edit.margin_percent} onChange={(e) => setEdit((s) => ({ ...s, margin_percent: e.target.value }))} />
                    ) : r.inputs.margin_percent}
                  </td>
                  <td className="px-3 py-2.5">
                    {edit.id === r.id ? (
                      <input className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" inputMode="decimal" value={edit.total_kg} onChange={(e) => setEdit((s) => ({ ...s, total_kg: e.target.value }))} placeholder="kg" />
                    ) : fmt2((r.inputs.total_kg ?? r.inputs.total_purchase_kg) ?? "-")}
                  </td>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap">{r.inputs.expiry_date || "-"}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{fmt2(r.outputs?.final_sale_price_per_gram)}</td>
                  {PACKET_WEIGHTS.map((w) => (
                    <td key={w} className="px-3 py-2.5 text-gray-700">{fmt2(packetPriceForWeight(r, w) ?? "-")}</td>
                  ))}
                  <td className="px-3 py-2.5">
                    {edit.id === r.id ? (
                      <div className="flex gap-1">
                        <button onClick={saveEdit} disabled={savingId === r.id} className="px-2 py-1 rounded bg-[#F05B4E] text-white text-xs hover:bg-[#d94a3d] disabled:opacity-50">✓</button>
                        <button onClick={cancelEdit} className="px-2 py-1 rounded border border-gray-200 text-xs hover:bg-gray-50">✕</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(r)} className="px-2 py-1 rounded border border-gray-200 text-xs hover:bg-gray-50" title="Edit">✎</button>
                        <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} className="px-2 py-1 rounded border border-red-200 text-red-500 text-xs hover:bg-red-50 disabled:opacity-50" title="Delete">
                          {deletingId === r.id ? "…" : "🗑"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={15} className="px-5 py-8 text-center text-sm text-gray-400">No records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
