"use client";

import { useState } from "react";
import { Save, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function SettingsForm({ initial }) {
  const [cookie, setCookie] = useState("");
  const [speed, setSpeed] = useState(initial.speed || "normal");
  const [concurrency, setConcurrency] = useState(String(initial.concurrency ?? 1));
  const [groupDelayMs, setGroupDelayMs] = useState(String(initial.groupDelayMs ?? 3000));
  const [userAgent, setUserAgent] = useState(initial.userAgent || "");
  const [hasCookie, setHasCookie] = useState(!!initial.hasCookie);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCookie(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        speed,
        concurrency: parseInt(concurrency, 10) || 1,
        groupDelayMs: parseInt(groupDelayMs, 10) || 0,
        userAgent,
      };
      // Only send cookie when the user entered a new value; otherwise keep stored one.
      if (cookie.trim()) payload.cookie = cookie.trim();
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, msg: data.error || "Gagal menyimpan." });
        return;
      }
      if (cookie.trim()) {
        setHasCookie(true);
        setCookie("");
      }
      setStatus({ ok: true, msg: "Pengaturan tersimpan." });
    } catch {
      setStatus({ ok: false, msg: "Kesalahan jaringan." });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      setStatus({ ok: data.ok, msg: data.ok ? `Sesi valid. ${data.categories} kategori terbaca.` : data.error });
    } catch {
      setStatus({ ok: false, msg: "Kesalahan jaringan." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cookie Sesi Digiflazz</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tempel cookie (format header atau Netscape) atau unggah berkas .txt. Wajib berisi
          digiflazz_member_panel_session dan XSRF-TOKEN. Cookie disimpan terenkripsi.
        </p>
        {hasCookie && !cookie.trim() && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Cookie tersimpan. Kosongkan untuk mempertahankan, atau tempel baru untuk mengganti.
          </div>
        )}
        <textarea
          className="field h-40 font-mono text-xs"
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          placeholder={hasCookie ? "•••••••• (tersimpan, tempel baru untuk mengganti)" : "XSRF-TOKEN=...; digiflazz_member_panel_session=..."}
        />
        <label className="btn-ghost w-fit cursor-pointer">
          <Upload className="h-4 w-4" />
          Unggah .txt
          <input type="file" accept=".txt" className="hidden" onChange={onFile} />
        </label>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Parameter Eksekusi</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Kecepatan</label>
            <select className="field" value={speed} onChange={(e) => setSpeed(e.target.value)}>
              <option value="normal">Normal (~700ms)</option>
              <option value="turbo">Turbo (~450ms)</option>
            </select>
          </div>
          <div>
            <label className="label">Paralel (1-10)</label>
            <input
              className="field"
              type="number"
              min="1"
              max="10"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Jeda antar-grup (ms)</label>
            <input
              className="field"
              type="number"
              min="0"
              value={groupDelayMs}
              onChange={(e) => setGroupDelayMs(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">User-Agent (opsional)</label>
          <input
            className="field"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            placeholder="Kosong = otomatis"
          />
        </div>
      </div>

      {status ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            status.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {status.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {status.msg}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button onClick={save} className="btn-primary" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan
        </button>
        <button onClick={test} className="btn-ghost" disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Uji Koneksi
        </button>
      </div>
    </div>
  );
}
