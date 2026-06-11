"use client";

import { useState } from "react";
import { Save, Loader2, CheckCircle2, AlertCircle, User, KeyRound } from "lucide-react";

export default function ProfileForm({ initial }) {
  const [name, setName] = useState(initial.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  async function saveName() {
    setSavingName(true);
setStatus(null);
    try {
      const res = await fetch("/api/profile", {
    method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
});
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, msg: data.error || "Gagal menyimpan." });
        return;
}
      setStatus({ ok: true, msg: "Nama diperbarui." });
    } catch {
      setStatus({ ok: false, msg: "Kesalahan jaringan." });
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({ ok: false, msg: "Konfirmasi kata sandi tidak cocok." });
      return;
    }
    setSavingPass(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
   headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, msg: data.error || "Gagal mengganti kata sandi." });
    return;
      }
      setStatus({ ok: true, msg: "Kata sandi diperbarui." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setStatus({ ok: false, msg: "Kesalahan jaringan." });
    } finally {
      setSavingPass(false);
    }
  }

  return (
    <div className="space-y-6">
      {status ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
        status.ok
           ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
   : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
      {status.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {status.msg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Info akun + ganti nama */}
      <div className="card space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <User className="h-4 w-4" /> Informasi Akun
        </h2>
          <div>
            <label className="label">Email</label>
   <input className="field bg-slate-50 dark:bg-slate-900" value={initial.email} disabled readOnly />
            <p className="mt-1 text-xs text-slate-400">Email tidak dapat diubah.</p>
  </div>
  <div>
         <label className="label">Nama</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
      <button onClick={saveName} className="btn-primary" disabled={savingName}>
       {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Nama
       </button>
        </div>

   {/* Ganti password */}
      <div className="card space-y-4">
   <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <KeyRound className="h-4 w-4" /> Ganti Kata Sandi
      </h2>
      <div>
       <label className="label">Kata Sandi Saat Ini</label>
 <input
      type="password"
 className="field"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
  />
          </div>
          <div>
      <label className="label">Kata Sandi Baru</label>
        <input
 type="password"
   className="field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimal 8 karakter"
           autoComplete="new-password"
            />
    </div>
          <div>
          <label className="label">Konfirmasi Kata Sandi Baru</label>
   <input
              type="password"
              className="field"
              value={confirmPassword}
 onChange={(e) => setConfirmPassword(e.target.value)}
       autoComplete="new-password"
      />
        </div>
      <button onClick={savePassword} className="btn-primary" disabled={savingPass}>
   {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Ganti Kata Sandi
          </button>
        </div>
      </div>
    </div>
  );
}
