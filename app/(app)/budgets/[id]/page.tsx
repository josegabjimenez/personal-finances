import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getBudget, listBudgetTransactions } from "@/lib/firefly/queries";
import {
  summarizeTransactionEntries,
  transactionGroupsToEntries,
} from "@/lib/firefly/transaction-entries";
import { toYMD, startOfMonth, endOfMonth } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { MonthNav } from "@/components/transactions/month-nav";
import { InfiniteTransactionList } from "@/components/transactions/infinite-transaction-list";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";

interface SearchParams {
  view?: "all";
  start?: string;
  end?: string;
}

function budgetListHref(sp: SearchParams) {
  if (!sp.start || !sp.end) return "/budgets";

  const params = new URLSearchParams({ start: sp.start, end: sp.end });
  return `/budgets?${params.toString()}`;
}

export default async function BudgetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isAllView = sp.view === "all";

  let effectiveStart = sp.start;
  let effectiveEnd = sp.end;
  if (!isAllView && !sp.start && !sp.end) {
    effectiveStart = toYMD(startOfMonth());
    effectiveEnd = toYMD(endOfMonth());
  }

  const [yearStr, monthStr] = (effectiveStart ?? "").split("-");
  const navYear = parseInt(yearStr) || new Date().getFullYear();
  const navMonth = parseInt(monthStr) || (new Date().getMonth() + 1);

  const limit = isAllView ? 50 : 500;

  const backLink = (
    <Link
      href={budgetListHref(sp)}
      data-haptic="medium"
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 -ml-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground active:bg-accent active:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Budgets
    </Link>
  );

  const loadResult = await Promise.all([
    getBudget(id),
    listBudgetTransactions(id, { page: 1, limit, start: effectiveStart, end: effectiveEnd }),
  ])
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));

  if (!loadResult.data) {
    const message = loadResult.error instanceof Error ? loadResult.error.message : undefined;
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorCard message={message} />
      </div>
    );
  }

  const [budget, { groups, totalPages }] = loadResult.data;

    const name = budget.attributes.name;
    const allFetchUrl = `/api/firefly/budgets/${id}/transactions?limit=50`;
    const entries = transactionGroupsToEntries(groups, { budgetId: id });
    const summary = summarizeTransactionEntries(entries, "COP");

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          {backLink}
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        </div>
        <MonthNav
          year={navYear}
          month={navMonth}
          isAll={isAllView}
          baseUrl={`/budgets/${id}`}
        />
        {isAllView ? (
          groups.length === 0 ? (
            <Empty title="No transactions for this budget" />
          ) : (
            <InfiniteTransactionList
              initialGroups={groups}
              totalPages={totalPages}
              fetchUrl={allFetchUrl}
              contextFilter={{ budgetId: id }}
            />
          )
        ) : (
          entries.length === 0 ? (
            <Empty title="No transactions for this budget" />
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-muted-foreground">
                  {summary.count} transaction{summary.count !== 1 ? "s" : ""}
                </span>
                <Money
                  amount={summary.total}
                  currency={summary.currency}
                  colorize
                  className="text-sm font-medium"
                />
              </div>
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
