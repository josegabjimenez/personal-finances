"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { TransactionRow } from "./transaction-row";
import type { TransactionGroup } from "@/lib/firefly/types";
import {
  summarizeTransactionEntries,
  transactionGroupsToEntries,
  type TransactionEntryContextFilter,
} from "@/lib/firefly/transaction-entries";
import {
  getRecurringTransactionMeta,
  type RecurringIndex,
} from "@/lib/firefly/recurring-flags";

interface Props {
  initialGroups: TransactionGroup[];
  totalPages: number;
  fetchUrl: string; // base URL without page param, e.g. "/api/firefly/transactions?limit=50&type=withdrawal"
  searchQuery?: string;
  accountFilter?: string;
  categoryFilter?: string;
  tagFilter?: string;
  typeFilter?: string;
  contextFilter?: TransactionEntryContextFilter;
  recurringIndex?: RecurringIndex | null;
  defaultCurrency?: string;
}

export function InfiniteTransactionList({
  initialGroups,
  totalPages,
  fetchUrl,
  searchQuery,
  accountFilter,
  categoryFilter,
  tagFilter,
  typeFilter,
  contextFilter,
  recurringIndex,
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
    const initialDone = totalPages <= 1;
    setAllGroups(initialGroups);
    setDone(initialDone);
    setIsLoading(false);
    pageRef.current = 1;
    loadingRef.current = false;
    doneRef.current = initialDone;
    fetchUrlRef.current = fetchUrl;
  }, [fetchUrl, initialGroups, totalPages]);

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
  }, [fetchUrl]);

  const displayed = transactionGroupsToEntries(allGroups, {
    query: searchQuery,
    type: typeFilter,
    accountName: accountFilter,
    categoryName: categoryFilter,
    tag: tagFilter,
    ...contextFilter,
    additionalSearchTerms: ({ split }) => {
      const recurring = getRecurringTransactionMeta(split, recurringIndex);
      return [recurring.label, recurring.detail];
    },
  });
  const summary = summarizeTransactionEntries(displayed, defaultCurrency);

  return (
    <div className="space-y-4">
      {displayed.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            {summary.count} transaction{summary.count !== 1 ? "s" : ""}
            {!done ? "+" : ""}
          </span>
          <Money
            amount={summary.total}
            currency={summary.currency}
            colorize
            className="text-sm font-medium"
          />
        </div>
      )}
      {displayed.length > 0 && (
        <Card className="divide-y overflow-hidden p-0">
          {displayed.map((entry) => (
            <TransactionRow key={entry.key} entry={entry} recurringIndex={recurringIndex} />
          ))}
        </Card>
      )}
      {displayed.length === 0 && done && <Empty title="No transactions match your filters" />}
      {!done && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-muted-foreground">
          {isLoading ? "Loading…" : ""}
        </div>
      )}
    </div>
  );
}
