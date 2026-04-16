import Link from "next/link";
import { listTransactions } from "@/lib/firefly/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { FilterBar } from "@/components/transactions/filter-bar";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactions" };

interface SearchParams {
  q?: string;
  type?: "withdrawal" | "deposit" | "transfer";
  start?: string;
  end?: string;
  page?: string;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  try {
    const { groups, totalPages } = await listTransactions({
      page,
      limit: 50,
      type: sp.type,
      start: sp.start,
      end: sp.end,
    });

    const q = (sp.q ?? "").trim().toLowerCase();
    const filtered = q
      ? groups.filter((g) => {
          const s = g.attributes.transactions[0];
          const hay = [
            s?.description,
            s?.source_name,
            s?.destination_name,
            s?.category_name,
            s?.budget_name,
            g.attributes.group_title,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : groups;

    // Preserve other search params when changing page
    function pageHref(newPage: number) {
      const params = new URLSearchParams();
      if (sp.q) params.set("q", sp.q);
      if (sp.type) params.set("type", sp.type);
      if (sp.start) params.set("start", sp.start);
      if (sp.end) params.set("end", sp.end);
      if (newPage > 1) params.set("page", String(newPage));
      const qs = params.toString();
      return `/transactions${qs ? `?${qs}` : ""}`;
    }

    return (
      <div className="space-y-4">
        <PageHeader title="Transactions" />
        <FilterBar
          initialQ={sp.q ?? ""}
          initialType={sp.type ?? "all"}
          initialStart={sp.start ?? ""}
          initialEnd={sp.end ?? ""}
        />
        {filtered.length === 0 ? (
          <Empty title="No transactions match your filters" />
        ) : (
          <Card className="divide-y overflow-hidden p-0">
            {filtered.map((g) => (
              <TransactionRow key={g.id} group={g} />
            ))}
          </Card>
        )}
        {totalPages > 1 ? (
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
