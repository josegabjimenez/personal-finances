import { Money } from "@/components/common/money";
import {
  summarizeTransactionEntries,
  type TransactionEntry,
} from "@/lib/firefly/transaction-entries";

interface Props {
  entries: TransactionEntry[];
  typeFilter?: string;
  isPartial?: boolean;
  defaultCurrency?: string;
}

export function TransactionSummary({
  entries,
  typeFilter,
  isPartial = false,
  defaultCurrency = "COP",
}: Props) {
  const summary = summarizeTransactionEntries(entries, defaultCurrency);
  const transfersOnly = typeFilter === "transfer" ||
    (entries.length > 0 && entries.every(({ split }) => split.type === "transfer"));
  const label = typeFilter === "deposit"
    ? "Income total"
    : typeFilter === "withdrawal"
      ? "Expense total"
      : "Net total";

  return (
    <div data-testid="transaction-summary" className="space-y-2 px-1 text-xs text-muted-foreground">
      <div>
        <p>{summary.count} transaction {summary.count === 1 ? "entry" : "entries"}</p>
        <p>{isPartial ? "Loaded matches only · More transactions to load" : "All matching transactions in this view"}</p>
        <p>Each displayed split counts once.</p>
      </div>
      {transfersOnly ? (
        <p>Transfers do not contribute to net totals.</p>
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium text-foreground">{label}</span>
            {summary.totals.length === 0 ? (
              <span>No income or expenses loaded.</span>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {summary.totals.map(({ currency, total }) => (
                  <Money
                    key={currency}
                    amount={total}
                    currency={currency}
                    colorize
                    className="text-sm font-medium"
                  />
                ))}
              </div>
            )}
          </div>
          <p>{typeFilter === "deposit"
            ? "Income only."
            : typeFilter === "withdrawal"
              ? "Expenses shown as negative amounts."
              : "Income minus expenses. Transfers excluded."}</p>
          {summary.totals.length > 1 && <p>Currencies shown separately. No conversion applied.</p>}
        </div>
      )}
    </div>
  );
}
