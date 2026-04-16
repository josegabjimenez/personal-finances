import {
  currentMonthRange,
  listBudgetLimits,
  listBudgets,
} from "@/lib/firefly/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  try {
    const { start, end } = currentMonthRange();
    const [budgets, limits] = await Promise.all([
      listBudgets(),
      listBudgetLimits(start, end),
    ]);

    const limitByBudget = new Map<string, { amount: number; currency: string; spent: number }>();
    for (const limit of limits) {
      const bid = limit.attributes.budget_id;
      const amount = parseFloat(limit.attributes.amount);
      const spent = Math.abs(parseFloat(limit.attributes.spent ?? "0") || 0);
      const currency = limit.attributes.currency_code ?? "USD";
      const existing = limitByBudget.get(bid);
      if (existing) {
        existing.amount += amount;
        existing.spent += spent;
      } else {
        limitByBudget.set(bid, { amount, currency, spent });
      }
    }

    const rows = budgets
      .filter((b) => b.attributes.active !== false)
      .map((b) => {
        const lim = limitByBudget.get(b.id);
        const amount = lim?.amount ?? 0;
        const spent = lim?.spent ?? 0;
        const currency = lim?.currency ?? "USD";
        const pct = amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;
        return { b, amount, spent, currency, pct };
      });

    return (
      <div className="space-y-4">
        <PageHeader
          title="Budgets"
          subtitle="This month's spending against your limits."
        />
        {rows.length === 0 ? (
          <Empty
            title="No active budgets"
            description="Create budgets in Firefly III to track spending limits."
          />
        ) : (
          <div className="space-y-3">
            {rows.map(({ b, amount, spent, currency, pct }) => (
              <Card key={b.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-foreground">
                      {b.attributes.name}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {amount > 0 ? `${Math.round(pct)}%` : "—"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress
                    value={pct}
                    indicatorClassName={cn(
                      pct >= 100
                        ? "bg-danger"
                        : pct >= 80
                          ? "bg-warning"
                          : "bg-success"
                    )}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      <Money amount={spent} currency={currency} /> spent
                    </span>
                    <span>
                      of <Money amount={amount} currency={currency} />
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return (
      <div className="space-y-6">
        <PageHeader title="Budgets" />
        <ErrorCard message={message} />
      </div>
    );
  }
}
