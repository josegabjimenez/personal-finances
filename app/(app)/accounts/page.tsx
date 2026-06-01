import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listAccounts } from "@/lib/firefly/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/common/money";
import { Empty } from "@/components/common/empty";
import { ErrorCard } from "@/components/common/error-card";
import type { Account } from "@/lib/firefly/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts" };

type AccountsPageData =
  | { ok: true; assets: Account[]; liabilities: Account[] }
  | { ok: false; error: string | undefined };

async function getAccountsPageData(): Promise<AccountsPageData> {
  try {
    const [assets, liabilities] = await Promise.all([
      listAccounts("asset"),
      listAccounts("liability"),
    ]);
    return { ok: true, assets, liabilities };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : undefined };
  }
}

function AccountSection({
  title,
  accounts,
}: {
  title: string;
  accounts: Account[];
}) {
  if (accounts.length === 0) return null;

  const totals = new Map<string, number>();
  for (const a of accounts) {
    const bal = parseFloat(a.attributes.current_balance ?? "0");
    if (!Number.isFinite(bal)) continue;
    const currency = a.attributes.currency_code ?? "USD";
    totals.set(currency, (totals.get(currency) ?? 0) + bal);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <div className="flex flex-col items-end gap-0.5">
          {[...totals.entries()].map(([currency, total]) => (
            <Money
              key={currency}
              amount={total}
              currency={currency}
              className="text-xs text-muted-foreground"
            />
          ))}
        </div>
      </div>
      <Card className="divide-y overflow-hidden p-0">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/accounts/${a.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {a.attributes.name}
              </p>
              {a.attributes.account_role || a.attributes.liability_type ? (
                <p className="truncate text-xs text-muted-foreground">
                  {a.attributes.account_role ?? a.attributes.liability_type}
                </p>
              ) : null}
            </div>
            <Money
              amount={a.attributes.current_balance}
              currency={a.attributes.currency_code ?? "USD"}
              colorize
              className="text-sm"
            />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </section>
  );
}

export default async function AccountsPage() {
  const data = await getAccountsPageData();

  if (!data.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Accounts" />
        <ErrorCard message={data.error} />
      </div>
    );
  }

  const isEmpty = data.assets.length === 0 && data.liabilities.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts" />
      {isEmpty ? (
        <Empty title="No accounts yet" />
      ) : (
        <>
          <AccountSection title="Assets" accounts={data.assets} />
          <AccountSection title="Liabilities" accounts={data.liabilities} />
        </>
      )}
    </div>
  );
}
