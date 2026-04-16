import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  currentMonthRange,
  getSummaryBasic,
  interpretSummary,
  listTransactions,
} from "@/lib/firefly/queries";
import { PageHeader } from "@/components/page-header";
import { NetWorthCard } from "@/components/dashboard/net-worth-card";
import { MonthTiles } from "@/components/dashboard/month-tiles";
import { Card } from "@/components/ui/card";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { ErrorCard } from "@/components/common/error-card";
import { Empty } from "@/components/common/empty";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    const { start, end } = currentMonthRange();
    const [summary, txns] = await Promise.all([
      getSummaryBasic(start, end),
      listTransactions({ limit: 5 }),
    ]);
    const s = interpretSummary(summary);
    const currency =
      s.netWorth?.currency ?? s.balance?.currency ?? s.spent?.currency ?? "USD";

    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="A quick look at your money." />

        <NetWorthCard
          value={s.netWorth?.value ?? s.balance?.value ?? null}
          currency={currency}
          subtitle="All accounts combined"
        />

        <MonthTiles
          earned={s.earned}
          spent={s.spent}
          currency={currency}
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Recent activity
            </h2>
            <Link
              href="/transactions"
              prefetch
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {txns.groups.length === 0 ? (
            <Empty title="No transactions yet" />
          ) : (
            <Card className="divide-y overflow-hidden p-0">
              {txns.groups.map((g) => (
                <TransactionRow key={g.id} group={g} />
              ))}
            </Card>
          )}
        </section>
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <ErrorCard message={message} />
      </div>
    );
  }
}
