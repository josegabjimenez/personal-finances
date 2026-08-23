import type { TransactionGroup, TransactionSplit } from "./types";

export interface TransactionEntry {
  key: string;
  group: TransactionGroup;
  split: TransactionSplit;
  splitIndex: number;
}

export interface TransactionEntryFilters {
  query?: string;
  type?: string;
  accountName?: string;
  categoryName?: string;
  tag?: string;
  accountId?: string;
  categoryId?: string;
  budgetId?: string;
  additionalSearchTerms?: (entry: TransactionEntry) => Array<string | null | undefined>;
}

export type TransactionEntryContextFilter = Pick<
  TransactionEntryFilters,
  "accountId" | "categoryId" | "budgetId"
>;

export interface TransactionEntrySummary {
  count: number;
  total: number;
  currency: string;
}

function transactionEntryKey(
  group: TransactionGroup,
  split: TransactionSplit,
  splitIndex: number
) {
  const journalId = split.transaction_journal_id?.trim();
  return journalId ? `journal:${journalId}` : `${group.id}:${splitIndex}`;
}

function matchesQuery(
  entry: TransactionEntry,
  query: string,
  additionalSearchTerms?: TransactionEntryFilters["additionalSearchTerms"]
) {
  const { group, split } = entry;
  return [
    split.description,
    split.source_name,
    split.destination_name,
    split.category_name,
    split.budget_name,
    split.bill_name,
    split.subscription_name,
    split.recurrence_id,
    ...(split.tags ?? []),
    group.attributes.group_title,
    ...(additionalSearchTerms?.(entry) ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function filterTransactionEntries(
  entries: TransactionEntry[],
  filters: TransactionEntryFilters = {}
) {
  const query = filters.query?.trim().toLocaleLowerCase();

  return entries.filter((entry) => {
    const { split } = entry;

    if (query && !matchesQuery(entry, query, filters.additionalSearchTerms)) return false;
    if (filters.type && split.type !== filters.type) return false;
    if (
      filters.accountName &&
      split.source_name !== filters.accountName &&
      split.destination_name !== filters.accountName
    ) {
      return false;
    }
    if (filters.categoryName && split.category_name !== filters.categoryName) return false;
    if (filters.tag && !(split.tags ?? []).includes(filters.tag)) return false;
    if (
      filters.accountId &&
      split.source_id !== filters.accountId &&
      split.destination_id !== filters.accountId
    ) {
      return false;
    }
    if (filters.categoryId && split.category_id !== filters.categoryId) return false;
    if (filters.budgetId && split.budget_id !== filters.budgetId) return false;

    return true;
  });
}

export function transactionGroupsToEntries(
  groups: TransactionGroup[],
  filters: TransactionEntryFilters = {}
): TransactionEntry[] {
  const entries = groups.flatMap((group) =>
    group.attributes.transactions.map((split, splitIndex) => ({
      key: transactionEntryKey(group, split, splitIndex),
      group,
      split,
      splitIndex,
    }))
  );

  return filterTransactionEntries(entries, filters);
}

export function selectTransactionEntry(
  group: TransactionGroup,
  selector: { journalId?: string; splitIndex?: number } = {}
) {
  const entries = transactionGroupsToEntries([group]);
  const journalId = selector.journalId?.trim();

  if (journalId) {
    const journalEntry = entries.find(
      ({ split }) => split.transaction_journal_id === journalId
    );
    if (journalEntry) return journalEntry;
  }

  if (
    Number.isInteger(selector.splitIndex) &&
    selector.splitIndex !== undefined &&
    selector.splitIndex >= 0
  ) {
    const indexedEntry = entries.find(
      ({ splitIndex }) => splitIndex === selector.splitIndex
    );
    if (indexedEntry) return indexedEntry;
  }

  return entries[0] ?? null;
}

export function signedTransactionAmount(split: TransactionSplit) {
  const parsed = parseFloat(split.amount);
  if (!Number.isFinite(parsed)) return 0;
  if (split.type === "withdrawal") return -Math.abs(parsed);
  if (split.type === "deposit") return Math.abs(parsed);
  return parsed;
}

export function summarizeTransactionEntries(
  entries: TransactionEntry[],
  defaultCurrency = "COP"
): TransactionEntrySummary {
  const total = entries.reduce((sum, { split }) => {
    if (split.type !== "withdrawal" && split.type !== "deposit") return sum;
    return sum + signedTransactionAmount(split);
  }, 0);

  return {
    count: entries.length,
    total,
    currency:
      entries.find(({ split }) => Boolean(split.currency_code))?.split.currency_code ??
      defaultCurrency,
  };
}

export function transactionEntryHref(entry: TransactionEntry) {
  const groupId = encodeURIComponent(entry.group.id);
  const journalId = entry.split.transaction_journal_id?.trim();
  if (journalId) {
    return `/transactions/${groupId}?journal=${encodeURIComponent(journalId)}`;
  }
  return `/transactions/${groupId}?split=${entry.splitIndex}`;
}
