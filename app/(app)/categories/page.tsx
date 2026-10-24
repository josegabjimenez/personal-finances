import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getExpenseByCategory } from "@/lib/firefly/queries";
import {
  categoryPeriod,
  categoryPeriodQuery,
  type CategoryPeriodSearchParams,
} from "@/lib/category-period";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";
import { CategoryDonut } from "@/components/charts/category-donut";
import { MonthNav } from "@/components/transactions/month-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<CategoryPeriodSearchParams>;
}) {
  const period = categoryPeriod(await searchParams);
  const periodQuery = categoryPeriodQuery(period);
  const header = (
    <PageHeader
      title="Categories"
      subtitle={`Where your money went in ${period.label}.`}
    />
  );
  const monthNav = (
    <MonthNav
      year={period.year}
      month={period.month}
      isAll={false}
      baseUrl="/categories"
      locale="en-US"
      allowAll={false}
      monthOnly
    />
  );

  try {
    const rows = await getExpenseByCategory(period.startDate, period.endDate);

    const cleaned = rows
      .map((r) => {
        const raw =
          r.difference_float ??
          (r.difference ? parseFloat(r.difference) : null);
        const amount = raw !== null && Number.isFinite(raw) ? Math.abs(raw) : 0;
        return {
          id: r.id ?? r.name ?? Math.random().toString(),
          categoryId: r.id ?? null,
          name: r.name ?? "(uncategorized)",
          currency: r.currency_code ?? "USD",
          amount,
        };
      })
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const currency = cleaned[0]?.currency ?? "USD";
    const total = cleaned.reduce((s, r) => s + r.amount, 0);

    // Top 7 + "Other" to keep the donut legible
    const chartData =
      cleaned.length > 8
        ? [
            ...cleaned.slice(0, 7).map((c) => ({ name: c.name, value: c.amount })),
            {
              name: "Other",
              value: cleaned.slice(7).reduce((s, r) => s + r.amount, 0),
            },
          ]
        : cleaned.map((c) => ({ name: c.name, value: c.amount }));

    return (
      <div className="space-y-4">
        {header}
        {monthNav}

        {cleaned.length === 0 ? (
          <Empty title={`No category spending in ${period.label}`} />
        ) : (
          <>
            <Card>
              <CardContent className="space-y-3 py-5">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total spent</p>
                  <Money
                    amount={total}
                    currency={currency}
                    className="text-2xl"
                  />
                </div>
                <CategoryDonut data={chartData} currency={currency} />
              </CardContent>
            </Card>

            <Card className="divide-y overflow-hidden p-0">
              {cleaned.map((c) => {
                const pct = total > 0 ? (c.amount / total) * 100 : 0;
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {pct.toFixed(1)}%
                      </p>
                    </div>
                    <Money
                      amount={c.amount}
                      currency={c.currency}
                      className="text-sm"
                    />
                    {c.categoryId && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </>
                );

                return c.categoryId ? (
                  <Link
                    key={c.id}
                    href={`/categories/${c.categoryId}?${periodQuery}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    {inner}
                  </div>
                );
              })}
            </Card>
          </>
        )}
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return (
      <div className="space-y-4">
        {header}
        {monthNav}
        <ErrorCard message={message} />
      </div>
    );
  }
}
