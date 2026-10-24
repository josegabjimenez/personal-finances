import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccount, listAccountTransactions } from "@/lib/firefly/queries";
import {
  transactionGroupsToEntries,
} from "@/lib/firefly/transaction-entries";
import { toYMD, startOfMonth, endOfMonth } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { MonthNav } from "@/components/transactions/month-nav";
import { TransactionSummary } from "@/components/transactions/transaction-summary";
import { parseMonth } from "@/lib/activity-period";
import { InfiniteTransactionList } from "@/components/transactions/infinite-transaction-list";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";

interface SearchParams {
  view?: "all";
  start?: string;
  end?: string;
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isAllView = sp.view === "all";

  // Default to current month
  let effectiveStart = sp.start;
  let effectiveEnd = sp.end;
  if (!isAllView && !sp.start && !sp.end) {
    effectiveStart = toYMD(startOfMonth());
    effectiveEnd = toYMD(endOfMonth());
  }

  const selected = parseMonth(effectiveStart ?? effectiveEnd);
  const navYear = selected?.year ?? new Date().getFullYear();
  const navMonth = selected?.month ?? new Date().getMonth() + 1;

  // Keep existing page sizes and use the existing list to load remaining pages.
  const limit = isAllView ? 50 : 500;

  const backLink = (
    <Link
      href="/accounts"
      data-haptic="medium"
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 -ml-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground active:bg-accent active:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Accounts
    </Link>
  );

  const loadResult = await Promise.all([
    getAccount(id),
    listAccountTransactions(id, { page: 1, limit, start: effectiveStart, end: effectiveEnd }),
  ])
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));

  if (!loadResult.data) {
    const message = loadResult.error instanceof Error ? loadResult.error.message : undefined;
    return (
      <div className="space-y-4">
        {backLink}
        <MonthNav year={navYear} month={navMonth} isAll={isAllView} baseUrl={`/accounts/${id}`} />
        <ErrorCard message={message} />
      </div>
    );
  }

  const [account, { groups, totalPages }] = loadResult.data;

    const name = account.attributes.name;
    const balance = account.attributes.current_balance;
    const currency = account.attributes.currency_code ?? "COP";

    const fetchParams = new URLSearchParams({ limit: String(limit) });
    if (effectiveStart) fetchParams.set("start", effectiveStart);
    if (effectiveEnd) fetchParams.set("end", effectiveEnd);
    const fetchUrl = `/api/firefly/accounts/${id}/transactions?${fetchParams}`;
    const entries = transactionGroupsToEntries(groups, { accountId: id });

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          {backLink}
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          {balance != null && (
            <p className="text-sm text-muted-foreground">
              Balance:{" "}
              <Money amount={balance} currency={currency} colorize className="text-sm font-medium" />
            </p>
          )}
        </div>
        <MonthNav
          year={navYear}
          month={navMonth}
          isAll={isAllView}
          baseUrl={`/accounts/${id}`}
        />
        {isAllView || totalPages > 1 ? (
          groups.length === 0 ? (
            <Empty title="No transactions for this account" />
          ) : (
            <InfiniteTransactionList
              initialGroups={groups}
              totalPages={totalPages}
              fetchUrl={fetchUrl}
              contextFilter={{ accountId: id }}
              defaultCurrency={currency}
            />
          )
        ) : (
          entries.length === 0 ? (
            <Empty title="No transactions for this account" />
          ) : (
            <>
              <TransactionSummary entries={entries} defaultCurrency={currency} isPartial={totalPages > 1} />
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
