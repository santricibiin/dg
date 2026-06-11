"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mendaftar.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Buat Akun</h1>
          <p className="mt-1 text-sm text-brand-200">Mulai uji coba 14 hari, tanpa kartu</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="company">Nama Usaha</label>
            <input
              id="company"
              className="field"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Toko Pulsa Saya"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="name">Nama Anda</label>
            <input
              id="name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Kata Sandi</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Memproses" : "Daftar"}
          </button>

          <p className="text-center text-xs text-slate-400">
            Sudah punya akun?{" "}
            <a href="/login" className="font-medium text-brand-600 hover:underline">
              Masuk
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
