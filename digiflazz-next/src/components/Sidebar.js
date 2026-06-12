"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Trash2,
  PlusCircle,
  UserCircle,
  Settings,
  Store,
  ShieldCheck,
  Building2,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/delete", label: "Hapus Produk", icon: Trash2, roles: ["user"] },
  { href: "/dashboard/add", label: "Tambah Produk", icon: PlusCircle, roles: ["user"] },
  { href: "/dashboard/seller", label: "Ubah Seller", icon: Store, roles: ["user"] },
  { href: "/dashboard/settings", label: "Pengaturan", icon: Settings, roles: ["user"] },
  { href: "/dashboard/profile", label: "Profil", icon: UserCircle, roles: ["user"] },
  { href: "/dashboard/tenants", label: "Tenant", icon: Building2, roles: ["superadmin"] },
];

export default function Sidebar({ user, collapsed = false, onNavigate }) {
  const pathname = usePathname();

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
   <div
        className={`flex items-center gap-3 px-6 py-5 ${
    collapsed ? "justify-center px-0" : ""
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 ring-1 ring-brand-700/20 dark:bg-brand-700 dark:ring-white/10">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
      <div className="min-w-0">
       <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">Digiflazz</p>
   <p className="truncate text-xs text-slate-500 dark:text-slate-400">Console</p>
          </div>
   )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
 : pathname.startsWith(item.href);
      const Icon = item.icon;
      return (
            <Link
     key={item.href}
          href={item.href}
    onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
 collapsed ? "justify-center px-0" : ""
       } ${
     active
    ? "bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-white"
   : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
        }`}
     >
    <Icon className="h-[18px] w-[18px] shrink-0" />
    {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
          );
})}
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        {!collapsed ? (
    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
  Digiflazz Console
 </p>
        ) : (
     <div className="flex justify-center py-1">
 <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
   )}
    </div>
    </div>
  );
}
