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
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deudas y crédito" };

const STATUS_LABELS: Record<CreditCardDebtMetrics["status"], string> = {
  covered: "Cubierta",
  under_reserved: "Falta reserva",
  over_reserved: "Excedente",
  no_debt: "Sin deuda",
};

const STATUS_STYLES: Record<CreditCardDebtMetrics["status"], string> = {
  covered: "bg-success/10 text-success border-success/20",
  under_reserved: "bg-warning/10 text-warning border-warning/20",
  over_reserved: "bg-transfer/10 text-transfer border-transfer/20",
  no_debt: "bg-muted text-muted-foreground border-border",
};

const TX_KIND_LABELS: Record<DebtRecentTransaction["kind"], string> = {
  purchase: "Compra",
  reservation: "Reserva",
  payment: "Pago",
  interest_fee: "Interés/comisión",
};

function StatCard({
  title,
  amount,
  currency,
  icon: Icon,
  subtitle,
  tone,
}: {
  title: string;
  amount: number;
  currency: string;
  icon: ComponentType<{ className?: string }>;
  subtitle?: string;
  tone?: "danger" | "success" | "warning";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <Money amount={amount} currency={currency} className="text-xl" />
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div
          className={cn(
            "rounded-full bg-muted p-2 text-muted-foreground",
            tone === "danger" && "bg-danger/10 text-danger",
            tone === "success" && "bg-success/10 text-success",
            tone === "warning" && "bg-warning/10 text-warning"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function BreakdownList({
  title,
  items,
  currency,
}: {
  title: string;
  items: DebtBreakdownItem[];
  currency: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">Sin gasto real este mes.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.count} mov.</p>
              </div>
              <Money amount={item.amount} currency={currency} expense className="text-sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentTransactions({ transactions }: { transactions: DebtRecentTransaction[] }) {
  if (transactions.length === 0) {
    return <Empty title="Sin actividad de tarjeta este mes" description="Las compras, reservas y pagos aparecerán aquí cuando Firefly III los tenga registrados." />;
  }
  return (
    <Card className="divide-y overflow-hidden p-0">
      {transactions.map((tx) => (
        <Link key={tx.id} href="/transactions" className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{TX_KIND_LABELS[tx.kind]}</span>
              <span className="text-xs text-muted-foreground">{formatDateShort(tx.date)}</span>
            </div>
            <p className="mt-1 truncate text-sm font-medium">{tx.description}</p>
            <p className="truncate text-xs text-muted-foreground">{tx.categoryName ?? tx.budgetName ?? tx.destinationName ?? tx.sourceName ?? "Sin detalle"}</p>
          </div>
          <Money amount={tx.amount} currency={tx.currency} expense={tx.kind === "purchase" || tx.kind === "interest_fee"} className="text-sm" />
        </Link>
      ))}
    </Card>
  );
}

function CardMetrics({ card }: { card: CreditCardDebtMetrics }) {
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
            <p className="mt-1 text-xs text-muted-foreground">Reserva: {card.reserveName}</p>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", STATUS_STYLES[card.status])}>{STATUS_LABELS[card.status]}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {(!card.found || !card.reserveFound) ? (
          <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
            {!card.found ? `No se encontró la cuenta ${card.name}. ` : null}
            {!card.reserveFound ? `No se encontró la reserva ${card.reserveName}.` : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Deuda actual</p>
            <Money amount={card.debt} currency={card.currency} className="text-lg" />
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Reservado</p>
            <Money amount={card.reserved} currency={card.currency} className="text-lg" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cobertura</span>
            <span className="font-medium">{card.coverage === null ? "Sin deuda" : formatPercent(card.coverage, 0)}</span>
          </div>
          <Progress value={coveragePct} indicatorClassName={card.status === "under_reserved" ? "bg-warning" : card.status === "covered" ? "bg-success" : "bg-foreground"} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{card.gap < 0 ? "Excedente" : "Faltante"}</span>
            <Money amount={Math.abs(card.gap)} currency={card.currency} className={cn("text-xs", card.gap > 0 && "text-warning", card.gap < 0 && "text-success")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <MiniMetric label="Compras" value={card.monthlyPurchases} currency={card.currency} />
          <MiniMetric label="Reservas" value={card.monthlyReservations} currency={card.currency} />
          <MiniMetric label="Pagos" value={card.monthlyPayments} currency={card.currency} />
          <MiniMetric label="Intereses" value={card.monthlyInterestFees} currency={card.currency} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownList title="Gasto por categoría" items={card.byCategory} currency={card.currency} />
          <BreakdownList title="Gasto por budget" items={card.byBudget} currency={card.currency} />
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actividad reciente</h4>
          <RecentTransactions transactions={card.recentTransactions} />
        </div>
      </CardContent>
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

function OtherLiabilities({ items }: { items: OtherLiabilityDebt[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Otras deudas</h2>
        <Link href="/accounts" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
          Cuentas <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {items.length === 0 ? (
        <Empty title="No hay otras liabilities" description="Además de TC1/TC2 no se encontraron préstamos u otras deudas activas con balance." />
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {items.map((item) => (
            <Link key={item.id} href={`/accounts/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.liabilityType ? <p className="truncate text-xs text-muted-foreground">{item.liabilityType}</p> : null}
              </div>
              <Money amount={item.debt} currency={item.currency} className="text-sm" />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      )}
    </section>
  );
}

type DebtsPageData =
  | { ok: true; data: DebtDashboardResponse }
  | { ok: false; error: string | undefined };

async function getDebtsPageData(): Promise<DebtsPageData> {
  try {
    return { ok: true, data: await getDebtDashboard() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : undefined };
  }
}

export default async function DebtsPage() {
  const result = await getDebtsPageData();

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Deudas/Crédito" />
        <ErrorCard title="No se pudo cargar deudas/crédito" message={result.error} />
      </div>
    );
  }

  const data = result.data;
  const period = `${data.monthStart} → ${data.monthEnd}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Deudas/Crédito" subtitle={`Control de tarjetas y liabilities. Mes: ${period}`} />

      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard title="Deuda total" amount={data.totals.totalDebt} currency={data.currency} icon={Landmark} tone="danger" subtitle="Tarjetas + otras liabilities" />
        <StatCard title="Reservado para TC" amount={data.totals.totalReserved} currency={data.currency} icon={ShieldCheck} tone="success" subtitle="Savings for TC1/TC 2" />
        <StatCard title="Faltante total" amount={data.totals.totalGap} currency={data.currency} icon={AlertCircle} tone={data.totals.totalGap > 0 ? "warning" : "success"} subtitle="Deuda menos reservas" />
        <StatCard title="Compras del mes" amount={data.totals.monthlyPurchases} currency={data.currency} icon={WalletCards} subtitle="Gasto real en TC" />
      </section>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-danger" /><span>Intereses: {formatMoney(data.totals.monthlyInterestFees, data.currency)}</span></div>
          <div className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4 text-success" /><span>Pagos: {formatMoney(data.totals.monthlyPayments, data.currency)}</span></div>
          <div className="flex items-center gap-2"><PiggyBank className="h-4 w-4 text-success" /><span>Reservas: {formatMoney(data.totals.monthlyReservations, data.currency)}</span></div>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><span>Corte: {formatDateShort(data.asOf)}</span></div>
        </div>
      </Card>

      {data.missingAccounts.length > 0 ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex gap-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Firefly III no devolvió estas cuentas configuradas: {data.missingAccounts.join(", ")}. La vista sigue funcionando con valores en cero para esas métricas.</p>
          </div>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Tarjetas de crédito</h2>
        {data.cards.map((card) => <CardMetrics key={card.key} card={card} />)}
      </section>

      <OtherLiabilities items={data.otherLiabilities} />
    </div>
  );
}
