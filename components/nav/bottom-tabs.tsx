"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, PRIMARY_NAV, SECONDARY_NAV } from "./nav-items";
import { LogoutButton } from "./logout-button";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomTabs() {
  const pathname = usePathname();
  const moreActive = SECONDARY_NAV.some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-5 pb-safe">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium leading-none transition-colors",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.3]")} />
              <span className="max-w-full truncate whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium leading-none",
              moreActive ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" />
            <span className="max-w-full truncate whitespace-nowrap">More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="space-y-3">
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <ul className="-mx-2 space-y-1 pt-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <SheetClose asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </SheetClose>
                  </li>
                );
              })}
            </ul>
            <div className="border-t pt-3">
              <LogoutButton />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
