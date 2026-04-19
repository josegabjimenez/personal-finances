import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccount, listAccountTransactions } from "@/lib/firefly/queries";
import { toYMD, startOfMonth, endOfMonth } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/common/money";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { MonthNav } from "@/components/transactions/month-nav";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";

interface SearchParams {
  view?: "all";
  start?: string;
  end?: string;
  page?: string;
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

  const [yearStr, monthStr] = (effectiveStart ?? "").split("-");
  const navYear = parseInt(yearStr) || new Date().getFullYear();
  const navMonth = parseInt(monthStr) || (new Date().getMonth() + 1);

  // Month view: fetch all at once. All view: paginate.
  const page = isAllView ? Math.max(1, parseInt(sp.page ?? "1", 10) || 1) : 1;
  const limit = isAllView ? 50 : 500;

  const backLink = (
    <Link
      href="/accounts"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Accounts
    </Link>
  );

  try {
    const [account, { groups, totalPages }] = await Promise.all([
      getAccount(id),
      listAccountTransactions(id, { page, limit, start: effectiveStart, end: effectiveEnd }),
    ]);

    const name = account.attributes.name;
    const balance = account.attributes.current_balance;
    const currency = account.attributes.currency_code ?? "COP";

    const primaryCurrency =
      groups[0]?.attributes.transactions[0]?.currency_code ?? currency;
    const total = groups.reduce((sum, g) => {
      const s = g.attributes.transactions[0];
      if (!s) return sum;
      const n = parseFloat(s.amount);
      if (!Number.isFinite(n)) return sum;
      if (s.type === "withdrawal") return sum - n;
      if (s.type === "deposit") return sum + n;
      return sum;
    }, 0);

    function pageHref(p: number) {
      const params = new URLSearchParams();
      params.set("view", "all");
      if (p > 1) params.set("page", String(p));
      return `/accounts/${id}?${params.toString()}`;
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          {backLink}
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          {balance != null && (
            <p className="text-sm text-muted-foreground">
              Balance:{" "}
              <Money
                amount={balance}
                currency={currency}
                colorize
                className="text-sm font-medium"
              />
            </p>
          )}
        </div>
        <MonthNav
          year={navYear}
          month={navMonth}
          isAll={isAllView}
          baseUrl={`/accounts/${id}`}
        />
        {groups.length === 0 ? (
          <Empty title="No transactions for this account" />
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {groups.length} transaction{groups.length !== 1 ? "s" : ""}
                {isAllView && totalPages > 1 ? " (this page)" : ""}
              </span>
              <Money
                amount={total}
                currency={primaryCurrency}
                colorize
                className="text-sm font-medium"
              />
            </div>
            <Card className="divide-y overflow-hidden p-0">
              {groups.map((g) => (
                <TransactionRow key={g.id} group={g} />
              ))}
            </Card>
            {isAllView && totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  aria-disabled={page <= 1}
                >
                  <Link href={pageHref(page - 1)}>Previous</Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  aria-disabled={page >= totalPages}
                >
                  <Link href={pageHref(page + 1)}>Next</Link>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorCard message={message} />
      </div>
    );
  }
}
