import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/common/money";

interface Tile {
  label: string;
  amount: number | null;
  currency: string;
  tone: "income" | "expense";
}

export function MonthTiles({
  earned,
  spent,
  currency,
}: {
  earned: { value: number; currency: string } | null;
  spent: { value: number; currency: string } | null;
  currency: string;
}) {
  const tiles: Tile[] = [
    {
      label: "Income this month",
      amount: earned?.value ?? 0,
      currency: earned?.currency ?? currency,
      tone: "income",
    },
    {
      label: "Spent this month",
      amount: spent?.value ?? 0,
      currency: spent?.currency ?? currency,
      tone: "expense",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-1.5">
              {t.tone === "income" ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-success" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-danger" />
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
