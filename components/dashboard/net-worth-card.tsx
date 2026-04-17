import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/common/money";

export function NetWorthCard({
  value,
  currency,
  subtitle,
}: {
  value: number | null;
  currency: string;
  subtitle?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-1">
        <CardTitle>Net worth</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-1">
        <Money
          amount={value ?? 0}
          currency={currency}
          colorize={value !== null && value !== 0}
          className="text-2xl tracking-tight md:text-4xl"
        />
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
