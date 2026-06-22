import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { FishCalculatorTabs } from "@/components/fish-calculator-tabs";

type Config = {
  market_handling_cost: number;
  fixed_cost: number;
  packaging_cost: number;
  delivery_cost: number;
};

type FormState = {
  market_handling_cost: string;
  fixed_cost: string;
  packaging_cost: string;
  delivery_cost: string;
};

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toForm(cfg: Config): FormState {
  return {
    market_handling_cost: String(cfg.market_handling_cost),
    fixed_cost: String(cfg.fixed_cost),
    packaging_cost: String(cfg.packaging_cost),
    delivery_cost: String(cfg.delivery_cost),
  };
}

const FIELDS: Array<{ key: keyof FormState; label: string }> = [
  { key: "market_handling_cost", label: "Market Handling Cost (₹/g)" },
  { key: "fixed_cost", label: "Fixed Cost (₹/g)" },
  { key: "packaging_cost", label: "Packaging Cost (₹/g)" },
  { key: "delivery_cost", label: "Delivery Cost (₹/g)" },
];

export default function FishCalculatorConfigPage() {
  const [form, setForm] = useState<FormState>({ market_handling_cost: "0", fixed_cost: "0", packaging_cost: "0", delivery_cost: "0" });
  const [loaded, setLoaded] = useState<Config | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const validationError = useMemo(() => {
    for (const { key, label } of FIELDS) {
      const v = parseNum(form[key]);
      if (v === null) return `Enter ${label}.`;
      if (v < 0) return `${label} must be ≥ 0.`;
    }
    return null;
  }, [form]);

  async function onLoad(opts?: { quiet?: boolean }) {
    setLoading(true);
    try {
      const cfg: Config = await apiFetch("/api/fish-calculator/config");
      setForm(toForm(cfg));
      setLoaded(cfg);
      setIsEditing(false);
      if (!opts?.quiet) toast({ title: "Config refreshed" });
    } catch (e: any) {
      toast({ title: e.message || "Failed to load config", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void onLoad({ quiet: true }); }, []);

  async function onSave() {
    if (validationError) { toast({ title: validationError, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: Config = {
        market_handling_cost: Number(form.market_handling_cost),
        fixed_cost: Number(form.fixed_cost),
        packaging_cost: Number(form.packaging_cost),
        delivery_cost: Number(form.delivery_cost),
      };
      const saved: Config = await apiFetch("/api/fish-calculator/config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setLoaded(saved);
      setIsEditing(false);
      toast({ title: "Configuration saved" });
    } catch (e: any) {
      toast({ title: e.message || "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <FishCalculatorTabs />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">All cost values are stored as <strong>₹ per gram (₹/g)</strong>. These are added to the effective price before applying margin.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                inputMode="decimal"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F05B4E]/40 disabled:bg-gray-50 disabled:text-gray-400"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!isEditing || loading || saving}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={loading}
              className="px-5 py-2.5 bg-[#F05B4E] hover:bg-[#d94a3d] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || loading || !!validationError}
                className="px-5 py-2.5 bg-[#F05B4E] hover:bg-[#d94a3d] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { if (loaded) setForm(toForm(loaded)); setIsEditing(false); }}
                disabled={saving}
                className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition"
              >
                Cancel
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onLoad()}
            disabled={loading || saving}
            className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-[#364F9F] text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loaded && (
          <div className="mt-2 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Current saved values</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">{label.replace(" (₹/g)", "")}</div>
                  <div className="text-sm font-semibold text-gray-800">₹ {loaded[key as keyof Config]}/g</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
