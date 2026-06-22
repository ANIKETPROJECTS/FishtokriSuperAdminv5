import { useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

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
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
function formatRupees(n: number) {
  return `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function TypeBadge({ type }: { type: "expired" | "reduced" }) {
  const isExpired = type === "expired";
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.03em",
      background: isExpired ? "#fef2f2" : "#fff7ed",
      color: isExpired ? "#dc2626" : "#c2410c",
      border: `1px solid ${isExpired ? "#fecaca" : "#fed7aa"}`,
    }}>
      {isExpired ? "Expired" : "Reduced"}
    </span>
  );
}

export default function WastageReportPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "expired" | "reduced">("all");
  const [selectedSubHubId, setSelectedSubHubId] = useState<string>("");

  const downloadRef = useRef<(() => void) | null>(null);

  const admin = getAdmin();
  const isMaster = admin?.role === "master_admin";
  const isSuperHub = admin?.role === "super_hub";
  const isSubHub = admin?.role === "sub_hub";

  // Fetch sub-hubs list for master/super hub selectors
  const { data: subHubsData } = useQuery({
    queryKey: ["sub-hubs-for-wastage"],
    queryFn: () => apiFetch("/api/sub-hubs"),
    enabled: isMaster || isSuperHub,
  });

  const subHubs: any[] = subHubsData?.subHubs ?? subHubsData?.data ?? [];

  // Resolve active sub hub ID
  const activeSubHubId = useMemo(() => {
    if (isSubHub) return admin?.subHubIds?.[0] || admin?.subHubId || "";
    if (selectedSubHubId) return selectedSubHubId;
    return subHubs[0]?._id || subHubs[0]?.id || "";
  }, [isSubHub, admin, selectedSubHubId, subHubs]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["wastage-report", activeSubHubId, from, to],
    queryFn: () => {
      const p = new URLSearchParams({ subHubId: activeSubHubId, from, to });
      return apiFetch(`/api/reports/wastage?${p}`);
    },
    enabled: !!activeSubHubId,
  });

  const records: any[] = data?.records ?? [];

  const filtered = useMemo(() => {
    let list = [...records];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.item || "").toLowerCase().includes(q) ||
        (r.batchId || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") list = list.filter(r => r.type === typeFilter);
    return list;
  }, [records, search, typeFilter]);

  const stats = useMemo(() => {
    const expired = records.filter(r => r.type === "expired");
    const reduced = records.filter(r => r.type === "reduced");
    const totalValue = records.reduce((s, r) => s + (r.totalPrice || 0), 0);
    const expiredValue = expired.reduce((s, r) => s + (r.totalPrice || 0), 0);
    const reducedValue = reduced.reduce((s, r) => s + (r.totalPrice || 0), 0);
    return {
      total: records.length,
      expired: expired.length,
      reduced: reduced.length,
      totalValue,
      expiredValue,
      reducedValue,
    };
  }, [records]);

  const handleDownload = useCallback(() => {
    if (!filtered.length) return;
    const rows: any[][] = [
      ["Batch ID", "Date Added", "Expiry Date", "Item", "Type", "Qty", "Unit", "Total Price (₹)", "Reason", "Date of Operation"],
    ];
    for (const r of filtered) {
      rows.push([
        r.batchId || "—",
        r.dateAdded ? formatDate(r.dateAdded) : "—",
        r.expiryDate ? formatDate(r.expiryDate) : "—",
        r.item || "—",
        r.type === "expired" ? "Expired" : "Reduced",
        r.quantity ?? 0,
        r.unit || "",
        r.totalPrice ?? 0,
        r.reason || "—",
        r.operationDate ? formatDateTime(r.operationDate) : "—",
      ]);
    }
    rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Total Wastage Records", stats.total]);
    rows.push(["Expired Items", stats.expired, "", "", "", "", "", formatRupees(stats.expiredValue)]);
    rows.push(["Reduced Items", stats.reduced, "", "", "", "", "", formatRupees(stats.reducedValue)]);
    rows.push(["Total Wastage Value", "", "", "", "", "", "", formatRupees(stats.totalValue)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 28 },
      { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 22 }, { wch: 24 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wastage Report");
    XLSX.writeFile(wb, `wastage-report-${from}-to-${to}.xlsx`);
  }, [filtered, stats, from, to]);

  downloadRef.current = handleDownload;

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
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        <Trash2 style={{ width: 16, height: 16, color: "#F05B4E" }} />
        <h1 style={{ fontSize: 15, fontWeight: 700, color: "#000", margin: 0, whiteSpace: "nowrap" }}>
          Wastage Report
        </h1>
      </div>

      <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />

      {/* Sub-hub selector for master/super-hub */}
      {(isMaster || isSuperHub) && subHubs.length > 1 && (
        <>
          <select
            value={selectedSubHubId || activeSubHubId}
            onChange={e => setSelectedSubHubId(e.target.value)}
            style={{ ...dateInputStyle, width: 160, paddingRight: 6 }}
          >
            {subHubs.map((s: any) => (
              <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>
            ))}
          </select>
          <div style={{ width: 1, height: 20, background: "#e5e7eb", flexShrink: 0 }} />
        </>
      )}

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: "#888", whiteSpace: "nowrap" }}>From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
        <label style={{ fontSize: 11, fontWeight: 500, color: "#888", whiteSpace: "nowrap" }}>To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
      </div>

      <div style={{ flex: 1 }} />

      {/* Type filter pills */}
      <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 9, padding: 3, gap: 2, flexShrink: 0 }}>
        {(["all", "expired", "reduced"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{
              padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: "Poppins, sans-serif",
              transition: "all 0.15s",
              background: typeFilter === t ? "#fff" : "transparent",
              color: typeFilter === t ? "#F05B4E" : "#666",
              boxShadow: typeFilter === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {t === "all" ? "All" : t === "expired" ? "Expired" : "Reduced"}
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
      {headerSlot && createPortal(headerContent, headerSlot)}

      <div style={{ padding: "24px 28px", background: "#fff", minHeight: "100vh", ...POPPINS }}>

        {/* Stats strip */}
        {records.length > 0 && (
          <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 14, border: "1px solid #ebebeb", marginBottom: 20, overflow: "hidden" }}>
            {[
              { label: "Total Records", value: String(stats.total), color: "#000" },
              { label: "Expired Items", value: String(stats.expired), color: "#dc2626" },
              { label: "Reduced Items", value: String(stats.reduced), color: "#c2410c" },
              { label: "Expired Value", value: formatRupees(stats.expiredValue), color: "#dc2626" },
              { label: "Reduced Value", value: formatRupees(stats.reducedValue), color: "#c2410c" },
              { label: "Total Wastage Value", value: formatRupees(stats.totalValue), color: "#000" },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ flex: 1, padding: "16px 18px", borderRight: i < arr.length - 1 ? "1px solid #ebebeb" : "none" }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{s.label}</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Empty / loading / error states */}
        {!activeSubHubId && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#aaa", fontSize: 14 }}>
            No sub hub linked to your account.
          </div>
        )}
        {activeSubHubId && isLoading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#aaa", fontSize: 14 }}>
            Loading wastage data…
          </div>
        )}
        {activeSubHubId && isError && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#ef4444", fontSize: 14 }}>
            Failed to load wastage report. Please try again.
          </div>
        )}

        {/* Search bar + table */}
        {activeSubHubId && !isLoading && !isError && (
          <>
            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#aaa", pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="Search by item, batch ID, reason…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    paddingLeft: 28, paddingRight: 10, height: 32,
                    border: "1px solid #e5e7eb", borderRadius: 8,
                    fontSize: 12, fontFamily: "Poppins, sans-serif",
                    color: "#000", background: "#fff", width: 260, outline: "none",
                  }}
                />
              </div>
              {filtered.length !== records.length && (
                <span style={{ fontSize: 12, color: "#888" }}>
                  Showing {filtered.length} of {records.length} records
                </span>
              )}
            </div>

            {records.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#aaa", fontSize: 14 }}>
                No wastage records found for the selected period.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#aaa", fontSize: 14 }}>
                No records match your search or filter.
              </div>
            ) : (
              <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #ebebeb" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#162B4D" }}>
                      {[
                        "Batch ID", "Date Added", "Expiry Date",
                        "Item", "Type", "Qty", "Total Price", "Date of Operation",
                      ].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            padding: "11px 14px",
                            textAlign: i >= 5 ? "right" : "left",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#fff",
                            whiteSpace: "nowrap",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, idx) => (
                      <tr
                        key={r.id || idx}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#fafafa",
                          borderBottom: "1px solid #f0f0f0",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f5f3ff"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? "#fff" : "#fafafa"}
                      >
                        {/* Batch ID */}
                        <td style={{ padding: "10px 14px", color: "#374151", fontWeight: 500, fontFamily: "monospace", fontSize: 12 }}>
                          {r.batchId || "—"}
                        </td>
                        {/* Date Added */}
                        <td style={{ padding: "10px 14px", color: "#555", whiteSpace: "nowrap" }}>
                          {formatDate(r.dateAdded)}
                        </td>
                        {/* Expiry Date */}
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          {r.expiryDate ? (
                            <span style={{ color: "#dc2626", fontWeight: 600 }}>
                              {formatDate(r.expiryDate)}
                            </span>
                          ) : "—"}
                        </td>
                        {/* Item */}
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111", maxWidth: 200 }}>
                          {r.item}
                          {r.unit && (
                            <span style={{ marginLeft: 5, fontSize: 11, color: "#888", fontWeight: 400 }}>{r.unit}</span>
                          )}
                          {r.reason && (
                            <div style={{ fontSize: 11, color: "#999", fontWeight: 400, marginTop: 2 }}>{r.reason}</div>
                          )}
                        </td>
                        {/* Type badge */}
                        <td style={{ padding: "10px 14px" }}>
                          <TypeBadge type={r.type} />
                        </td>
                        {/* Quantity */}
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "#dc2626" }}>
                          {(r.quantity ?? 0).toLocaleString("en-IN")}
                        </td>
                        {/* Total Price */}
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#111", whiteSpace: "nowrap" }}>
                          {r.totalPrice > 0 ? formatRupees(r.totalPrice) : "—"}
                        </td>
                        {/* Date of Operation */}
                        <td style={{ padding: "10px 14px", textAlign: "right", color: "#555", whiteSpace: "nowrap", fontSize: 12 }}>
                          {formatDateTime(r.operationDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary footer */}
                  {filtered.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#162B4D", borderTop: "2px solid #364F9F" }}>
                        <td colSpan={5} style={{ padding: "12px 14px", fontWeight: 700, color: "#fff", fontSize: 13 }}>
                          {filtered.length < records.length
                            ? `FILTERED TOTAL — ${filtered.length} records`
                            : `TOTAL — ${filtered.length} records`}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: "#fff", fontSize: 16 }}>
                          {filtered.reduce((s, r) => s + (r.quantity || 0), 0).toLocaleString("en-IN")}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: "#fff", fontSize: 16, whiteSpace: "nowrap" }}>
                          {formatRupees(filtered.reduce((s, r) => s + (r.totalPrice || 0), 0))}
                        </td>
                        <td style={{ padding: "12px 14px" }} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
