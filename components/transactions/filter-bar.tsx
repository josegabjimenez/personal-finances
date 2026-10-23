"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
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
import { endOfMonth, startOfMonth, toYMD } from "@/lib/format";

const TYPES = [
  { value: "all", label: "All" },
  { value: "withdrawal", label: "Expenses" },
  { value: "deposit", label: "Income" },
  { value: "transfer", label: "Transfers" },
] as const;

interface FilterOption {
  id: string;
  name: string;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function FilterBar({
  initialQ,
  initialType,
  initialStart,
  initialEnd,
  initialAccount,
  initialCategory,
  initialTag,
  accounts,
  categories,
  tags,
}: {
  initialQ: string;
  initialType: string;
  initialStart: string;
  initialEnd: string;
  initialAccount: string;
  initialCategory: string;
  initialTag: string;
  accounts: FilterOption[];
  categories: FilterOption[];
  tags: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const [search, setSearch] = React.useState({
    applied: query, intended: query, value: initialQ, submitted: [] as string[],
  });
  // Own responses preserve newer typing/intended filters; other URL navigation
  // (including browser Back) synchronizes the input with the destination.
  if (search.applied !== query) {
    const ownResponse = search.submitted.indexOf(query);
    setSearch({
      applied: query,
      intended: ownResponse >= 0 ? search.intended : query,
      value: ownResponse >= 0 ? search.value : initialQ,
      submitted: ownResponse >= 0 ? search.submitted.slice(ownResponse + 1) : [],
    });
  }
  const q = search.value;
  const [type, setType] = React.useState(initialType || "all");
  const [start, setStart] = React.useState(initialStart);
  const [end, setEnd] = React.useState(initialEnd);
  const [account, setAccount] = React.useState(initialAccount);
  const [category, setCategory] = React.useState(initialCategory);
  const [tag, setTag] = React.useState(initialTag);

  const replaceParams = React.useCallback((sp: URLSearchParams) => {
    const next = sp.toString();
    setSearch((current) => ({
      ...current, intended: next, submitted: [...current.submitted, next],
    }));
    router.replace(`/transactions?${next}`, { scroll: false });
  }, [router, setSearch]);

  // Compose edits with the latest intended filters, including in-flight navigation.
  React.useEffect(() => {
    const sp = new URLSearchParams(search.intended);
    if (q === (sp.get("q") ?? "")) return;
    const handle = setTimeout(() => {
      if (q) sp.set("q", q);
      else sp.delete("q");
      sp.delete("page");
      replaceParams(sp);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, search.intended, replaceParams]);

  function resetDrafts() {
    const sp = new URLSearchParams(search.intended);
    const defaultMonth = sp.get("view") !== "all" && !sp.get("start") && !sp.get("end");
    setType(sp.get("type") || "all");
    setStart(sp.get("start") ?? (defaultMonth ? toYMD(startOfMonth()) : ""));
    setEnd(sp.get("end") ?? (defaultMonth ? toYMD(endOfMonth()) : ""));
    setAccount(sp.get("account") ?? "");
    setCategory(sp.get("category") ?? "");
    setTag(sp.get("tag") ?? "");
  }

  function applyFilters() {
    const sp = new URLSearchParams(search.intended);
    if (q) sp.set("q", q); else sp.delete("q");
    if (type && type !== "all") sp.set("type", type); else sp.delete("type");
    if (start) sp.set("start", start); else sp.delete("start");
    if (end) sp.set("end", end); else sp.delete("end");
    // Choosing dates from All transactions switches to that period consistently.
    if (start || end) sp.delete("view");
    if (account) sp.set("account", account); else sp.delete("account");
    if (category) sp.set("category", category); else sp.delete("category");
    if (tag) sp.set("tag", tag); else sp.delete("tag");
    sp.delete("page");
    replaceParams(sp);
  }

  function removeFilters(keys: string[]) {
    const sp = new URLSearchParams(search.intended);
    for (const key of keys) sp.delete(key);
    if (q) sp.set("q", q); else sp.delete("q");
    sp.delete("page");
    replaceParams(sp);
  }

  function clear() {
    setType("all");
    setAccount("");
    setCategory("");
    setTag("");
    removeFilters(["type", "account", "category", "tag"]);
  }

  const activeFilters = [
    { key: "type", label: "Type", value: initialType !== "all" ? TYPES.find((t) => t.value === initialType)?.label : "" },
    { key: "account", label: "Account", value: initialAccount },
    { key: "category", label: "Category", value: initialCategory },
    { key: "tag", label: "Tag", value: initialTag },
  ].filter((filter) => Boolean(filter.value));
  const filtersActive = activeFilters.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            placeholder="Search transactions…"
            value={q}
            onChange={(e) => setSearch((current) => ({ ...current, value: e.target.value }))}
            aria-label="Search transactions"
            className="pl-9"
          />
        </div>
        <Sheet onOpenChange={(open) => { if (open) resetDrafts(); }}>
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
                      aria-pressed={type === t.value}
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
              {accounts.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="filter-account">Account</Label>
                  <select
                    id="filter-account"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {categories.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="filter-category">Category</Label>
                  <select
                    id="filter-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {tags.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="filter-tag">Tag</Label>
                  <select
                    id="filter-tag"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All tags</option>
                    {tags.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
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
                  Clear filters
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
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active transaction filters">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => removeFilters([filter.key])}
              aria-label={`Remove ${filter.label.toLowerCase()} filter: ${filter.value}`}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-words">{filter.label}: {filter.value}</span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
