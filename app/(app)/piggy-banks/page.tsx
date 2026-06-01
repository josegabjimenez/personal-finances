import { listPiggyBanks } from "@/lib/firefly/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";
import { formatDateLong } from "@/lib/format";
import type { PiggyBank } from "@/lib/firefly/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Piggy banks" };

type PiggyBanksPageData =
  | { ok: true; banks: PiggyBank[] }
  | { ok: false; error: string | undefined };

async function getPiggyBanksPageData(): Promise<PiggyBanksPageData> {
  try {
    const banks = await listPiggyBanks();
    return { ok: true, banks };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : undefined };
  }
}

export default async function PiggyBanksPage() {
  const data = await getPiggyBanksPageData();

  if (!data.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Piggy banks" />
        <ErrorCard message={data.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Piggy banks" subtitle="Progress toward your goals." />
      {data.banks.length === 0 ? (
        <Empty
          title="No piggy banks yet"
          description="Create savings goals in Firefly III to track them here."
        />
      ) : (
        <div className="space-y-3">
          {data.banks.map((p) => {
            const current = parseFloat(p.attributes.current_amount ?? "0") || 0;
            const target = parseFloat(p.attributes.target_amount ?? "0") || 0;
            const pct =
              typeof p.attributes.percentage === "number"
                ? p.attributes.percentage
                : target > 0
                  ? (current / target) * 100
                  : 0;
            const currency = p.attributes.currency_code ?? "USD";
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-foreground">
                      {p.attributes.name}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(pct)}%
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress
                    value={Math.min(100, pct)}
                    indicatorClassName="bg-success"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      <Money amount={current} currency={currency} /> saved
                    </span>
                    <span>
                      of <Money amount={target} currency={currency} />
                    </span>
                  </div>
                  {p.attributes.target_date ? (
                    <p className="text-[11px] text-muted-foreground">
                      Target by {formatDateLong(p.attributes.target_date)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
