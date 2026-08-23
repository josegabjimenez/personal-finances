import Link from "next/link";
import { ArrowLeft, Repeat2 } from "lucide-react";
import { fireflyFetch } from "@/lib/firefly/client";
import { getRecurringIndex } from "@/lib/firefly/recurring";
import { transactionSchema } from "@/lib/firefly/types";
import { selectTransactionEntry } from "@/lib/firefly/transaction-entries";
import { getRecurringTransactionMeta } from "@/lib/firefly/recurring-flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { formatDateTime } from "@/lib/format";
import { z } from "zod";
import { ErrorCard } from "@/components/common/error-card";

const envelope = z.object({ data: transactionSchema });

interface SearchParams {
  journal?: string | string[];
  split?: string | string[];
  index?: string | string[];
}

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  try {
    const [raw, recurringIndex] = await Promise.all([
      fireflyFetch(`/transactions/${id}`, { revalidate: 60 }),
      getRecurringIndex().catch(() => ({ bills: [], templates: [] })),
    ]);
    const { data } = envelope.parse(raw);
    const entry = selectTransactionEntry(data, {
      journalId: firstValue(sp.journal),
      splitIndex: parseSplitIndex(firstValue(sp.split) ?? firstValue(sp.index)),
    });
    if (!entry) throw new Error("Transaction has no splits");
    const { split, splitIndex } = entry;
    const splitCount = data.attributes.transactions.length;
    const recurring = getRecurringTransactionMeta(split, recurringIndex);

    const rows: [string, React.ReactNode][] = [
      ["Type", capitalize(split.type)],
      [
        "Amount",
        <Money
          key="amt"
          amount={parseFloat(split.amount)}
          currency={split.currency_code ?? "USD"}
        />,
      ],
      ["Date", formatDateTime(split.date)],
      ["From", split.source_name ?? "—"],
      ["To", split.destination_name ?? "—"],
      ["Category", split.category_name ?? "—"],
      ["Budget", split.budget_name ?? "—"],
      [
        "Recurring",
        recurring.isRecurring ? (
          <span key="recurring" className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <Repeat2 className="h-3 w-3" />
            {recurring.label ?? "Recurring transaction"}
          </span>
        ) : (
          "No"
        ),
      ],
      ...(recurring.isRecurring && recurring.detail
        ? [["Recurring source", recurring.detail] as [string, React.ReactNode]]
        : []),
      ...(recurring.isRecurring && (recurring.count || recurring.total)
        ? [["Recurring run", `${recurring.count ?? "—"}${recurring.total ? ` of ${recurring.total}` : ""}`] as [string, React.ReactNode]]
        : []),
      ...(split.tags && split.tags.length > 0
        ? [["Tags", split.tags.join(", ")] as [string, React.ReactNode]]
        : []),
      ["Notes", split.notes ?? "—"],
    ];

    return (
      <div className="space-y-4">
        <Link
          href="/transactions"
          data-haptic="medium"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 -ml-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground active:bg-accent active:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground text-base">
              {split.description || "(no description)"}
            </CardTitle>
            {splitCount > 1 ? (
              <p className="text-xs text-muted-foreground">
                Split {splitIndex + 1} of {splitCount} in this grouped transaction
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-3 gap-3 py-2 text-sm"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="col-span-2">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return (
      <div className="space-y-4">
        <Link
          href="/transactions"
          data-haptic="medium"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 -ml-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground active:bg-accent active:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <ErrorCard message={message} />
      </div>
    );
  }
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseSplitIndex(value?: string) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}
