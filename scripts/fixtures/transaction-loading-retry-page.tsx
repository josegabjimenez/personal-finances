"use client";

// Copied into a temporary app by test:transaction-loading-retry; never a shipped route.
import { useState } from "react";
import { InfiniteTransactionList } from "@/components/transactions/infinite-transaction-list";
import type { TransactionGroup } from "@/lib/firefly/types";

const groups = ["OLD", "NEW"].map((source): TransactionGroup[] => [{
  type: "transactions", id: `retry-demo-${source}`,
  attributes: { transactions: [{
    type: "withdrawal", amount: "10.00", currency_code: "COP",
    description: `RETRY_KEEP_${source}`, date: "2026-01-10T12:00:00Z",
    source_name: "Synthetic account", destination_name: "Synthetic shop",
    category_name: "Synthetic category", tags: ["synthetic-tag"],
  }] },
}]);

export default function RetryFixturePage() {
  const [source, setSource] = useState(0);
  const [url, setUrl] = useState("old");
  const [mounted, setMounted] = useState(true);
  const [totalPages, setTotalPages] = useState(3);
  return (
    <div>
      <button onClick={() => setSource(1)}>Replace initial groups</button>
      <button onClick={() => { setSource(1); setUrl("new"); }}>Change fetch URL</button>
      <button onClick={() => setMounted(false)}>Unmount list</button>
      <button onClick={() => setTotalPages(1)}>Single page</button>
      <section id="retry-list">
        {mounted ? <InfiniteTransactionList
          initialGroups={groups[source]} totalPages={totalPages}
          fetchUrl={`/__retry-fixture/${url}?type=withdrawal`}
          searchQuery="RETRY_KEEP" accountFilter="Synthetic account"
          categoryFilter="Synthetic category" tagFilter="synthetic-tag"
          typeFilter="withdrawal"
        /> : null}
      </section>
    </div>
  );
}
