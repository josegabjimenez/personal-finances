import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  ChevronDown,
  ReceiptText,
  Repeat2,
} from "lucide-react";
import {
  getRecurringOverview,
  type RecurringObligation,
} from "@/lib/firefly/recurring";
import { formatDateLong, formatDateShort, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recurring" };

type RecurringPageData =
  | { ok: true; data: Awaited<ReturnType<typeof getRecurringOverview>> }
  | { ok: false; error: string | undefined };

async function getRecurringPageData(): Promise<RecurringPageData> {
  try {
    return { ok: true, data: await getRecurringOverview() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : undefined };
  }
}

function dateLabel(value: string | null | undefined, style: "short" | "long" = "long") {
  if (!value) return "—";
  return style === "short" ? formatDateShort(value) : formatDateLong(value);
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function shortCadence(value: string | null | undefined) {
  if (!value) return "Recurring";
  return value
    .replace(/^Every month on the (\d+).*/i, "Monthly · day $1")
    .replace(/^Every /i, "")
    .replace("st/nd/rd/th", "")
    .replace(/\s+/g, " ")
    .trim();
}

function ObligationStatus({ obligation }: { obligation: RecurringObligation }) {
  const config = {
    automated: {
      label: "Automated",
      icon: Repeat2,
      className: "text-muted-foreground",
    },
    tracked: {
      label: "Tracked only",
      icon: ReceiptText,
      className: "text-warning",
    },
    untracked: {
      label: "No bill",
      icon: AlertTriangle,
      className: "text-warning",
    },
    paused: {
      label: "Paused",
      icon: AlertTriangle,
      className: "text-muted-foreground",
    },
    reserve_only: {
      label: "Unlinked reserve",
      icon: ArrowRightLeft,
      className: "text-warning",
    },
  }[obligation.status];
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function HeroFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}

function HeroSummary({
  data,
  nextExpense,
}: {
  data: Awaited<ReturnType<typeof getRecurringOverview>>;
  nextExpense?: RecurringObligation;
}) {
  return (
    <Card className="overflow-hidden bg-card/80 p-4 shadow-sm shadow-black/5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Monthly scheduled
          </p>
          <Money amount={data.totals.withdrawalAmount} currency={data.totals.currency} expense className="text-3xl tracking-tight" />
          <p className="text-xs text-muted-foreground">
            {data.totals.activeObligations} obligations · card reserves excluded from spending
          </p>
        </div>
        <div className="rounded-full bg-danger/10 p-2 text-danger">
          <Repeat2 className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <HeroFact
          label="Next expense"
          value={nextExpense ? `${nextExpense.name} · ${dateLabel(nextExpense.nextDate, "short")}` : "Nothing scheduled"}
        />
        <HeroFact
          label="Card reserves"
          value={
            <>
              <Money amount={data.totals.transferAmount} currency={data.totals.currency} /> · not spending
            </>
          }
        />
        <HeroFact
          label="Firefly setup"
          value={
            data.totals.needsAttention > 0
              ? `${data.totals.needsAttention} need attention`
              : `${data.totals.activeBills} bills · all linked`
          }
        />
      </div>
    </Card>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function ObligationAmount({ obligation }: { obligation: RecurringObligation }) {
  if (obligation.status === "reserve_only" && obligation.reserve) {
    return (
      <Money
        amount={obligation.reserve.amount}
        currency={obligation.reserve.currency}
        className="text-transfer"
      />
    );
  }
  if (obligation.amountMin === obligation.amountMax) {
    return <Money amount={obligation.amountMin} currency={obligation.currency} expense />;
  }
  return (
    <span className="tabular-nums font-medium text-danger">
      {formatMoney(obligation.amountMin, obligation.currency)}–
      {formatMoney(obligation.amountMax, obligation.currency)}
    </span>
  );
}

function ObligationRow({ obligation }: { obligation: RecurringObligation }) {
  const flow = [obligation.source, obligation.destination].filter(Boolean).join(" → ");
  const details = [
    shortCadence(obligation.frequency),
    obligation.nextDate ? `Next ${dateLabel(obligation.nextDate, "short")}` : null,
    obligation.budget ?? obligation.category,
  ].filter(Boolean).join(" · ");

  return (
    <div className="px-4 py-3" data-obligation-id={obligation.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <ObligationStatus obligation={obligation} />
          <h3 className="truncate text-sm font-semibold text-foreground">{obligation.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{details}</p>
          {flow ? <p className="truncate text-[11px] text-muted-foreground">{flow}</p> : null}
        </div>
        <div className="shrink-0 text-right text-sm">
          <ObligationAmount obligation={obligation} />
        </div>
      </div>

      {obligation.reserve ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-transfer/15 bg-transfer/5 px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-medium text-transfer">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Card reserve · not spending
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {[obligation.reserve.destination, obligation.reserve.nextDate ? `Next ${dateLabel(obligation.reserve.nextDate, "short")}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Money
            amount={obligation.reserve.amount}
            currency={obligation.reserve.currency}
            className="shrink-0 text-xs text-transfer"
          />
        </div>
      ) : null}

      {obligation.attention.length > 0 ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {obligation.attention.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function FireflySetup({ data }: { data: Awaited<ReturnType<typeof getRecurringOverview>> }) {
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
        <span className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          Firefly setup
        </span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {data.bills.length} bills · {data.recurrences.length} automations
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid gap-2 border-t p-4 text-xs sm:grid-cols-3">
        <HeroFact label="Bills" value={`${data.bills.length} track obligations`} />
        <HeroFact label="Automations" value={`${data.totals.activeScheduledWithdrawals} create expenses`} />
        <HeroFact label="Card reserves" value={`${data.totals.activeScheduledTransfers} move cash, not spending`} />
      </div>
    </details>
  );
}

function CompactList({ children }: { children: React.ReactNode }) {
  return <Card className="divide-y overflow-hidden p-0">{children}</Card>;
}

export default async function RecurringPage() {
  const result = await getRecurringPageData();

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recurring expenses" />
        <ErrorCard title="Could not load recurring expenses" message={result.error} />
      </div>
    );
  }

  const { data } = result;
  const obligations = [...data.obligations].sort((a, b) =>
    timestamp(a.nextDate) - timestamp(b.nextDate) || a.name.localeCompare(b.name)
  );
  const nextExpense = obligations.find(
    (obligation) => obligation.active && obligation.status !== "reserve_only"
  );
  const attention = obligations.filter((obligation) => obligation.attention.length > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring expenses"
        subtitle="One clear view of obligations, automations, and card reserves."
      />

      <HeroSummary data={data} nextExpense={nextExpense} />

      <section className="space-y-3">
        <SectionHeader
          title="Obligations"
          description="One row per recurring commitment. Bills and automations are already combined."
          action={
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <CalendarClock className="h-3.5 w-3.5" />
              Next due first
            </div>
          }
        />

        {obligations.length === 0 ? (
          <Empty title="No recurring obligations" description="No Firefly bills or recurrences were returned for this account." />
        ) : (
          <CompactList>
            {obligations.map((obligation) => (
              <ObligationRow key={obligation.id} obligation={obligation} />
            ))}
          </CompactList>
        )}
      </section>

      {attention.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Needs attention"
            description="Firefly links that could not be consolidated with high confidence."
          />
          <Card className="divide-y overflow-hidden p-0">
            {attention.map((obligation) => (
              <div key={obligation.id} className="flex items-start gap-2 px-4 py-3 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-foreground">{obligation.name}</p>
                  <p className="text-muted-foreground">{obligation.attention.join(" · ")}</p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <FireflySetup data={data} />
    </div>
  );
}
