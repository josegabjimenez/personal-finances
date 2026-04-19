import Link from "next/link";
import { listTransactions, listAccounts, listCategories, listTags } from "@/lib/firefly/queries";
import { toYMD, startOfMonth, endOfMonth } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/common/money";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { FilterBar } from "@/components/transactions/filter-bar";
import { MonthNav } from "@/components/transactions/month-nav";
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
  page?: string;
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

  // Parse year/month from effective start for MonthNav
  const [yearStr, monthStr] = (effectiveStart ?? "").split("-");
  const navYear = parseInt(yearStr) || new Date().getFullYear();
  const navMonth = parseInt(monthStr) || (new Date().getMonth() + 1);

  // Month view: fetch all at once (no pagination). All view: paginate.
  const page = isAllView ? Math.max(1, parseInt(sp.page ?? "1", 10) || 1) : 1;
  const limit = isAllView ? 50 : 500;

  try {
    const [{ groups, totalPages }, accounts, categories, tags] = await Promise.all([
      listTransactions({
        page,
        limit,
        type: sp.type,
        start: effectiveStart,
        end: effectiveEnd,
      }),
      listAccounts("asset").catch(() => []),
      listCategories().catch(() => []),
      listTags().catch(() => []),
    ]);

    const q = (sp.q ?? "").trim().toLowerCase();
    let filtered = groups;

    if (q) {
      filtered = filtered.filter((g) => {
        const s = g.attributes.transactions[0];
        const hay = [
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
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (sp.account) {
      filtered = filtered.filter((g) => {
        const s = g.attributes.transactions[0];
        return s?.source_name === sp.account || s?.destination_name === sp.account;
      });
    }

    if (sp.category) {
      filtered = filtered.filter((g) => {
        const s = g.attributes.transactions[0];
        return s?.category_name === sp.category;
      });
    }

    if (sp.tag) {
      filtered = filtered.filter((g) => {
        const s = g.attributes.transactions[0];
        return s?.tags?.includes(sp.tag!) ?? false;
      });
    }

    const primaryCurrency =
      filtered[0]?.attributes.transactions[0]?.currency_code ?? "COP";
    const total = filtered.reduce((sum, g) => {
      const s = g.attributes.transactions[0];
      if (!s) return sum;
      const n = parseFloat(s.amount);
      if (!Number.isFinite(n)) return sum;
      if (s.type === "withdrawal") return sum - n;
      if (s.type === "deposit") return sum + n;
      return sum;
    }, 0);

    function pageHref(newPage: number) {
      const params = new URLSearchParams();
      if (sp.q) params.set("q", sp.q);
      if (sp.type) params.set("type", sp.type);
      if (effectiveStart) params.set("start", effectiveStart!);
      if (effectiveEnd) params.set("end", effectiveEnd!);
      if (sp.account) params.set("account", sp.account);
      if (sp.category) params.set("category", sp.category);
      if (sp.tag) params.set("tag", sp.tag);
      if (isAllView) params.set("view", "all");
      if (newPage > 1) params.set("page", String(newPage));
      const qs = params.toString();
      return `/transactions${qs ? `?${qs}` : ""}`;
    }

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
        {filtered.length === 0 ? (
          <Empty title="No transactions match your filters" />
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
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
              {filtered.map((g) => (
                <TransactionRow key={g.id} group={g} />
              ))}
            </Card>
          </>
        )}
        {isAllView && totalPages > 1 ? (
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
        ) : null}
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return (
      <div className="space-y-6">
        <PageHeader title="Transactions" />
        <ErrorCard message={message} />
      </div>
    );
  }
}
