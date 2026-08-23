"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Repeat2 } from "lucide-react";
import type { TransactionEntry } from "@/lib/firefly/transaction-entries";
import {
  signedTransactionAmount,
  transactionEntryHref,
} from "@/lib/firefly/transaction-entries";
import {
  getRecurringTransactionMeta,
  type RecurringIndex,
} from "@/lib/firefly/recurring-flags";
import { Money } from "@/components/common/money";
import { formatDateShort } from "@/lib/format";

function iconFor(type: string) {
  switch (type) {
    case "deposit":
      return <ArrowDownLeft className="h-4 w-4 text-success" />;
    case "withdrawal":
      return <ArrowUpRight className="h-4 w-4 text-danger" />;
    case "transfer":
      return <ArrowRightLeft className="h-4 w-4 text-transfer" />;
    default:
      return <ArrowRightLeft className="h-4 w-4 text-transfer" />;
  }
}

export function TransactionRow({
  entry,
  recurringIndex,
}: {
  entry: TransactionEntry;
  recurringIndex?: RecurringIndex | null;
}) {
  const { group, split } = entry;
  const amount = signedTransactionAmount(split);

  const title =
    split.description ||
    group.attributes.group_title ||
    (split.type === "withdrawal"
      ? split.destination_name
      : split.source_name) ||
    "(no description)";

  const counter =
    split.type === "withdrawal"
      ? split.destination_name
      : split.type === "deposit"
        ? split.source_name
        : `${split.source_name} → ${split.destination_name}`;
  const recurring = getRecurringTransactionMeta(split, recurringIndex);
  const recurringLabel = recurring.kind === "reserve" ? "Reserve" : "Recurring";

  return (
    <Link
      href={transactionEntryHref(entry)}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
        {iconFor(split.type)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
          {recurring.isRecurring ? (
            <span
              title={recurring.label ?? "Recurring transaction"}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              <Repeat2 className="h-3 w-3" />
              {recurringLabel}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {counter ?? "—"}
          {split.category_name ? ` · ${split.category_name}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <Money
          amount={amount}
          currency={split.currency_code ?? "USD"}
          colorize={split.type !== "transfer"}
          className={split.type === "transfer" ? "text-sm text-transfer" : "text-sm"}
        />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatDateShort(split.date)}
        </span>
      </div>
    </Link>
  );
}
