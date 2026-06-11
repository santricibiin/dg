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
    <div className="flex h-full flex-col bg-brand-900 text-brand-100">
      <div
        className={`flex items-center gap-3 px-6 py-5 ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Digiflazz</p>
            <p className="truncate text-xs text-brand-300">Console</p>
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
                  ? "bg-white/10 text-white"
                  : "text-brand-200 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {!collapsed ? (
          <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-brand-400">
            Digiflazz Console
          </p>
        ) : (
          <div className="flex justify-center py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          </div>
        )}
      </div>
    </div>
  );
}
