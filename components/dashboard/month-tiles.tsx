import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/common/money";

interface Tile {
  label: string;
  amount: number | null;
  currency: string;
  tone: "income" | "expense";
  type: "deposit" | "withdrawal";
}

export function MonthTiles({
  earned,
  spent,
  currency,
  start,
  end,
}: {
  earned: { value: number; currency: string } | null;
  spent: { value: number; currency: string } | null;
  currency: string;
  start: string;
  end: string;
}) {
  const tiles: Tile[] = [
    {
      label: "Income this month",
      amount: earned?.value ?? 0,
      currency: earned?.currency ?? currency,
      tone: "income",
      type: "deposit",
    },
    {
      label: "Spent this month",
      amount: spent?.value ?? 0,
      currency: spent?.currency ?? currency,
      tone: "expense",
      type: "withdrawal",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={{ pathname: "/transactions", query: { start, end, type: t.type } }}
          className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Card className="h-full transition-colors group-hover:border-primary/50">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5">
                {t.tone === "income" ? (
                  <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                ) : (
                  <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5 text-danger" />
                )}
                {t.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Money
                amount={t.amount ?? 0}
                currency={t.currency}
                className="text-sm leading-tight md:text-xl"
              />
              <span className="mt-2 flex items-center gap-0.5 text-xs text-muted-foreground group-hover:text-foreground">
                View transactions <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
