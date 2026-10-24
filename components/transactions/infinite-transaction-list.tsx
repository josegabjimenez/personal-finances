"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/common/empty";
import { TransactionRow } from "./transaction-row";
import { TransactionSummary } from "./transaction-summary";
import type { TransactionGroup } from "@/lib/firefly/types";
import {
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

type LoadingStatus = "idle" | "loading" | "error" | "done";

interface PaginationSession {
  initialGroups: TransactionGroup[];
  fetchUrl: string;
  totalPages: number;
  page: number;
  status: LoadingStatus;
  controller: AbortController | null;
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
  const [status, setStatus] = useState<LoadingStatus>(totalPages <= 1 ? "done" : "idle");
  const [source, setSource] = useState({ initialGroups, fetchUrl, totalPages });
  const sessionRef = useRef<PaginationSession | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async (session: PaginationSession, retry = false) => {
    if (
      sessionRef.current !== session ||
      session.status === "loading" ||
      session.status === "done" ||
      (session.status === "error" && !retry)
    ) return;

    // Lock synchronously: multiple clicks/observer callbacks must share one request.
    session.status = "loading";
    const controller = new AbortController();
    session.controller = controller;
    setStatus("loading");
    const nextPage = session.page + 1;
    try {
      const sep = session.fetchUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${session.fetchUrl}${sep}page=${nextPage}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Aborting is best effort; also reject responses from a replaced list.
      if (sessionRef.current !== session || controller.signal.aborted) return;
      const newGroups: TransactionGroup[] = json.data;
      const tp: number = json.meta?.pagination?.total_pages ?? session.totalPages;
      if (!Array.isArray(newGroups) || !Number.isInteger(tp) || tp < 1) {
        throw new Error("Invalid transaction page");
      }
      session.page = nextPage;
      session.status = nextPage >= tp ? "done" : "idle";
      setAllGroups((prev) => [...prev, ...newGroups]);
      setStatus(session.status);
    } catch {
      if (sessionRef.current !== session || controller.signal.aborted) return;
      // Keep the last successful page and rows so Retry requests this same page.
      session.status = "error";
      setStatus("error");
    } finally {
      if (sessionRef.current === session && session.controller === controller) {
        session.controller = null;
      }
    }
  }, []);

  useEffect(() => {
    const session: PaginationSession = {
      initialGroups, fetchUrl, totalPages, page: 1,
      status: totalPages <= 1 ? "done" : "idle", controller: null,
    };
    sessionRef.current = session;
    setAllGroups(initialGroups);
    setStatus(session.status);
    setSource({ initialGroups, fetchUrl, totalPages });
    return () => {
      if (sessionRef.current === session) sessionRef.current = null;
      session.controller?.abort();
    };
  }, [fetchUrl, initialGroups, totalPages]);

  useEffect(() => {
    const session = sessionRef.current;
    if (status !== "idle" || !session || session.status !== "idle") return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore(session);
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Appended groups also rearm observation if loading -> idle updates were batched.
    // This continues through pages hidden by filters while the sentinel stays visible.
  }, [fetchUrl, initialGroups, totalPages, allGroups, status, loadMore]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    if (
      session?.initialGroups === initialGroups &&
      session.fetchUrl === fetchUrl && session.totalPages === totalPages
    ) void loadMore(session, true);
  }, [fetchUrl, initialGroups, totalPages, loadMore]);

  // New props render before the reset effect. Never label the previous range's
  // rows or completion status as belonging to the incoming range.
  const sourceMatches = source.initialGroups === initialGroups &&
    source.fetchUrl === fetchUrl && source.totalPages === totalPages;
  const visibleStatus = sourceMatches ? status : totalPages <= 1 ? "done" : "idle";
  const visibleGroups = sourceMatches ? allGroups : initialGroups;
  const done = visibleStatus === "done";

  const displayed = transactionGroupsToEntries(visibleGroups, {
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

  return (
    <div className="space-y-4">
      {(displayed.length > 0 || !done) && (
        <TransactionSummary
          entries={displayed}
          typeFilter={typeFilter}
          isPartial={!done}
          defaultCurrency={defaultCurrency}
        />
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
          {visibleStatus === "error" ? (
            <div className="space-y-3">
              <p role="alert">Couldn’t load more transactions. Please try again.</p>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                Retry
              </Button>
            </div>
          ) : (
            <span role="status">{visibleStatus === "loading" ? "Loading…" : ""}</span>
          )}
        </div>
      )}
    </div>
  );
}
