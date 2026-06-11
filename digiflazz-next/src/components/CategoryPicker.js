"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Check, Search } from "lucide-react";

/**
 * Multi-select category picker. Loads categories from /api/categories.
 * value: string[] of selected category names. onChange(names).
 * mode: "buyer" | "add"
 */
export default function CategoryPicker({ label, value = [], onChange, mode = "buyer", placeholder }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/categories?mode=${mode}`);
      const data = await res.json();
      if (data.ok) {
        setCats(data.categories);
        setLoaded(true);
      } else {
        setError(data.error || "Gagal memuat kategori.");
      }
    } catch (e) {
      setError(`Kesalahan jaringan: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // auto-load once on mount
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const selected = new Set(value);
  function toggle(name) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(Array.from(next));
  }

  const filtered = cats.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase().trim())
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="label mb-0">{label}</label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 disabled:opacity-50 dark:text-brand-300"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Muat ulang
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {error} — atur cookie di Pengaturan, lalu Muat ulang.
        </p>
      ) : loading && !loaded ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat kategori...
        </div>
      ) : (
        <>
          {cats.length > 8 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                className="field pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder || "Cari kategori..."}
              />
            </div>
          )}
          <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {filtered.length === 0 ? (
              <p className="px-1 py-1 text-xs text-slate-400">
                {loaded ? "Tidak ada kategori." : "Belum dimuat."}
              </p>
            ) : (
              filtered.map((c) => {
                const active = selected.has(c.name);
                return (
                  <button
                    key={c.id ?? c.name}
                    type="button"
                    onClick={() => toggle(c.name)}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {c.name}
                  </button>
                );
              })
            )}
          </div>
          {value.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {value.length} dipilih
            </p>
          )}
        </>
      )}
    </div>
  );
}
