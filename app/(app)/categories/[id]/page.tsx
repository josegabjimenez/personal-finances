import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCategory, listCategoryTransactions } from "@/lib/firefly/queries";
import { transactionGroupsToEntries } from "@/lib/firefly/transaction-entries";
import {
  categoryPeriod,
  categoryPeriodQuery,
  type CategoryPeriodSearchParams,
} from "@/lib/category-period";
import { activityPeriodLabel } from "@/lib/activity-period";
import { Card } from "@/components/ui/card";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { TransactionSummary } from "@/components/transactions/transaction-summary";
import { MonthNav } from "@/components/transactions/month-nav";
import { InfiniteTransactionList } from "@/components/transactions/infinite-transaction-list";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";

interface SearchParams extends CategoryPeriodSearchParams {
  view?: string | string[];
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isAllView = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "all";
  const period = categoryPeriod(sp);
  const start = Array.isArray(sp.start) ? sp.start[0] : sp.start;
  const end = Array.isArray(sp.end) ? sp.end[0] : sp.end;
  const hasExplicitRange = Boolean(start || end);
  const effectiveStart = isAllView ? undefined : hasExplicitRange ? start : period.start;
  const effectiveEnd = isAllView ? undefined : hasExplicitRange ? end : period.end;
  const fullMonth = effectiveStart === period.start && effectiveEnd === period.end;
  const rangeQuery = new URLSearchParams();
  if (effectiveStart) rangeQuery.set("start", effectiveStart);
  if (effectiveEnd) rangeQuery.set("end", effectiveEnd);
  const periodLabel = activityPeriodLabel(rangeQuery, period.year, period.month, "en-US");

  // Keep existing page sizes and use the existing list to load remaining pages.
  const limit = isAllView ? 50 : 500;

  const backLink = (
    <Link
      href={isAllView ? "/categories" : `/categories?${categoryPeriodQuery(period)}`}
      data-haptic="medium"
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 -ml-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground active:bg-accent active:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Categories
    </Link>
  );
  const monthNav = (
    <MonthNav
      year={period.year}
      month={period.month}
      isAll={isAllView}
      baseUrl={`/categories/${id}`}
      locale="en-US"
    />
  );

  const loadResult = await Promise.all([
    getCategory(id),
    listCategoryTransactions(id, { page: 1, limit, start: effectiveStart, end: effectiveEnd }),
  ])
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));

  if (!loadResult.data) {
    const message = loadResult.error instanceof Error ? loadResult.error.message : undefined;
    return (
      <div className="space-y-4">
        {backLink}
        {monthNav}
        <ErrorCard message={message} />
      </div>
    );
  }

  const [category, { groups, totalPages }] = loadResult.data;

    const name = category.attributes.name;
    const fetchParams = new URLSearchParams({ limit: String(limit) });
    if (effectiveStart) fetchParams.set("start", effectiveStart);
    if (effectiveEnd) fetchParams.set("end", effectiveEnd);
    const fetchUrl = `/api/firefly/categories/${id}/transactions?${fetchParams}`;
    const entries = transactionGroupsToEntries(groups, { categoryId: id });

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          {backLink}
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        </div>
        {monthNav}
        {isAllView || totalPages > 1 ? (
          groups.length === 0 ? (
            <Empty title="No transactions for this category" />
          ) : (
            <InfiniteTransactionList
              initialGroups={groups}
              totalPages={totalPages}
              fetchUrl={fetchUrl}
              contextFilter={{ categoryId: id }}
            />
          )
        ) : (
          entries.length === 0 ? (
            <Empty
              title={fullMonth ? `No transactions for this category in ${period.label}` : "No transactions for this category"}
              description={fullMonth ? undefined : periodLabel}
            />
          ) : (
            <>
              <TransactionSummary entries={entries} isPartial={totalPages > 1} />
              <Card className="divide-y overflow-hidden p-0">
                {entries.map((entry) => (
                  <TransactionRow key={entry.key} entry={entry} />
                ))}
              </Card>
            </>
          )
        )}
      </div>
    );
}
