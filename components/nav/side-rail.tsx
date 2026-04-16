"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { LogoutButton } from "./logout-button";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideRail() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-60 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-5 pt-7 pb-6">
        <Wallet2 className="h-5 w-5" />
        <span className="text-sm font-semibold tracking-tight">Finances</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
