"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { TransactionRow } from "./transaction-row";
import type { TransactionGroup } from "@/lib/firefly/types";

interface Props {
  initialGroups: TransactionGroup[];
  totalPages: number;
  fetchUrl: string; // base URL without page param, e.g. "/api/firefly/transactions?limit=50&type=withdrawal"
  searchQuery?: string;
  accountFilter?: string;
  categoryFilter?: string;
  tagFilter?: string;
  defaultCurrency?: string;
}

function applyFilters(
  groups: TransactionGroup[],
  opts: { q?: string; account?: string; category?: string; tag?: string }
): TransactionGroup[] {
  let out = groups;
  if (opts.q) {
    const q = opts.q.trim().toLowerCase();
    out = out.filter((g) => {
      const s = g.attributes.transactions[0];
      return [
        s?.description,
        s?.source_name,
        s?.destination_name,
        s?.category_name,
        s?.budget_name,
        ...(s?.tags ?? []),
        g.attributes.group_title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }
  if (opts.account) {
    out = out.filter((g) => {
      const s = g.attributes.transactions[0];
      return s?.source_name === opts.account || s?.destination_name === opts.account;
    });
  }
  if (opts.category) {
    out = out.filter((g) => g.attributes.transactions[0]?.category_name === opts.category);
  }
  if (opts.tag) {
    out = out.filter((g) => g.attributes.transactions[0]?.tags?.includes(opts.tag!) ?? false);
  }
  return out;
}

function computeTotal(groups: TransactionGroup[]): number {
  return groups.reduce((sum, g) => {
    const s = g.attributes.transactions[0];
    if (!s) return sum;
    const n = parseFloat(s.amount);
    if (!Number.isFinite(n)) return sum;
    if (s.type === "withdrawal") return sum - n;
    if (s.type === "deposit") return sum + n;
    return sum;
  }, 0);
}

export function InfiniteTransactionList({
  initialGroups,
  totalPages,
  fetchUrl,
  searchQuery,
  accountFilter,
  categoryFilter,
  tagFilter,
  defaultCurrency = "COP",
}: Props) {
  const [allGroups, setAllGroups] = useState<TransactionGroup[]>(initialGroups);
  const [done, setDone] = useState(totalPages <= 1);
  const [isLoading, setIsLoading] = useState(false);

  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const doneRef = useRef(totalPages <= 1);
  const fetchUrlRef = useRef(fetchUrl);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // keep fetchUrl ref current (in case it changes, though it shouldn't)
  fetchUrlRef.current = fetchUrl;

  useEffect(() => {
    if (doneRef.current) return;

    async function loadMore() {
      if (loadingRef.current || doneRef.current) return;
      loadingRef.current = true;
      setIsLoading(true);
      const nextPage = pageRef.current + 1;
      try {
        const url = fetchUrlRef.current;
        const sep = url.includes("?") ? "&" : "?";
        const res = await fetch(`${url}${sep}page=${nextPage}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const newGroups: TransactionGroup[] = json.data ?? [];
        const tp: number = json.meta?.pagination?.total_pages ?? 1;
        setAllGroups((prev) => [...prev, ...newGroups]);
        pageRef.current = nextPage;
        if (nextPage >= tp) {
          doneRef.current = true;
          setDone(true);
        }
      } catch {
        doneRef.current = true;
        setDone(true);
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayed = applyFilters(allGroups, {
    q: searchQuery,
    account: accountFilter,
    category: categoryFilter,
    tag: tagFilter,
  });

  const currency = displayed[0]?.attributes.transactions[0]?.currency_code ?? defaultCurrency;
  const total = computeTotal(displayed);

  return (
    <div className="space-y-4">
      {displayed.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            {displayed.length} transaction{displayed.length !== 1 ? "s" : ""}
            {!done ? "+" : ""}
          </span>
          <Money amount={total} currency={currency} colorize className="text-sm font-medium" />
        </div>
      )}
      {displayed.length > 0 && (
        <Card className="divide-y overflow-hidden p-0">
          {displayed.map((g) => (
            <TransactionRow key={g.id} group={g} />
          ))}
        </Card>
      )}
      {!done && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
          {isLoading ? "Loading…" : ""}
        </div>
      )}
    </div>
  );
}
