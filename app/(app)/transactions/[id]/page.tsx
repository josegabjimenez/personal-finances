import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fireflyFetch } from "@/lib/firefly/client";
import { transactionSchema } from "@/lib/firefly/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { formatDateTime } from "@/lib/format";
import { z } from "zod";
import { ErrorCard } from "@/components/common/error-card";

const envelope = z.object({ data: transactionSchema });

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const raw = await fireflyFetch(`/transactions/${id}`, { revalidate: 60 });
    const { data } = envelope.parse(raw);
    const split = data.attributes.transactions[0];
    if (!split) throw new Error("Transaction has no splits");

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
      ...(split.tags && split.tags.length > 0
        ? [["Tags", split.tags.join(", ")] as [string, React.ReactNode]]
        : []),
      ["Notes", split.notes ?? "—"],
    ];

    return (
      <div className="space-y-4">
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground text-base">
              {split.description || "(no description)"}
            </CardTitle>
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
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
