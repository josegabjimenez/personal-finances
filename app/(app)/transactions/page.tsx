import { listTransactions, listAccounts, listCategories, listTags } from "@/lib/firefly/queries";
import { getRecurringIndex } from "@/lib/firefly/recurring";
import { getRecurringTransactionMeta } from "@/lib/firefly/recurring-flags";
import {
  transactionGroupsToEntries,
} from "@/lib/firefly/transaction-entries";
import { toYMD, startOfMonth, endOfMonth } from "@/lib/format";
import { parseMonth } from "@/lib/activity-period";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { FilterBar } from "@/components/transactions/filter-bar";
import { MonthNav } from "@/components/transactions/month-nav";
import { InfiniteTransactionList } from "@/components/transactions/infinite-transaction-list";
import { TransactionSummary } from "@/components/transactions/transaction-summary";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactions" };

interface SearchParams {
  q?: string;
  type?: "withdrawal" | "deposit" | "transfer";
  start?: string;
  end?: string;
  account?: string;
  category?: string;
  tag?: string;
  view?: "all";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const isAllView = sp.view === "all";

  // Default to current month when neither view=all nor explicit date range is set
  let effectiveStart = sp.start;
  let effectiveEnd = sp.end;
  if (!isAllView && !sp.start && !sp.end) {
    effectiveStart = toYMD(startOfMonth());
    effectiveEnd = toYMD(endOfMonth());
  }

  const navPeriod = parseMonth(effectiveStart ?? effectiveEnd);
  const navYear = navPeriod?.year ?? new Date().getFullYear();
  const navMonth = navPeriod?.month ?? (new Date().getMonth() + 1);

  // Keep the existing first-page sizes; load any remaining pages as the list is viewed.
  const limit = isAllView ? 50 : 500;

  const loadResult = await Promise.all([
    listTransactions({
      page: 1,
      limit,
      type: sp.type,
      start: effectiveStart,
      end: effectiveEnd,
    }),
    listAccounts("asset").catch(() => []),
    listCategories().catch(() => []),
    listTags().catch(() => []),
    getRecurringIndex().catch(() => ({ bills: [], templates: [] })),
  ])
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));

  if (!loadResult.data) {
    const message = loadResult.error instanceof Error ? loadResult.error.message : undefined;
    return (
      <div className="space-y-6">
        <PageHeader title="Transactions" />
        <MonthNav year={navYear} month={navMonth} isAll={isAllView} />
        <ErrorCard message={message} />
      </div>
    );
  }

  const [{ groups, totalPages }, accounts, categories, tags, recurringIndex] = loadResult.data;

    // Keep subsequent pages in the same date range and transaction type as page one.
    const fetchUrl = (() => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (sp.type) params.set("type", sp.type);
      if (effectiveStart) params.set("start", effectiveStart);
      if (effectiveEnd) params.set("end", effectiveEnd);
      return `/api/firefly/transactions?${params.toString()}`;
    })();

    // Flatten every Firefly split, then apply filters to each row.
    const filtered = transactionGroupsToEntries(groups, {
      query: sp.q,
      type: sp.type,
      accountName: sp.account,
      categoryName: sp.category,
      tag: sp.tag,
      additionalSearchTerms: ({ split }) => {
        const recurring = getRecurringTransactionMeta(split, recurringIndex);
        return [recurring.label, recurring.detail];
      },
    });

    return (
      <div className="space-y-4">
        <PageHeader title="Transactions" />
        <MonthNav year={navYear} month={navMonth} isAll={isAllView} />
        <FilterBar
          initialQ={sp.q ?? ""}
          initialType={sp.type ?? "all"}
          initialStart={effectiveStart ?? ""}
          initialEnd={effectiveEnd ?? ""}
          initialAccount={sp.account ?? ""}
          initialCategory={sp.category ?? ""}
          initialTag={sp.tag ?? ""}
          accounts={accounts.map((a) => ({ id: a.id, name: a.attributes.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.attributes.name }))}
          tags={tags.map((t) => t.attributes.tag)}
        />

        {isAllView || totalPages > 1 ? (
          /* Filters and summaries follow loaded rows until pagination completes. */
          groups.length === 0 ? (
            <Empty title="No transactions" />
          ) : (
            <InfiniteTransactionList
              initialGroups={groups}
              totalPages={totalPages}
              fetchUrl={fetchUrl}
              searchQuery={sp.q}
              accountFilter={sp.account}
              categoryFilter={sp.category}
              tagFilter={sp.tag}
              typeFilter={sp.type}
              recurringIndex={recurringIndex}
            />
          )
        ) : (
          /* Single-page ranges are complete and can render on the server. */
          filtered.length === 0 ? (
            <Empty title="No transactions match your filters" />
          ) : (
            <>
              <TransactionSummary entries={filtered} typeFilter={sp.type} />
              <Card className="divide-y overflow-hidden p-0">
                {filtered.map((entry) => (
                  <TransactionRow
                    key={entry.key}
                    entry={entry}
                    recurringIndex={recurringIndex}
                  />
                ))}
              </Card>
            </>
          )
        )}
      </div>
    );
}
