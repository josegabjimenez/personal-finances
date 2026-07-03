import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  ReceiptText,
  Repeat2,
  Tags,
  WalletCards,
  type LucideIcon,
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

function compactFrequency(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
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
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isTransfer = type === "transfer";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
        isTransfer
          ? "border-transfer/20 bg-transfer/10 text-transfer"
          : "border-danger/20 bg-danger/10 text-danger"
      )}
    >
      {isTransfer ? <ArrowRightLeft className="h-3 w-3" /> : <WalletCards className="h-3 w-3" />}
      {isTransfer ? "Transfer" : "Expense"}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: React.ReactNode;
  subtitle: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <div className="text-lg font-semibold tracking-tight">{value}</div>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="rounded-full bg-muted p-1.5 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function ScheduledCard({ item }: { item: ScheduledRecurringTransaction }) {
  const flow = [item.source, item.destination].filter(Boolean).join(" → ");
  return (
    <Card className="overflow-hidden p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={item.recurrenceType} />
              <StatusBadge active={item.active} />
              {item.billName ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                  <ReceiptText className="h-3 w-3" />
                  Bill linked
                </span>
              ) : null}
            </div>
            <h3 className="truncate text-base font-semibold text-foreground">
              {item.description}
            </h3>
            <p className="truncate text-xs text-muted-foreground">{item.title}</p>
          </div>
          <Money amount={item.amount} currency={item.currency} expense={item.recurrenceType === "withdrawal"} className="shrink-0 text-base" />
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <InfoPill label="Next run" value={dateLabel(item.nextDate)} />
          <InfoPill label="Cadence" value={item.frequency} />
          <InfoPill label="Flow" value={flow || "—"} />
          <InfoPill label="Budget" value={item.budget ?? "—"} />
          <InfoPill label="Category" value={item.category ?? "—"} />
          <InfoPill label="Started" value={dateLabel(item.firstDate, "short")} />
        </div>

        {item.billName || item.tags.length > 0 || item.notes ? (
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {item.billName ? <p>Linked bill: <span className="text-foreground">{item.billName}</span></p> : null}
            {item.tags.length > 0 ? (
              <p className="flex items-center gap-1">
                <Tags className="h-3 w-3" />
                {item.tags.join(", ")}
              </p>
            ) : null}
            {item.notes ? <p className="line-clamp-2">{item.notes}</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function InfoPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate font-medium text-foreground">{value}</div>
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

function BillCard({ bill, automated }: { bill: Bill; automated: boolean }) {
  const attrs = bill.attributes;
  const recentPayments = [...(attrs.pay_dates ?? []), ...(attrs.paid_dates ?? [])];
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge active={attrs.active ?? false} />
              {automated ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
                  <Repeat2 className="h-3 w-3" />
                  Automated
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  <ReceiptText className="h-3 w-3" />
                  Bill tracking
                </span>
              )}
            </div>
            <h3 className="truncate text-base font-semibold text-foreground">{attrs.name}</h3>
            <p className="text-xs text-muted-foreground">{compactFrequency(attrs.repeat_freq)}</p>
          </div>
          <div className="shrink-0 text-right text-sm">
            <BillAmount bill={bill} />
          </div>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <InfoPill label="Next expected" value={dateLabel(attrs.next_expected_match ?? attrs.date)} />
          <InfoPill label="Bill date" value={dateLabel(attrs.date, "short")} />
          <InfoPill label="Recent matches" value={`${recentPayments.length}`} />
        </div>

        {attrs.notes ? (
          <p className="border-t pt-3 text-xs text-muted-foreground line-clamp-2">{attrs.notes}</p>
        ) : null}
      </div>
    </Card>
  );
}

export default async function RecurringPage() {
  const result = await getRecurringPageData();

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recurring" />
        <ErrorCard title="Could not load recurring expenses" message={result.error} />
      </div>
    );
  }

  const { data } = result;
  const scheduled = [...data.scheduled].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const aTime = a.nextDate ? Date.parse(a.nextDate) : Number.MAX_SAFE_INTEGER;
    const bTime = b.nextDate ? Date.parse(b.nextDate) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || a.description.localeCompare(b.description);
  });
  const bills = [...data.bills].sort((a, b) => {
    if ((a.attributes.active ?? false) !== (b.attributes.active ?? false)) {
      return a.attributes.active ? -1 : 1;
    }
    const aTime = Date.parse(a.attributes.next_expected_match ?? a.attributes.date ?? "");
    const bTime = Date.parse(b.attributes.next_expected_match ?? b.attributes.date ?? "");
    return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) -
      (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER) ||
      a.attributes.name.localeCompare(b.attributes.name);
  });
  const automatedBillKeys = new Set(
    data.scheduled.flatMap((item) => [item.billId, item.billName]).filter(Boolean)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring expenses"
        subtitle="Bills, subscriptions, and predictable charges from Firefly III."
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          title="Scheduled expenses"
          value={<Money amount={data.totals.withdrawalAmount} currency={data.totals.currency} expense />}
          subtitle={`${data.totals.activeScheduledWithdrawals} active withdrawals`}
          icon={WalletCards}
        />
        <SummaryCard
          title="Reserve transfers"
          value={<Money amount={data.totals.transferAmount} currency={data.totals.currency} />}
          subtitle={`${data.totals.activeScheduledTransfers} active transfers`}
          icon={ArrowRightLeft}
        />
        <SummaryCard
          title="Active bills"
          value={data.totals.activeBills}
          subtitle={`${formatMoney(data.totals.billAmountMin, data.totals.currency)}–${formatMoney(data.totals.billAmountMax, data.totals.currency)} expected`}
          icon={ReceiptText}
        />
        <SummaryCard
          title="Automations"
          value={data.totals.activeRecurrences}
          subtitle={`${data.totals.activeScheduledTransactions} scheduled transaction lines`}
          icon={Repeat2}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Scheduled automations</h2>
            <p className="text-xs text-muted-foreground">Actual Firefly recurrences that create expenses or reserve transfers.</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Next runs first
          </div>
        </div>

        {scheduled.length === 0 ? (
          <Empty title="No scheduled recurrences" description="No Firefly recurrences were returned for this account." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {scheduled.map((item) => <ScheduledCard key={item.id} item={item} />)}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Bills & subscriptions</h2>
          <p className="text-xs text-muted-foreground">Firefly bills used to track expected recurring charges and match real transactions.</p>
        </div>

        {bills.length === 0 ? (
          <Empty title="No bills configured" description="No Firefly bills were returned for this account." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {bills.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                automated={automatedBillKeys.has(bill.id) || automatedBillKeys.has(bill.attributes.name)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
