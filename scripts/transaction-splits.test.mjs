import assert from "node:assert/strict";
import {
  filterTransactionEntries,
  selectTransactionEntry,
  summarizeTransactionEntries,
  transactionEntryHref,
  transactionGroupsToEntries,
} from "../lib/firefly/transaction-entries.ts";

const multiSplitGroup = {
  type: "transactions",
  id: "3917",
  attributes: {
    group_title: "Tuition installment 1",
    transactions: [
      {
        type: "withdrawal",
        amount: "215000.00",
        currency_code: "COP",
        description: "Reimbursable share for doña Lily",
        date: "2026-08-01T12:00:00+00:00",
        transaction_journal_id: "8401",
        source_id: "1",
        source_name: "Checking",
        destination_id: "91",
        destination_name: "Doña Lily",
        category_id: "12",
        category_name: "Debts",
        budget_id: null,
        budget_name: null,
        tags: ["tuition"],
      },
      {
        type: "withdrawal",
        amount: "212500.00",
        currency_code: "COP",
        description: "Personal share",
        date: "2026-08-01T12:00:00+00:00",
        transaction_journal_id: "8402",
        source_id: "1",
        source_name: "Checking",
        destination_id: "92",
        destination_name: "University",
        category_id: "18",
        category_name: "Education",
        budget_id: "9",
        budget_name: "Pago Extra Deuda",
        tags: ["tuition", "personal"],
      },
    ],
  },
};

const entries = transactionGroupsToEntries([multiSplitGroup]);
assert.equal(entries.length, 2, "both Firefly splits must become rows");
assert.deepEqual(
  entries.map((entry) => entry.split.amount),
  ["215000.00", "212500.00"]
);

const budgetEntries = filterTransactionEntries(entries, { budgetId: "9" });
assert.equal(budgetEntries.length, 1, "budget filtering must exclude sibling splits");
assert.equal(budgetEntries[0].split.amount, "212500.00");

const educationEntries = filterTransactionEntries(entries, { categoryName: "Education" });
assert.equal(educationEntries.length, 1, "category filtering must evaluate each split");
assert.equal(educationEntries[0].split.description, "Personal share");

assert.equal(filterTransactionEntries(entries, { query: "doña lily" }).length, 1);
assert.equal(
  filterTransactionEntries(entries, { query: "tuition installment" }).length,
  2,
  "the group title must remain searchable for every split"
);
assert.equal(filterTransactionEntries(entries, { accountName: "University" }).length, 1);
assert.equal(filterTransactionEntries(entries, { tag: "personal" }).length, 1);

const summary = summarizeTransactionEntries(entries, "COP");
assert.equal(summary.count, 2);
assert.equal(summary.currency, "COP");
assert.equal(summary.total, -427500, "the signed total must include both withdrawals");
assert.equal(Math.abs(summary.total), 427500, "the grouped amount must total COP 427,500");

assert.equal(new Set(entries.map((entry) => entry.key)).size, 2, "journal-based row keys must be unique");
assert.deepEqual(
  entries.map(transactionEntryHref),
  [
    "/transactions/3917?journal=8401",
    "/transactions/3917?journal=8402",
  ],
  "sibling rows must link to their own journals"
);
assert.equal(selectTransactionEntry(multiSplitGroup, { journalId: "8401" }).split.amount, "215000.00");
assert.equal(selectTransactionEntry(multiSplitGroup, { journalId: "8402" }).split.amount, "212500.00");
assert.equal(selectTransactionEntry(multiSplitGroup).split.amount, "215000.00");

const fallbackEntry = transactionGroupsToEntries([
  {
    ...multiSplitGroup,
    id: "fallback-group",
    attributes: {
      ...multiSplitGroup.attributes,
      transactions: [
        {
          ...multiSplitGroup.attributes.transactions[0],
          transaction_journal_id: null,
        },
      ],
    },
  },
])[0];
assert.equal(fallbackEntry.key, "fallback-group:0");
assert.equal(transactionEntryHref(fallbackEntry), "/transactions/fallback-group?split=0");

console.log("transaction split regression: 2 rows, per-split filters, totals, keys, and links verified");
