import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  ReceiptText,
  Repeat2,
  WalletCards,
} from "lucide-react";
import { getRecurringOverview, type ScheduledRecurringTransaction } from "@/lib/firefly/recurring";
import type { Bill } from "@/lib/firefly/types";
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

function parseMoney(value: string | null | undefined) {
  const parsed = parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: string | null | undefined, style: "short" | "long" = "long") {
  if (!value) return "—";
  return style === "short" ? formatDateShort(value) : formatDateLong(value);
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function compactFrequency(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
        active
          ? "border-success/20 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      <CheckCircle2 className="h-3 w-3" />
      {active ? "Active" : "Paused"}
    </span>
  );
}

function KindBadge({ kind }: { kind: "expense" | "reserve" | "bill" }) {
  const config = {
    expense: {
      label: "Expense",
      icon: WalletCards,
      className: "border-danger/20 bg-danger/10 text-danger",
    },
    reserve: {
      label: "Reserve",
      icon: ArrowRightLeft,
      className: "border-transfer/20 bg-transfer/10 text-transfer",
    },
    bill: {
      label: "Bill",
      icon: ReceiptText,
      className: "border-primary/20 bg-primary/10 text-primary",
    },
  }[kind];
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium", config.className)}>
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
  nextReserve,
}: {
  data: Awaited<ReturnType<typeof getRecurringOverview>>;
  nextExpense?: ScheduledRecurringTransaction;
  nextReserve?: ScheduledRecurringTransaction;
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
            {data.totals.activeScheduledWithdrawals} expenses · reserve transfers excluded from spending
          </p>
        </div>
        <div className="rounded-full bg-danger/10 p-2 text-danger">
          <Repeat2 className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <HeroFact
          label="Next expense"
          value={nextExpense ? `${nextExpense.description} · ${dateLabel(nextExpense.nextDate, "short")}` : "Nothing scheduled"}
        />
        <HeroFact
          label="Reserve transfers"
          value={
            <>
              <Money amount={data.totals.transferAmount} currency={data.totals.currency} /> · {nextReserve ? dateLabel(nextReserve.nextDate, "short") : "none"}
            </>
          }
        />
        <HeroFact
          label="Tracked bills"
          value={`${data.totals.activeBills} active · ${data.totals.activeRecurrences} automations`}
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

function ScheduledRow({ item }: { item: ScheduledRecurringTransaction }) {
  const isReserve = item.recurrenceType === "transfer";
  const flow = [item.source, item.destination].filter(Boolean).join(" → ");
  const details = [
    shortCadence(item.frequency),
    item.nextDate ? `Next ${dateLabel(item.nextDate, "short")}` : null,
    item.budget ?? item.category,
  ].filter(Boolean).join(" · ");

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={isReserve ? "reserve" : "expense"} />
            <StatusBadge active={item.active} />
            {item.billName ? <KindBadge kind="bill" /> : null}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{item.description}</h3>
            <p className="truncate text-xs text-muted-foreground">{details || item.title}</p>
          </div>
          {flow ? <p className="truncate text-[11px] text-muted-foreground">{flow}</p> : null}
        </div>
        <Money
          amount={item.amount}
          currency={item.currency}
          expense={!isReserve}
          className={cn("shrink-0 text-sm", isReserve && "text-transfer")}
        />
      </div>
    </div>
  );
}

function BillAmount({ bill }: { bill: Bill }) {
  const min = parseMoney(bill.attributes.amount_min);
  const max = parseMoney(bill.attributes.amount_max);
  const currency = bill.attributes.currency_code ?? "COP";

  if (min === max) return <Money amount={min} currency={currency} />;
  return (
    <span className="tabular-nums font-medium">
      {formatMoney(min, currency)}–{formatMoney(max, currency)}
    </span>
  );
}

function BillRow({ bill, automated }: { bill: Bill; automated: boolean }) {
  const attrs = bill.attributes;
  const subtitle = [
    compactFrequency(attrs.repeat_freq),
    attrs.next_expected_match || attrs.date ? `Next ${dateLabel(attrs.next_expected_match ?? attrs.date, "short")}` : null,
    automated ? "Automated" : "Tracked only",
  ].filter(Boolean).join(" · ");

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind="bill" />
            <StatusBadge active={attrs.active ?? false} />
            {automated ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
                <Repeat2 className="h-3 w-3" />
                Automated
              </span>
            ) : null}
          </div>
          <h3 className="truncate text-sm font-semibold text-foreground">{attrs.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          {attrs.notes ? <p className="line-clamp-2 text-[11px] text-muted-foreground">{attrs.notes}</p> : null}
        </div>
        <div className="shrink-0 text-right text-sm">
          <BillAmount bill={bill} />
        </div>
      </div>
    </div>
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
  const scheduled = [...data.scheduled].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return timestamp(a.nextDate) - timestamp(b.nextDate) || a.description.localeCompare(b.description);
  });
  const activeScheduled = scheduled.filter((item) => item.active);
  const nextExpense = activeScheduled.find((item) => item.recurrenceType === "withdrawal");
  const nextReserve = activeScheduled.find((item) => item.recurrenceType === "transfer");
  const bills = [...data.bills].sort((a, b) => {
    if ((a.attributes.active ?? false) !== (b.attributes.active ?? false)) {
      return a.attributes.active ? -1 : 1;
    }
    return timestamp(a.attributes.next_expected_match ?? a.attributes.date) -
      timestamp(b.attributes.next_expected_match ?? b.attributes.date) ||
      a.attributes.name.localeCompare(b.attributes.name);
  });
  const automatedBillKeys = new Set(
    data.scheduled.flatMap((item) => [item.billId, item.billName]).filter(Boolean)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring expenses"
        subtitle="Bills, subscriptions, and predictable charges."
      />

      <HeroSummary data={data} nextExpense={nextExpense} nextReserve={nextReserve} />

      <section className="space-y-3">
        <SectionHeader
          title="Schedule"
          description="Expenses first. Reserve transfers are shown separately and do not count as spending."
          action={
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <CalendarClock className="h-3.5 w-3.5" />
              Next first
            </div>
          }
        />

        {scheduled.length === 0 ? (
          <Empty title="No scheduled recurrences" description="No Firefly recurrences were returned for this account." />
        ) : (
          <CompactList>
            {scheduled.map((item) => <ScheduledRow key={item.id} item={item} />)}
          </CompactList>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Bills & subscriptions"
          description="Expected recurring charges tracked by Firefly bills."
        />

        {bills.length === 0 ? (
          <Empty title="No bills configured" description="No Firefly bills were returned for this account." />
        ) : (
          <CompactList>
            {bills.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                automated={automatedBillKeys.has(bill.id) || automatedBillKeys.has(bill.attributes.name)}
              />
            ))}
          </CompactList>
        )}
      </section>
    </div>
  );
}
