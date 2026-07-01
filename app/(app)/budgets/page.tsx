import Link from "next/link";
import { listBudgetLimits, listBudgets } from "@/lib/firefly/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetMonthNav } from "@/components/budgets/budget-month-nav";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";
import { endOfMonth, toYMD } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Budget } from "@/lib/firefly/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Budgets" };

type BudgetRow = {
  b: Budget;
  amount: number;
  spent: number;
  remaining: number;
  currency: string;
  pct: number;
};

type SearchParams = { start?: string; end?: string; month?: string };

type BudgetPeriod = {
  start: Date;
  end: Date;
  startYMD: string;
  endYMD: string;
  year: number;
  month: number;
  label: string;
};

type BudgetsPageData =
  | { ok: true; rows: BudgetRow[] }
  | { ok: false; error: string | undefined };

const FINANCE_TIME_ZONE = "America/Bogota";

function currentFinanceYearMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FINANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  return { year, month };
}

function parseYearMonth(value?: string | null) {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function getBudgetPeriod(sp: SearchParams, current: { year: number; month: number }): BudgetPeriod {
  const selected = parseYearMonth(sp.month) ?? parseYearMonth(sp.start) ?? current;
  const monthStart = new Date(selected.year, selected.month - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;

  return {
    start: monthStart,
    end: monthEnd,
    startYMD: toYMD(monthStart),
    endYMD: toYMD(monthEnd),
    year,
    month,
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(monthStart),
  };
}

function budgetDetailHref(id: string, period: BudgetPeriod) {
  const params = new URLSearchParams({ start: period.startYMD, end: period.endYMD });
  return `/budgets/${id}?${params.toString()}`;
}

async function getBudgetsPageData(period: BudgetPeriod): Promise<BudgetsPageData> {
  try {
    const [budgets, limits] = await Promise.all([
      listBudgets(),
      listBudgetLimits(period.start, period.end),
    ]);

    const limitByBudget = new Map<
      string,
      { amount: number; currency: string; spent: number }
    >();
    for (const limit of limits) {
      const bid = limit.attributes.budget_id;
      const amount = parseFloat(limit.attributes.amount);
      const spent = (limit.attributes.spent ?? []).reduce(
        (s, e) => s + Math.abs(parseFloat(e.sum ?? "0") || 0),
        0
      );
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
      .filter((b) => limitByBudget.has(b.id))
      .map((b) => {
        const lim = limitByBudget.get(b.id)!;
        const amount = lim.amount;
        const spent = lim.spent;
        const currency = lim.currency;
        const pct = amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;
        const remaining = amount - spent;
        return { b, amount, spent, remaining, currency, pct };
      });

    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : undefined };
  }
}

function BudgetSummaryCard({ rows }: { rows: BudgetRow[] }) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency)));
  const hasMixedCurrencies = currencies.length > 1;
  const currency = currencies[0] ?? "COP";
  const assigned = rows.reduce((sum, row) => sum + row.amount, 0);
  const spent = rows.reduce((sum, row) => sum + row.spent, 0);
  const remaining = assigned - spent;
  const pct = assigned > 0 ? Math.min(100, (spent / assigned) * 100) : 0;
  const headline = remaining < 0 ? "over budget" : "left";

  return (
    <Card className="overflow-hidden bg-card/80 p-4 shadow-sm shadow-black/5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Monthly budget overview
          </p>
          {hasMixedCurrencies ? (
            <p className="text-2xl font-semibold tracking-tight">Mixed currencies</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Money
                amount={Math.abs(remaining)}
                currency={currency}
                className={cn(
                  "text-2xl tracking-tight",
                  remaining < 0 && "text-danger"
                )}
              />
              <span className={cn("text-sm font-medium", remaining < 0 && "text-danger")}>
                {headline}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {hasMixedCurrencies ? (
              "Review each budget card for currency-specific totals."
            ) : (
              <>
                <Money amount={spent} currency={currency} /> spent of{" "}
                <Money amount={assigned} currency={currency} /> assigned
              </>
            )}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-xs font-medium",
            remaining < 0
              ? "border-danger/20 bg-danger/10 text-danger"
              : pct >= 80
                ? "border-warning/20 bg-warning/10 text-warning"
                : "border-success/20 bg-success/10 text-success"
          )}
        >
          {assigned > 0 && !hasMixedCurrencies ? `${Math.round(pct)}%` : "—"}
        </span>
      </div>
      {!hasMixedCurrencies ? (
        <Progress
          value={pct}
          className="mt-4"
          indicatorClassName={cn(
            remaining < 0 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-success"
          )}
        />
      ) : null}
    </Card>
  );
}

function BudgetPeriodNav({
  period,
  current,
}: {
  period: BudgetPeriod;
  current: { year: number; month: number };
}) {
  return (
    <BudgetMonthNav
      year={period.year}
      month={period.month}
      currentYear={current.year}
      currentMonth={current.month}
    />
  );
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const current = currentFinanceYearMonth();
  const period = getBudgetPeriod(sp, current);
  const data = await getBudgetsPageData(period);

  if (!data.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Budgets" />
        <BudgetPeriodNav period={period} current={current} />
        <ErrorCard message={data.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budgets"
        subtitle={`Assigned limits and spending for ${period.label}.`}
      />
      <BudgetPeriodNav period={period} current={current} />
      {data.rows.length === 0 ? (
        <Empty
          title={`No budget set for ${period.label}`}
          description="Budgets were not tracked during this period. Use the month picker to review another month."
        />
      ) : (
        <>
          <BudgetSummaryCard rows={data.rows} />
          <div className="space-y-3">
            {data.rows.map(({ b, amount, spent, remaining, currency, pct }) => (
              <Card key={b.id} className="overflow-hidden">
                <Link
                  href={budgetDetailHref(b.id, period)}
                  className="block transition-colors hover:bg-accent/40"
                >
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
                      <span
                        className={remaining < 0 ? "text-danger font-medium" : ""}
                      >
                        <Money amount={Math.abs(remaining)} currency={currency} />{" "}
                        {remaining < 0 ? "over" : "left"}
                      </span>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
