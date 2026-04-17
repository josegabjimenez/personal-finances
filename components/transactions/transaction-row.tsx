"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight } from "lucide-react";
import type { TransactionGroup } from "@/lib/firefly/types";
import { Money } from "@/components/common/money";
import { formatDateShort } from "@/lib/format";
import { haptic } from "@/lib/haptic";

function iconFor(type: string) {
  switch (type) {
    case "deposit":
      return <ArrowDownLeft className="h-4 w-4 text-success" />;
    case "withdrawal":
      return <ArrowUpRight className="h-4 w-4 text-danger" />;
    case "transfer":
      return <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />;
    default:
      return <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />;
  }
}

function signedAmount(type: string, amount: string) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return 0;
  if (type === "withdrawal") return -Math.abs(n);
  if (type === "deposit") return Math.abs(n);
  return n; // transfer
}

export function TransactionRow({ group }: { group: TransactionGroup }) {
  const split = group.attributes.transactions[0];
  if (!split) return null;
  const amount = signedAmount(split.type, split.amount);

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

  return (
    <Link
      href={`/transactions/${group.id}`}
      onClick={() => haptic()}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
        {iconFor(split.type)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {counter ?? "—"}
          {split.category_name ? ` · ${split.category_name}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <Money
          amount={amount}
          currency={split.currency_code ?? "USD"}
          colorize
          className="text-sm"
        />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatDateShort(split.date)}
        </span>
      </div>
    </Link>
  );
}
