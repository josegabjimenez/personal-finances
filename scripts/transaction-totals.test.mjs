import assert from "node:assert/strict";
import { test } from "node:test";
import {
  summarizeTransactionEntries,
  transactionGroupsToEntries,
} from "../lib/firefly/transaction-entries.ts";

// Synthetic fixtures only: no environment, credentials, or upstream reads.
function split(id, type, amount, currency = "COP", extra = {}) {
  return {
    transaction_journal_id: `synthetic-journal-${id}`,
    type, amount, currency_code: currency,
    date: "2026-01-10T12:00:00Z", description: `Synthetic ${id}`,
    source_name: "Synthetic account", destination_name: "Synthetic merchant",
    category_name: "Synthetic category", tags: ["synthetic-tag"],
    ...extra,
  };
}

function group(id, transactions) {
  return { type: "transactions", id: `synthetic-group-${id}`, attributes: { transactions } };
}

const mixedGroup = group("mixed", [
  split("cop-income", "deposit", "100"),
  split("cop-expense", "withdrawal", "40"),
  split("cop-transfer", "transfer", "5000"),
  split("usd-income", "deposit", "-25", "USD"),
  split("usd-expense", "withdrawal", "-5", "USD"),
]);

test("signed net totals keep currencies separate and exclude transfers", () => {
  const entries = transactionGroupsToEntries([mixedGroup]);
  const summary = summarizeTransactionEntries(entries);
  assert.equal(summary.count, 5, "each displayed split is counted, including transfers");
  assert.deepEqual(summary.totals, [
    { currency: "COP", total: 60 },
    { currency: "USD", total: 20 },
  ]);
  assert.deepEqual(summarizeTransactionEntries(transactionGroupsToEntries([mixedGroup], {
    type: "transfer",
  })).totals, [], "transfers have no income/expense total");
});

test("type filters retain existing income and expense signs", () => {
  const income = summarizeTransactionEntries(transactionGroupsToEntries([mixedGroup], { type: "deposit" }));
  assert.equal(income.count, 2);
  assert.deepEqual(income.totals, [{ currency: "COP", total: 100 }, { currency: "USD", total: 25 }]);
  const expenses = summarizeTransactionEntries(transactionGroupsToEntries([mixedGroup], { type: "withdrawal" }));
  assert.equal(expenses.count, 2);
  assert.deepEqual(expenses.totals, [{ currency: "COP", total: -40 }, { currency: "USD", total: -5 }]);
});

test("unfiltered transfer-only and empty loaded views have no monetary totals", () => {
  const transfers = transactionGroupsToEntries([group("transfers", [
    split("cop-move", "transfer", "1000"),
    split("usd-move", "transfer", "50", "USD"),
  ])]);
  const summary = summarizeTransactionEntries(transfers);
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.totals, [], "excluded transfer currencies must not become zero-valued totals");
  const empty = summarizeTransactionEntries(transactionGroupsToEntries([mixedGroup], { query: "no synthetic match" }));
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.totals, []);
});

test("pagination overlap and retry copies count a split once without dropping siblings", () => {
  const repeated = [mixedGroup, mixedGroup, group("page-two", [mixedGroup.attributes.transactions[0], split("next", "withdrawal", "10")])];
  const entries = transactionGroupsToEntries(repeated);
  assert.equal(entries.length, 6);
  assert.equal(new Set(entries.map(({ key }) => key)).size, 6);
  assert.deepEqual(summarizeTransactionEntries([...entries, ...entries]).totals, [
    { currency: "COP", total: 50 }, { currency: "USD", total: 20 },
  ], "summary also guards against repeated entries");
  assert.equal(summarizeTransactionEntries([...entries, ...entries]).count, 6);
});

test("matching totals use displayed split filters and fallback keys", () => {
  const filtered = transactionGroupsToEntries([mixedGroup, mixedGroup], {
    query: "cop-expense", type: "withdrawal", accountName: "Synthetic account",
    categoryName: "Synthetic category", tag: "synthetic-tag",
  });
  assert.equal(filtered.length, 1);
  assert.deepEqual(summarizeTransactionEntries(filtered).totals, [{ currency: "COP", total: -40 }]);
  const fallback = group("fallback", [
    split("one", "withdrawal", "10", null, { transaction_journal_id: null }),
    split("two", "withdrawal", "15", null, { transaction_journal_id: null }),
  ]);
  const fallbackEntries = transactionGroupsToEntries([fallback, fallback]);
  assert.equal(fallbackEntries.length, 2);
  assert.deepEqual(summarizeTransactionEntries(fallbackEntries, "EUR").totals, [{ currency: "EUR", total: -25 }]);
});
