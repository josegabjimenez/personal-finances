import Link from "next/link";
import type { ComponentType } from "react";
import { AlertCircle, ArrowDownToLine, ArrowUpRight, CheckCircle2, ChevronRight, CreditCard, Landmark, PiggyBank, ShieldCheck, WalletCards } from "lucide-react";
import { getDebtDashboard, type CreditCardDebtMetrics, type DebtBreakdownItem, type DebtDashboardResponse, type DebtRecentTransaction, type OtherLiabilityDebt } from "@/lib/firefly/debts";
import { formatDateShort, formatMoney, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/common/money";
import { ErrorCard } from "@/components/common/error-card";
import { Empty } from "@/components/common/empty";
import { MonthNav } from "@/components/transactions/month-nav";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Debts & Credit" };

type SearchParams = { start?: string; end?: string; month?: string };

const STATUS_LABELS: Record<CreditCardDebtMetrics["status"], string> = {
  covered: "Covered",
  under_reserved: "Missing reserve",
  over_reserved: "Excess reserve",
  no_debt: "No debt",
};

const STATUS_STYLES: Record<CreditCardDebtMetrics["status"], string> = {
  covered: "bg-success/10 text-success border-success/20",
  under_reserved: "bg-warning/10 text-warning border-warning/20",
  over_reserved: "bg-transfer/10 text-transfer border-transfer/20",
  no_debt: "bg-muted text-muted-foreground border-border",
};

const TX_KIND_LABELS: Record<DebtRecentTransaction["kind"], string> = {
  purchase: "Purchase",
  reservation: "Reservation",
  payment: "Payment",
  interest_fee: "Interest & fees",
};

function detailHref(cardKey: string, period: { start: string; end: string }, extra?: Record<string, string>) {
  const params = new URLSearchParams({ start: period.start, end: period.end, ...extra });
  return `/debts/${cardKey}?${params.toString()}`;
}

function navDateParts(start: string) {
  const [year, month] = start.split("-").map(Number);
  return { year, month };
}

function periodLabel(start: string) {
  const { year, month } = navDateParts(start);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function StatCard({ title, amount, currency, icon: Icon, subtitle, tone }: { title: string; amount: number; currency: string; icon: ComponentType<{ className?: string }>; subtitle?: string; tone?: "danger" | "success" | "warning" }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <Money amount={amount} currency={currency} className="text-xl" />
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className={cn("rounded-full bg-muted p-2 text-muted-foreground", tone === "danger" && "bg-danger/10 text-danger", tone === "success" && "bg-success/10 text-success", tone === "warning" && "bg-warning/10 text-warning")}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function DebtMonthNav({ start }: { start: string }) {
  const { year, month } = navDateParts(start);
  return (
    <MonthNav year={year} month={month} isAll={false} baseUrl="/debts" locale="en-US" labelAction="none" />
  );
}

function BreakdownList({ title, items, currency, cardKey, period, filterKey }: { title: string; items: DebtBreakdownItem[]; currency: string; cardKey: string; period: { start: string; end: string }; filterKey: "category" | "budget" }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">No card spending found for this selected period.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.name} href={detailHref(cardKey, period, { [filterKey]: item.name, type: "purchase" })} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 transition-colors hover:bg-accent/60">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.count} transaction{item.count === 1 ? "" : "s"}</p>
              </div>
              <Money amount={item.amount} currency={currency} expense className="text-sm" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentTransactions({ transactions, period }: { transactions: DebtRecentTransaction[]; period: { start: string; end: string } }) {
  if (transactions.length === 0) {
    return <Empty title="No card activity in this period" description="Purchases, reservations, payments, and fees will appear here when Firefly III has matching transactions for the selected range." />;
  }
  return (
    <Card className="divide-y overflow-hidden p-0">
      {transactions.map((tx) => (
        <Link key={tx.id} href={detailHref(tx.cardKey, period, { type: tx.kind })} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{TX_KIND_LABELS[tx.kind]}</span>
              <span className="text-xs text-muted-foreground">{formatDateShort(tx.date)}</span>
            </div>
            <p className="mt-1 truncate text-sm font-medium">{tx.description}</p>
            <p className="truncate text-xs text-muted-foreground">{tx.categoryName ?? tx.budgetName ?? tx.destinationName ?? tx.sourceName ?? "No details"}</p>
          </div>
          <Money amount={tx.amount} currency={tx.currency} expense={tx.kind === "purchase" || tx.kind === "interest_fee"} className="text-sm" />
        </Link>
      ))}
    </Card>
  );
}

function MiniMetric({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <Money amount={value} currency={currency} className="text-sm" />
    </div>
  );
}

function CardMetrics({ card, period }: { card: CreditCardDebtMetrics; period: { start: string; end: string } }) {
  const coveragePct = card.coverage === null ? 0 : Math.min(card.coverage * 100, 100);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <CreditCard className="h-4 w-4" />
              {card.name}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Reserve account: {card.reserveName}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", STATUS_STYLES[card.status])}>{STATUS_LABELS[card.status]}</span>
            <Link href={detailHref(card.key, period)} className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">Details <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!card.found || !card.reserveFound ? (
          <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
            {!card.found ? `Account not found: ${card.name}. ` : null}
            {!card.reserveFound ? `Reserve account not found: ${card.reserveName}.` : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Current debt</p><Money amount={card.debt} currency={card.currency} className="text-lg" /></div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Reserved</p><Money amount={card.reserved} currency={card.currency} className="text-lg" /></div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Coverage</span><span className="font-medium">{card.coverage === null ? "No debt" : formatPercent(card.coverage, 0)}</span></div>
          <Progress value={coveragePct} indicatorClassName={card.status === "under_reserved" ? "bg-warning" : card.status === "covered" ? "bg-success" : "bg-foreground"} />
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{card.gap < 0 ? "Excess reserve" : "Missing reserve"}</span><Money amount={Math.abs(card.gap)} currency={card.currency} className={cn("text-xs", card.gap > 0 && "text-warning", card.gap < 0 && "text-success")} /></div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <MiniMetric label="Purchases" value={card.monthlyPurchases} currency={card.currency} />
          <MiniMetric label="Reservations" value={card.monthlyReservations} currency={card.currency} />
          <MiniMetric label="Payments" value={card.monthlyPayments} currency={card.currency} />
          <MiniMetric label="Interest & fees" value={card.monthlyInterestFees} currency={card.currency} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownList title="Spending by category" items={card.byCategory} currency={card.currency} cardKey={card.key} period={period} filterKey="category" />
          <BreakdownList title="Spending by budget" items={card.byBudget} currency={card.currency} cardKey={card.key} period={period} filterKey="budget" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent activity</h4><Link href={detailHref(card.key, period)} className="text-xs text-muted-foreground hover:text-foreground">View all</Link></div>
          <RecentTransactions transactions={card.recentTransactions} period={period} />
        </div>
      </CardContent>
    </Card>
  );
}

function OtherLiabilities({ items }: { items: OtherLiabilityDebt[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Other debts</h2>
        <Link href="/accounts" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">Accounts <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
      {items.length === 0 ? (
        <Empty title="No other liabilities" description="No active loans or additional debts with a balance were found besides TC1/TC2." />
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {items.map((item) => (
            <Link key={item.id} href={`/accounts/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p>{item.liabilityType ? <p className="truncate text-xs text-muted-foreground">{item.liabilityType}</p> : null}</div>
              <Money amount={item.debt} currency={item.currency} className="text-sm" />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      )}
    </section>
  );
}

type DebtsPageData = { ok: true; data: DebtDashboardResponse } | { ok: false; error: string | undefined };

async function getDebtsPageData(period: SearchParams): Promise<DebtsPageData> {
  try {
    return { ok: true, data: await getDebtDashboard(period) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : undefined };
  }
}

export default async function DebtsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const result = await getDebtsPageData(sp);

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Debts & Credit" />
        <ErrorCard title="Could not load debts and credit" message={result.error} />
      </div>
    );
  }

  const data = result.data;
  const period = { start: data.monthStart, end: data.monthEnd };
  return (
    <div className="space-y-4">
      <PageHeader title="Debts & Credit" subtitle="Credit card coverage, monthly spending, payments, and liabilities." />
      <DebtMonthNav start={data.monthStart} />

      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard title="Total debt" amount={data.totals.totalDebt} currency={data.currency} icon={Landmark} tone="danger" subtitle="Credit cards + other liabilities" />
        <StatCard title="Reserved for credit cards" amount={data.totals.totalReserved} currency={data.currency} icon={ShieldCheck} tone="success" subtitle="Savings for TC1/TC 2" />
        <StatCard title="Total missing reserve" amount={data.totals.totalGap} currency={data.currency} icon={AlertCircle} tone={data.totals.totalGap > 0 ? "warning" : "success"} subtitle="Debt minus reserves" />
        <StatCard title="Period purchases" amount={data.totals.monthlyPurchases} currency={data.currency} icon={WalletCards} subtitle="Real credit card spending" />
      </section>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-danger" /><span>Interest & fees: {formatMoney(data.totals.monthlyInterestFees, data.currency)}</span></div>
          <div className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4 text-success" /><span>Payments: {formatMoney(data.totals.monthlyPayments, data.currency)}</span></div>
          <div className="flex items-center gap-2"><PiggyBank className="h-4 w-4 text-success" /><span>Reservations: {formatMoney(data.totals.monthlyReservations, data.currency)}</span></div>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><span>As of: {formatDateShort(data.asOf)}</span></div>
        </div>
      </Card>

      {data.transactions.length === 0 ? (
        <Card className="border-dashed p-4">
          <p className="text-sm font-medium">No credit card transactions found for {periodLabel(data.monthStart)}.</p>
          <p className="mt-1 text-xs text-muted-foreground">Try the previous month if Firefly has card purchases in another period.</p>
        </Card>
      ) : null}

      {data.missingAccounts.length > 0 ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex gap-3 text-sm text-warning"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>Firefly III did not return these configured accounts: {data.missingAccounts.join(", ")}. The page still works, but those metrics use zero values.</p></div>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Credit cards</h2>
        {data.cards.map((card) => <CardMetrics key={card.key} card={card} period={period} />)}
      </section>

      <OtherLiabilities items={data.otherLiabilities} />
    </div>
  );
}
