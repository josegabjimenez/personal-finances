import Link from "next/link";
import { ArrowLeft, CreditCard, Filter, X } from "lucide-react";
import { CREDIT_CARDS, getDebtDashboard, type CreditCardDebtMetrics, type DebtRecentTransaction } from "@/lib/firefly/debts";
import { formatDateShort } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credit card transactions" };

type Params = { card: string };
type SearchParams = { start?: string; end?: string; month?: string; type?: string; category?: string; budget?: string };

const TX_KIND_LABELS: Record<DebtRecentTransaction["kind"], string> = {
  purchase: "Purchase",
  reservation: "Reservation",
  payment: "Payment",
  interest_fee: "Interest & fees",
};

function cardHref(cardKey: string, sp: SearchParams, overrides?: Partial<SearchParams>) {
  const params = new URLSearchParams();
  const merged = { ...sp, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `/debts/${cardKey}${query ? `?${query}` : ""}`;
}

function clearFilterHref(cardKey: string, sp: SearchParams, key: keyof SearchParams) {
  return cardHref(cardKey, { ...sp, [key]: undefined });
}

function matchesFilter(tx: DebtRecentTransaction, sp: SearchParams) {
  if (sp.type && tx.kind !== sp.type) return false;
  if (sp.category && (tx.categoryName ?? "Unassigned") !== sp.category) return false;
  if (sp.budget && (tx.budgetName ?? "Unassigned") !== sp.budget) return false;
  return true;
}

function summarize(transactions: DebtRecentTransaction[]) {
  return transactions.reduce(
    (acc, tx) => {
      acc[tx.kind] += tx.amount;
      return acc;
    },
    { purchase: 0, reservation: 0, payment: 0, interest_fee: 0 } satisfies Record<DebtRecentTransaction["kind"], number>
  );
}

function uniqueBreakdown(transactions: DebtRecentTransaction[], field: "categoryName" | "budgetName") {
  const map = new Map<string, { name: string; count: number; amount: number }>();
  for (const tx of transactions.filter((item) => item.kind === "purchase" || item.kind === "interest_fee")) {
    const name = tx[field] ?? "Unassigned";
    const current = map.get(name) ?? { name, count: 0, amount: 0 };
    current.count += 1;
    current.amount += tx.amount;
    map.set(name, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function FilterPill({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return <Link href={href} className={`rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent ${active ? "bg-foreground text-background hover:bg-foreground/90" : ""}`}>{label}</Link>;
}

function ActiveFilter({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
      {label}<X className="h-3 w-3" />
    </Link>
  );
}

function SummaryCard({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Money amount={amount} currency={currency} className="text-lg" />
    </Card>
  );
}

function TransactionRow({ tx }: { tx: DebtRecentTransaction }) {
  const isExpense = tx.kind === "purchase" || tx.kind === "interest_fee";
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{TX_KIND_LABELS[tx.kind]}</span>
          <span className="text-xs text-muted-foreground">{formatDateShort(tx.date)}</span>
          <span className="text-xs text-muted-foreground">{tx.cardName}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium">{tx.description}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {tx.sourceName ?? "Unknown source"} → {tx.destinationName ?? "Unknown destination"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">Category: {tx.categoryName ?? "Unassigned"}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">Budget: {tx.budgetName ?? "Unassigned"}</span>
          {tx.tags?.map((tag) => <span key={tag} className="rounded bg-muted px-1.5 py-0.5">#{tag}</span>)}
        </div>
      </div>
      <Money amount={tx.amount} currency={tx.currency} expense={isExpense} className="text-sm sm:text-right" />
    </div>
  );
}

function BreakdownLinks({ card, sp, field, title }: { card: CreditCardDebtMetrics; sp: SearchParams; field: "category" | "budget"; title: string }) {
  const items = uniqueBreakdown(card.transactions, field === "category" ? "categoryName" : "budgetName");
  if (items.length === 0) return null;
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.name} href={cardHref(card.key, sp, { [field]: item.name })} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 hover:bg-accent/60">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.count} transaction{item.count === 1 ? "" : "s"}</p></div>
            <Money amount={item.amount} currency={card.currency} expense className="text-sm" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default async function CreditCardTransactionsPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> }) {
  const [{ card: cardParam }, sp] = await Promise.all([params, searchParams]);
  const selectedConfig = CREDIT_CARDS.find((card) => card.key === cardParam);

  if (!selectedConfig) {
    return (
      <div className="space-y-6">
        <PageHeader title="Credit card transactions" />
        <ErrorCard title="Unknown credit card" message={`Supported cards: ${CREDIT_CARDS.map((card) => card.key).join(", ")}.`} />
      </div>
    );
  }

  try {
    const data = await getDebtDashboard(sp);
    const card = data.cards.find((item) => item.key === selectedConfig.key);
    if (!card) throw new Error("Card configuration was not returned by the dashboard helper.");
    const filtered = card.transactions.filter((tx) => matchesFilter(tx, sp));
    const totals = summarize(filtered);
    const period = `${data.monthStart} → ${data.monthEnd}`;

    return (
      <div className="space-y-6">
        <PageHeader title={`${card.label} transactions`} subtitle={`Credit card activity for ${period}. Inspect purchases, categories, budgets, payments, reservations, and fees.`} />

        <div className="flex flex-wrap gap-2">
          <Link href={`/debts?start=${data.monthStart}&end=${data.monthEnd}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent"><ArrowLeft className="h-3.5 w-3.5" />Back to Debts & Credit</Link>
          {CREDIT_CARDS.map((item) => <FilterPill key={item.key} href={cardHref(item.key, sp)} label={item.label} active={item.key === card.key} />)}
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected period</p>
              <p className="text-sm font-medium">{period}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterPill href={cardHref(card.key, sp, { type: undefined })} label="All types" active={!sp.type} />
              {Object.entries(TX_KIND_LABELS).map(([key, label]) => <FilterPill key={key} href={cardHref(card.key, sp, { type: key })} label={label} active={sp.type === key} />)}
            </div>
          </div>
          {(sp.type || sp.category || sp.budget) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Active filters:
              {sp.type ? <ActiveFilter label={`Type: ${TX_KIND_LABELS[sp.type as DebtRecentTransaction["kind"]] ?? sp.type}`} href={clearFilterHref(card.key, sp, "type")} /> : null}
              {sp.category ? <ActiveFilter label={`Category: ${sp.category}`} href={clearFilterHref(card.key, sp, "category")} /> : null}
              {sp.budget ? <ActiveFilter label={`Budget: ${sp.budget}`} href={clearFilterHref(card.key, sp, "budget")} /> : null}
            </div>
          ) : null}
        </Card>

        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Purchases" amount={totals.purchase} currency={card.currency} />
          <SummaryCard label="Payments" amount={totals.payment} currency={card.currency} />
          <SummaryCard label="Reservations" amount={totals.reservation} currency={card.currency} />
          <SummaryCard label="Interest & fees" amount={totals.interest_fee} currency={card.currency} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <BreakdownLinks card={card} sp={sp} field="category" title="Spending by category" />
          <BreakdownLinks card={card} sp={sp} field="budget" title="Spending by budget" />
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CreditCard className="h-4 w-4" />Transactions</h2>
          {filtered.length === 0 ? (
            <Empty title="No transactions match these filters" description="Clear filters or select another period from the Debts & Credit dashboard." />
          ) : (
            <Card className="divide-y overflow-hidden p-0">
              {filtered.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
            </Card>
          )}
        </section>
      </div>
    );
  } catch (err) {
    return (
      <div className="space-y-6">
        <PageHeader title="Credit card transactions" />
        <ErrorCard title="Could not load credit card transactions" message={err instanceof Error ? err.message : undefined} />
      </div>
    );
  }
}
