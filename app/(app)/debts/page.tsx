import Link from "next/link";
import { AlertCircle, ArrowDownToLine, ArrowUpRight, CheckCircle2, ChevronRight, CreditCard, Landmark, PiggyBank, ShieldCheck, WalletCards } from "lucide-react";
import { getDebtDashboard, type CreditCardDebtMetrics, type DebtDashboardResponse, type LoanDebtMetrics, type OtherLiabilityDebt } from "@/lib/firefly/debts";
import { formatDateShort, formatMoney, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
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

const LOAN_STATUS_LABELS: Record<LoanDebtMetrics["status"], string> = {
  paid_this_month: "Paid this month",
  partial_payment: "Partial",
  due: "Due this month",
  unknown: "Unknown",
};

const LOAN_STATUS_STYLES: Record<LoanDebtMetrics["status"], string> = {
  paid_this_month: "bg-success/10 text-success border-success/20",
  partial_payment: "bg-warning/10 text-warning border-warning/20",
  due: "bg-danger/10 text-danger border-danger/20",
  unknown: "bg-muted text-muted-foreground border-border",
};

function detailHref(cardKey: string, period: { start: string; end: string }) {
  const params = new URLSearchParams({ start: period.start, end: period.end });
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

function DebtMonthNav({ start }: { start: string }) {
  const { year, month } = navDateParts(start);
  return <MonthNav year={year} month={month} isAll={false} baseUrl="/debts" locale="en-US" labelAction="none" />;
}

function HeroSummary({ data }: { data: DebtDashboardResponse }) {
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total debt</p>
          <Money amount={data.totals.totalDebt} currency={data.currency} className="text-3xl" />
          <p className="text-xs text-muted-foreground">
            Cards {formatMoney(data.totals.creditCardDebt, data.currency)} · Loans {formatMoney(data.totals.loanDebt, data.currency)} · Other {formatMoney(data.totals.otherLiabilitiesDebt, data.currency)}
          </p>
        </div>
        <div className="rounded-full bg-danger/10 p-2 text-danger">
          <Landmark className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function MiniMetricCard({ title, amount, currency, subtitle, tone }: { title: string; amount?: number; currency: string; subtitle: string; tone?: "warning" | "success" }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          {amount === undefined ? <p className="text-lg font-semibold">—</p> : <Money amount={amount} currency={currency} className="text-lg" />}
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn("rounded-full bg-muted p-1.5 text-muted-foreground", tone === "warning" && "bg-warning/10 text-warning", tone === "success" && "bg-success/10 text-success")}>
          {tone === "success" ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        </div>
      </div>
    </Card>
  );
}

function ActivityStrip({ data }: { data: DebtDashboardResponse }) {
  const items = [
    { label: "Purchases", value: data.totals.monthlyCardPurchases, icon: WalletCards, tone: "text-danger" },
    { label: "Payments", value: data.totals.monthlyCardPayments + data.totals.monthlyLoanPayments, icon: ArrowDownToLine, tone: "text-success" },
    { label: "Reserved", value: data.totals.monthlyCardReservations, icon: PiggyBank, tone: "text-success" },
    { label: "Fees", value: data.totals.monthlyInterestFees + data.totals.estimatedLoanInterest, icon: ArrowUpRight, tone: "text-warning" },
  ];

  return (
    <Card className="p-3">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {items.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 px-2 py-2">
            <Icon className={cn("h-4 w-4 shrink-0", tone)} />
            <div className="min-w-0">
              <p className="text-muted-foreground">{label}</p>
              <p className="truncate font-medium">{formatMoney(value, data.currency)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardOverview({ card, period }: { card: CreditCardDebtMetrics; period: { start: string; end: string } }) {
  const coveragePct = card.coverage === null ? 0 : Math.min(card.coverage * 100, 100);
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 truncate text-sm font-semibold"><CreditCard className="h-4 w-4" />{card.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Reserved: {formatMoney(card.reserved, card.currency)}</p>
          </div>
          <Link href={detailHref(card.key, period)} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">Details <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>

        {!card.found || !card.reserveFound ? (
          <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
            {!card.found ? `Account not found: ${card.name}. ` : null}
            {!card.reserveFound ? `Reserve account not found: ${card.reserveName}.` : null}
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Current debt</p>
            <Money amount={card.debt} currency={card.currency} className="text-xl" />
          </div>
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", STATUS_STYLES[card.status])}>{STATUS_LABELS[card.status]}</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Coverage</span><span className="font-medium">{card.coverage === null ? "No debt" : formatPercent(card.coverage, 0)}</span></div>
          <Progress value={coveragePct} indicatorClassName={card.status === "under_reserved" ? "bg-warning" : card.status === "covered" ? "bg-success" : "bg-foreground"} />
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{card.gap < 0 ? "Excess reserve" : "Missing reserve"}</span><Money amount={Math.abs(card.gap)} currency={card.currency} className={cn("text-xs", card.gap > 0 && "text-warning", card.gap < 0 && "text-success")} /></div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <span className="rounded bg-muted/40 px-2 py-1">Purchases {formatMoney(card.monthlyPurchases, card.currency)}</span>
          <span className="rounded bg-muted/40 px-2 py-1">Payments {formatMoney(card.monthlyPayments, card.currency)}</span>
          <span className="rounded bg-muted/40 px-2 py-1">Reserved {formatMoney(card.monthlyReservations, card.currency)}</span>
          <span className="rounded bg-muted/40 px-2 py-1">Fees {formatMoney(card.monthlyInterestFees, card.currency)}</span>
        </div>
      </div>
    </Card>
  );
}

function monthsLeftLabel(months: number | null) {
  if (months === null) return "Timeline unknown";
  if (months <= 1) return "~1 month left";
  return `~${months} months left`;
}

function LoanCard({ loan }: { loan: LoanDebtMetrics }) {
  return (
    <Link href={`/accounts/${loan.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{loan.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{loan.purpose ?? loan.liabilityType ?? "Liability"}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium", LOAN_STATUS_STYLES[loan.status])}>{LOAN_STATUS_LABELS[loan.status]}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <Money amount={loan.debt} currency={loan.currency} className="text-xl" />
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Payment {loan.monthlyPayment ? formatMoney(loan.monthlyPayment, loan.currency) : "Unknown"}</p>
          <p>{monthsLeftLabel(loan.estimatedMonthsRemaining)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded bg-muted/40 px-2 py-1">Paid this period {formatMoney(loan.paymentsThisPeriod, loan.currency)}</span>
        <span className="rounded bg-muted/40 px-2 py-1">Est. interest {formatMoney(loan.estimatedMonthlyInterest, loan.currency)}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {loan.monthlyInterestRate !== null && loan.monthlyInterestRate !== undefined ? `${formatPercent(loan.monthlyInterestRate, 2)} monthly interest` : "Interest unknown"}
        {loan.latestPeriodPayment ? ` · Latest period payment ${formatDateShort(loan.latestPeriodPayment.date)}` : " · No payment found in this period"}
      </p>
    </Link>
  );
}

function LoansAndLiabilities({ loans, otherLiabilities, currency, loanDebt, otherDebt }: { loans: LoanDebtMetrics[]; otherLiabilities: OtherLiabilityDebt[]; currency: string; loanDebt: number; otherDebt: number }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Loans & liabilities {formatMoney(loanDebt + otherDebt, currency)}</h2>
          <p className="text-xs text-muted-foreground">Loan balances are separate from credit card reserve gaps.</p>
        </div>
        <Link href="/accounts" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">Accounts <ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>

      {loans.length === 0 && otherLiabilities.length === 0 ? (
        <Empty title="No loans or extra liabilities" description="No active non-card liabilities with a balance were found besides TC1/TC2." />
      ) : null}

      {loans.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{loans.map((loan) => <LoanCard key={loan.id} loan={loan} />)}</div> : null}

      {otherLiabilities.length > 0 ? (
        <Card className="divide-y overflow-hidden p-0">
          {otherLiabilities.map((item) => (
            <Link key={item.id} href={`/accounts/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.liabilityType ?? "Other liability"}</p></div>
              <Money amount={item.debt} currency={item.currency} className="text-sm" />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      ) : null}
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
  const cardCoverage = data.totals.creditCardDebt > 0 ? data.totals.totalReserved / data.totals.creditCardDebt : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Debts & Credit" subtitle="Cards, loans, and liabilities in one place." />
      <DebtMonthNav start={data.monthStart} />

      <HeroSummary data={data} />

      <section className="grid grid-cols-2 gap-3">
        <MiniMetricCard title="Missing reserve" amount={data.totals.cardReserveGap} currency={data.currency} tone={data.totals.cardReserveGap > 0 ? "warning" : "success"} subtitle="Credit cards only" />
        <MiniMetricCard title="Card coverage" amount={undefined} currency={data.currency} tone={cardCoverage === null || cardCoverage >= 1 ? "success" : "warning"} subtitle={cardCoverage === null ? "No card debt" : `${formatPercent(cardCoverage, 0)} reserved`} />
      </section>

      <ActivityStrip data={data} />

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

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Credit cards {formatMoney(data.totals.creditCardDebt, data.currency)}</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />As of {formatDateShort(data.asOf)}</div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.cards.map((card) => <CardOverview key={card.key} card={card} period={period} />)}
        </div>
      </section>

      <LoansAndLiabilities loans={data.loans} otherLiabilities={data.otherLiabilities} currency={data.currency} loanDebt={data.totals.loanDebt} otherDebt={data.totals.otherLiabilitiesDebt} />
    </div>
  );
}
