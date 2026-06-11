"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Sun,
  Moon,
  ChevronDown,
  User,
  LogOut,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/components/ThemeProvider";
import { RunnerProvider } from "@/components/RunnerContext";

const TITLES = {
  "/dashboard": "Dashboard",
  "/dashboard/delete": "Hapus Produk",
  "/dashboard/add": "Tambah Produk",
  "/dashboard/seller": "Ubah Seller",
  "/dashboard/settings": "Pengaturan",
  "/dashboard/profile": "Profil Saya",
  "/dashboard/tenants": "Manajemen Tenant",
};

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES)
    .filter((p) => p !== "/dashboard" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TITLES[match] : "Dashboard";
}

export default function DashboardShell({ user, children, tenantBanner }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("df_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("df_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // close profile dropdown on outside click
  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

  return (
    <RunnerProvider>
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-slate-200 transition-[width] duration-200 ease-in-out dark:border-slate-800 md:block ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className="sticky top-0 h-screen">
          <Sidebar user={user} collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 w-64 shadow-xl transition-transform duration-200 ease-in-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-brand-200 hover:bg-white/10 hover:text-white"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
          <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 md:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:inline-flex"
            aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>

          <h1 className="truncate text-base font-semibold text-brand-800 dark:text-slate-100">
            {titleFor(pathname)}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
              title={theme === "dark" ? "Mode terang" : "Mode gelap"}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            {/* Profile dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">
                  {initial}
                </span>
                <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
                  {user.name}
                </span>
                <ChevronDown
                  className={`hidden h-4 w-4 text-slate-400 transition-transform sm:block ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 origin-top-right animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
           <span className="mt-1.5 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700 dark:bg-brand-900 dark:text-brand-200">
      {user.role === "superadmin" ? "Super Admin" : "Pengguna"}
            </span>
                  </div>
                  <div className="py-1">
                    {user.role !== "superadmin" && (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                      router.push("/dashboard/profile");
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                      >
                        <User className="h-4 w-4" />
                        Detail Akun
                      </button>
                    )}
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Keluar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">
          {tenantBanner && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200 md:px-8">
              {tenantBanner}
            </div>
          )}
          <div
            key={pathname}
            className="animate-fadeIn px-4 py-6 sm:px-6 md:px-8 md:py-8"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
    </RunnerProvider>
  );
}
