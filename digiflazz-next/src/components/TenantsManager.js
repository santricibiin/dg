"use client";

import { useState } from "react";
import { Loader2, Trash2, Building2, X, CalendarClock, Gauge } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "trial", label: "Trial" },
  { value: "active", label: "Aktif" },
  { value: "past_due", label: "Tertunggak" },
  { value: "suspended", label: "Ditangguhkan" },
];

const STATUS_STYLE = {
  trial: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  past_due: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  suspended: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TenantsManager({ initialTenants }) {
  const [tenants, setTenants] = useState(initialTenants);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  // modal: { type: "trial"|"quota"|"delete", tenant, value }
  const [modal, setModal] = useState(null);

  async function patch(id, payload) {
    setBusy(id);
    setError("");
    try {
const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memperbarui.");
      return false;
      }
      setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
      return true;
    } catch (e) {
      setError(`Kesalahan jaringan: ${e.message}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function doDelete(id) {
    setBusy(id);
    setError("");
    try {
    const res = await fetch(`/api/admin/tenants/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal menghapus.");
 return false;
      }
      setTenants((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (e) {
    setError(`Kesalahan jaringan: ${e.message}`);
      return false;
    } finally {
      setBusy(null);
}
  }

  function openTrial(t) {
  setModal({ type: "trial", tenant: t, value: "1" });
  }
  function openQuota(t) {
    setModal({ type: "quota", tenant: t, value: String(t.monthlyQuota ?? 0) });
  }
  function openDelete(t) {
    setModal({ type: "delete", tenant: t, value: "" });
  }

  async function submitModal() {
    if (!modal) return;
    const { type, tenant, value } = modal;
    if (type === "trial") {
      const days = parseInt(value, 10);
      if (isNaN(days) || days <= 0) {
        setError("Jumlah hari trial tidak valid.");
        return;
      }
      const ok = await patch(tenant.id, { trialDays: days });
      if (ok) setModal(null);
 } else if (type === "quota") {
      const q = parseInt(value, 10);
      if (isNaN(q) || q < 0) {
     setError("Kuota tidak valid.");
        return;
      }
const ok = await patch(tenant.id, { monthlyQuota: q });
      if (ok) setModal(null);
  } else if (type === "delete") {
      const ok = await doDelete(tenant.id);
  if (ok) setModal(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
     <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
{error}
     </div>
      )}

      <TenantTable
        tenants={tenants}
        busy={busy}
        onStatus={(id, status) => patch(id, { status })}
        onTrial={openTrial}
    onQuota={openQuota}
        onExtend={(id) => patch(id, { extendDays: 30, status: "active" })}
        onDelete={openDelete}
      />

      {modal && (
        <TenantModal
          modal={modal}
          busy={busy === modal.tenant.id}
          onChange={(value) => setModal((m) => ({ ...m, value }))}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
        />
      )}
  </div>
  );
}

function TenantTable({ tenants, busy, onStatus, onTrial, onQuota, onExtend, onDelete }) {
  return (
    <div className="card overflow-x-auto p-0">
   <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-700">
 <th className="px-4 py-3 font-medium">Tenant</th>
      <th className="px-4 py-3 font-medium">Pengguna</th>
        <th className="px-4 py-3 font-medium">Kuota Bulan Ini</th>
         <th className="px-4 py-3 font-medium">Kedaluwarsa</th>
          <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Aksi</th>
        </tr>
        </thead>
        <tbody>
          {tenants.length === 0 ? (
            <tr>
     <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
  Belum ada tenant.
</td>
   </tr>
   ) : (
         tenants.map((t) => {
              const limit = Number(t.monthlyQuota) || 0;
              const unlimited = limit <= 0;
    const used = t.monthlyUsage ?? 0;
              const ratio = unlimited ? 0 : Math.min(1, used / limit);
            const over = !unlimited && used >= limit;
        return (
 <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-4 py-3">
          <div className="flex items-center gap-2">
   <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200">
  <Building2 className="h-4 w-4" />
       </span>
       <div className="min-w-0">
       <p className="truncate font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
    <p className="truncate text-xs text-slate-400">{t.slug}</p>
   </div>
        </div>
        </td>
     <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{t._count?.users ?? "-"}</td>
    <td className="px-4 py-3">
        {unlimited ? (
           <span className="text-xs text-slate-400">Tak terbatas ({used})</span>
 ) : (
            <div className="w-28">
 <div className={`text-xs ${over ? "font-medium text-red-500" : "text-slate-600 dark:text-slate-300"}`}>
               {used} / {limit}
        </div>
           <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
          <div
     className={`h-1.5 rounded-full ${over ? "bg-red-500" : "bg-brand-500"}`}
            style={{ width: `${ratio * 100}%` }}
 />
            </div>
   </div>
    )}
    </td>
    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
 {fmtDate(t.expiresAt || t.trialEndsAt)}
      </td>
       <td className="px-4 py-3">
     <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLE[t.status] || ""}`}>
        {STATUS_OPTIONS.find((s) => s.value === t.status)?.label || t.status}
           </span>
      </td>
     <td className="px-4 py-3">
  <div className="flex items-center justify-end gap-2">
         <select
  className="field !w-auto !py-1 text-xs"
         value={t.status}
    disabled={busy === t.id}
    onChange={(e) => onStatus(t.id, e.target.value)}
          >
 {STATUS_OPTIONS.map((s) => (
<option key={s.value} value={s.value}>{s.label}</option>
    ))}
             </select>
   <button
     className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
               disabled={busy === t.id}
             onClick={() => onTrial(t)}
     title="Atur masa uji coba"
        >
  Trial
            </button>
       <button
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        disabled={busy === t.id}
  onClick={() => onQuota(t)}
         title="Atur kuota bulanan"
      >
  Kuota
  </button>
 <button
     className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            disabled={busy === t.id}
            onClick={() => onExtend(t.id)}
       title="Perpanjang 30 hari & aktifkan"
     >
    +30 hari
      </button>
            <button
       className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/30"
       disabled={busy === t.id}
  onClick={() => onDelete(t)}
        title="Hapus tenant"
        >
             {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
            </div>
         </td>
           </tr>
       );
         })
  )}
     </tbody>
   </table>
    </div>
  );
}

function TenantModal({ modal, busy, onChange, onClose, onSubmit }) {
  const { type, tenant, value } = modal;
  const cfg = {
    trial: {
      title: "Atur Masa Uji Coba",
      icon: CalendarClock,
      desc: `Tetapkan masa trial untuk "${tenant.name}". Status otomatis menjadi Trial.`,
      label: "Jumlah hari dari sekarang",
    input: "number",
      hint: "Contoh: 1 untuk uji coba 1 hari.",
      confirm: "Terapkan Trial",
   danger: false,
    },
    quota: {
      title: "Atur Kuota Bulanan",
      icon: Gauge,
      desc: `Batas jumlah item operasi sukses per bulan untuk "${tenant.name}".`,
      label: "Kuota per bulan",
    input: "number",
  hint: "0 = tak terbatas. Dihitung dari item yang berhasil diproses.",
      confirm: "Simpan Kuota",
danger: false,
    },
    delete: {
      title: "Hapus Tenant",
      icon: Trash2,
      desc: `Hapus "${tenant.name}" beserta semua pengguna, pengaturan, dan riwayatnya. Tindakan ini tidak dapat dibatalkan.`,
      label: null,
      confirm: "Ya, Hapus Permanen",
  danger: true,
    },
  }[type];

  const Icon = cfg.icon;

  function onKeyDown(e) {
    if (e.key === "Enter" && type !== "delete") onSubmit();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md animate-fadeIn rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
  onKeyDown={onKeyDown}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
      aria-label="Tutup"
        >
        <X className="h-5 w-5" />
        </button>

  <div className="mb-4 flex items-center gap-3">
 <span
   className={`flex h-10 w-10 items-center justify-center rounded-xl ${
   cfg.danger
   ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300"
                : "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"
            }`}
          >
 <Icon className="h-5 w-5" />
 </span>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{cfg.title}</h3>
   </div>

        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{cfg.desc}</p>

        {cfg.label && (
    <div className="mb-4">
     <label className="label">{cfg.label}</label>
            <input
              type={cfg.input}
      min="0"
      className="field"
        value={value}
   autoFocus
 onChange={(e) => onChange(e.target.value)}
   />
        {cfg.hint && <p className="mt-1 text-xs text-slate-400">{cfg.hint}</p>}
          </div>
   )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>
  Batal
          </button>
          <button
      onClick={onSubmit}
       disabled={busy}
            className={cfg.danger ? "btn-danger" : "btn-primary"}
          >
         {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {cfg.confirm}
   </button>
        </div>
      </div>
    </div>
  );
}
