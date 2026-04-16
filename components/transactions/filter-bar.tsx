"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "all", label: "All" },
  { value: "withdrawal", label: "Expenses" },
  { value: "deposit", label: "Income" },
  { value: "transfer", label: "Transfers" },
] as const;

export function FilterBar({
  initialQ,
  initialType,
  initialStart,
  initialEnd,
}: {
  initialQ: string;
  initialType: string;
  initialStart: string;
  initialEnd: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = React.useState(initialQ);
  const [type, setType] = React.useState(initialType || "all");
  const [start, setStart] = React.useState(initialStart);
  const [end, setEnd] = React.useState(initialEnd);

  // Debounced search submit
  React.useEffect(() => {
    const handle = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (q) sp.set("q", q);
      else sp.delete("q");
      sp.delete("page");
      router.replace(`/transactions?${sp.toString()}`);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function applyFilters() {
    const sp = new URLSearchParams(searchParams.toString());
    if (q) sp.set("q", q);
    else sp.delete("q");
    if (type && type !== "all") sp.set("type", type);
    else sp.delete("type");
    if (start) sp.set("start", start);
    else sp.delete("start");
    if (end) sp.set("end", end);
    else sp.delete("end");
    sp.delete("page");
    router.replace(`/transactions?${sp.toString()}`);
  }

  function clear() {
    setType("all");
    setStart("");
    setEnd("");
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    router.replace(`/transactions?${sp.toString()}`);
  }

  const filtersActive =
    (type && type !== "all") || Boolean(start) || Boolean(end);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          placeholder="Search transactions…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Filters"
            className={cn(filtersActive && "ring-2 ring-ring")}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="space-y-4">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "rounded-md py-1.5 text-xs font-medium transition-colors",
                      type === t.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start">From</Label>
                <Input
                  id="start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">To</Label>
                <Input
                  id="end"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={clear} className="flex-1">
                Clear
              </Button>
              <SheetClose asChild>
                <Button onClick={applyFilters} className="flex-1">
                  Apply
                </Button>
              </SheetClose>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
