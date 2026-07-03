import "server-only";
import { z } from "zod";
import { fireflyFetch } from "./client";
import {
  accountSchema,
  accountsListSchema,
  aboutUserSchema,
  billSchema,
  billsListSchema,
  budgetLimitsListSchema,
  budgetSchema,
  budgetsListSchema,
  categoriesListSchema,
  categorySchema,
  insightCategorySchema,
  piggyBanksListSchema,
  recurrenceSchema,
  recurrencesListSchema,
  summaryBasicSchema,
  tagsListSchema,
  transactionsListSchema,
  type Account,
  type Bill,
  type Budget,
  type BudgetLimit,
  type Category,
  type InsightCategoryRow,
  type PiggyBank,
  type Recurrence,
  type SummaryBasic,
  type Tag,
  type TransactionGroup,
} from "./types";
import { endOfMonth, startOfMonth, toYMD } from "@/lib/format";

export async function getAboutUser() {
  const raw = await fireflyFetch("/about/user", { revalidate: 300, tags: ["about"] });
  return aboutUserSchema.parse(raw);
}

export async function getSummaryBasic(start: Date, end: Date): Promise<SummaryBasic> {
  const raw = await fireflyFetch("/summary/basic", {
    searchParams: { start: toYMD(start), end: toYMD(end) },
    revalidate: 60,
    tags: ["summary"],
  });
  return summaryBasicSchema.parse(raw);
}

/**
 * Interpret the opaque `summary/basic` dictionary into a friendly shape.
 * Firefly keys entries like "balance-in-EUR", "spent-in-EUR", "earned-in-EUR", "net-worth-in-EUR".
 */
export function interpretSummary(summary: SummaryBasic) {
  const result: {
    netWorth: { value: number; currency: string } | null;
    spent: { value: number; currency: string } | null;
    earned: { value: number; currency: string } | null;
    balance: { value: number; currency: string } | null;
  } = {
    netWorth: null,
    spent: null,
    earned: null,
    balance: null,
  };
  for (const [key, entry] of Object.entries(summary)) {
    const value = parseFloat(String(entry.monetary_value ?? entry.value_parsed ?? "0"));
    const currency = entry.currency_code ?? "USD";
    if (!Number.isFinite(value)) continue;
    if (key.startsWith("net-worth-in-")) {
      if (!result.netWorth || Math.abs(value) > Math.abs(result.netWorth.value)) {
        result.netWorth = { value, currency };
      }
    } else if (key.startsWith("spent-in-")) {
      if (!result.spent || Math.abs(value) > Math.abs(result.spent.value)) {
        result.spent = { value: Math.abs(value), currency };
      }
    } else if (key.startsWith("earned-in-")) {
      if (!result.earned || Math.abs(value) > Math.abs(result.earned.value)) {
        result.earned = { value: Math.abs(value), currency };
      }
    } else if (key.startsWith("balance-in-")) {
      if (!result.balance || Math.abs(value) > Math.abs(result.balance.value)) {
        result.balance = { value, currency };
      }
    }
  }
  return result;
}

export async function listTransactions(params: {
  page?: number;
  limit?: number;
  type?: "all" | "withdrawal" | "deposit" | "transfer";
  start?: string;
  end?: string;
} = {}): Promise<{ groups: TransactionGroup[]; totalPages: number }> {
  const raw = await fireflyFetch("/transactions", {
    searchParams: {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      type: params.type && params.type !== "all" ? params.type : undefined,
      start: params.start,
      end: params.end,
    },
    revalidate: 30,
    tags: ["transactions"],
  });
  const parsed = transactionsListSchema.parse(raw);
  return {
    groups: parsed.data,
    totalPages: parsed.meta?.pagination?.total_pages ?? 1,
  };
}

export async function listBills(): Promise<Bill[]> {
  const limit = 100;
  const firstRaw = await fireflyFetch("/bills", {
    searchParams: { page: 1, limit },
    revalidate: 120,
    tags: ["bills"],
  });
  const first = billsListSchema.parse(firstRaw);
  const totalPages = first.meta?.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fireflyFetch("/bills", {
        searchParams: { page: index + 2, limit },
        revalidate: 120,
        tags: ["bills"],
      }).then((raw) => billsListSchema.parse(raw).data)
    )
  );

  return [first.data, ...rest].flat();
}

export async function getBill(id: string): Promise<Bill> {
  const raw = await fireflyFetch(`/bills/${id}`, {
    revalidate: 120,
    tags: ["bills"],
  });
  return z.object({ data: billSchema }).parse(raw).data;
}

export async function listRecurrences(): Promise<Recurrence[]> {
  const limit = 100;
  const firstRaw = await fireflyFetch("/recurrences", {
    searchParams: { page: 1, limit },
    revalidate: 120,
    tags: ["recurrences"],
  });
  const first = recurrencesListSchema.parse(firstRaw);
  const totalPages = first.meta?.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fireflyFetch("/recurrences", {
        searchParams: { page: index + 2, limit },
        revalidate: 120,
        tags: ["recurrences"],
      }).then((raw) => recurrencesListSchema.parse(raw).data)
    )
  );

  return [first.data, ...rest].flat();
}

export async function getRecurrence(id: string): Promise<Recurrence> {
  const raw = await fireflyFetch(`/recurrences/${id}`, {
    revalidate: 120,
    tags: ["recurrences"],
  });
  return z.object({ data: recurrenceSchema }).parse(raw).data;
}

export async function listAccounts(type?: "asset" | "liability" | "expense" | "revenue"): Promise<Account[]> {
  const raw = await fireflyFetch("/accounts", {
    searchParams: { type },
    revalidate: 120,
    tags: ["accounts"],
  });
  return accountsListSchema.parse(raw).data;
}

export async function getAccount(id: string): Promise<Account> {
  const raw = await fireflyFetch(`/accounts/${id}`, {
    revalidate: 120,
    tags: ["accounts"],
  });
  return z.object({ data: accountSchema }).parse(raw).data;
}

export async function listAccountTransactions(
  accountId: string,
  params: { page?: number; limit?: number; start?: string; end?: string } = {}
): Promise<{ groups: TransactionGroup[]; totalPages: number }> {
  const raw = await fireflyFetch(`/accounts/${accountId}/transactions`, {
    searchParams: {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      start: params.start,
      end: params.end,
    },
    revalidate: 30,
    tags: ["transactions", "accounts"],
  });
  const parsed = transactionsListSchema.parse(raw);
  return { groups: parsed.data, totalPages: parsed.meta?.pagination?.total_pages ?? 1 };
}

export async function listBudgets(): Promise<Budget[]> {
  const limit = 100;
  const firstRaw = await fireflyFetch("/budgets", {
    searchParams: { page: 1, limit },
    revalidate: 120,
    tags: ["budgets"],
  });
  const first = budgetsListSchema.parse(firstRaw);
  const totalPages = first.meta?.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fireflyFetch("/budgets", {
        searchParams: { page: index + 2, limit },
        revalidate: 120,
        tags: ["budgets"],
      }).then((raw) => budgetsListSchema.parse(raw).data)
    )
  );

  return [first.data, ...rest].flat();
}

export async function getBudget(id: string): Promise<Budget> {
  const raw = await fireflyFetch(`/budgets/${id}`, {
    revalidate: 120,
    tags: ["budgets"],
  });
  return z.object({ data: budgetSchema }).parse(raw).data;
}

export async function listBudgetTransactions(
  budgetId: string,
  params: { page?: number; limit?: number; start?: string; end?: string } = {}
): Promise<{ groups: TransactionGroup[]; totalPages: number }> {
  const raw = await fireflyFetch(`/budgets/${budgetId}/transactions`, {
    searchParams: {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      start: params.start,
      end: params.end,
    },
    revalidate: 30,
    tags: ["transactions", "budgets"],
  });
  const parsed = transactionsListSchema.parse(raw);
  return { groups: parsed.data, totalPages: parsed.meta?.pagination?.total_pages ?? 1 };
}

export async function listBudgetLimits(start: Date, end: Date): Promise<BudgetLimit[]> {
  const limit = 100;
  const searchParams = { start: toYMD(start), end: toYMD(end), limit };
  const firstRaw = await fireflyFetch("/budget-limits", {
    searchParams: { ...searchParams, page: 1 },
    revalidate: 120,
    tags: ["budgets"],
  });
  const first = budgetLimitsListSchema.parse(firstRaw);
  const totalPages = first.meta?.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fireflyFetch("/budget-limits", {
        searchParams: { ...searchParams, page: index + 2 },
        revalidate: 120,
        tags: ["budgets"],
      }).then((raw) => budgetLimitsListSchema.parse(raw).data)
    )
  );

  return [first.data, ...rest].flat();
}

export async function listCategories(): Promise<Category[]> {
  const raw = await fireflyFetch("/categories", {
    revalidate: 300,
    tags: ["categories"],
  });
  return categoriesListSchema.parse(raw).data;
}

export async function getCategory(id: string): Promise<Category> {
  const raw = await fireflyFetch(`/categories/${id}`, {
    revalidate: 300,
    tags: ["categories"],
  });
  return z.object({ data: categorySchema }).parse(raw).data;
}

export async function listCategoryTransactions(
  categoryId: string,
  params: { page?: number; limit?: number; start?: string; end?: string } = {}
): Promise<{ groups: TransactionGroup[]; totalPages: number }> {
  const raw = await fireflyFetch(`/categories/${categoryId}/transactions`, {
    searchParams: {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      start: params.start,
      end: params.end,
    },
    revalidate: 30,
    tags: ["transactions", "categories"],
  });
  const parsed = transactionsListSchema.parse(raw);
  return { groups: parsed.data, totalPages: parsed.meta?.pagination?.total_pages ?? 1 };
}

export async function getExpenseByCategory(start: Date, end: Date): Promise<InsightCategoryRow[]> {
  const raw = await fireflyFetch("/insight/expense/category", {
    searchParams: { start: toYMD(start), end: toYMD(end) },
    revalidate: 60,
    tags: ["insights"],
  });
  return insightCategorySchema.parse(raw);
}

export async function listTags(): Promise<Tag[]> {
  const raw = await fireflyFetch("/tags", {
    revalidate: 300,
    tags: ["tags"],
  });
  return tagsListSchema.parse(raw).data;
}

export async function listPiggyBanks(): Promise<PiggyBank[]> {
  const raw = await fireflyFetch("/piggy-banks", {
    revalidate: 120,
    tags: ["piggy-banks"],
  });
  return piggyBanksListSchema.parse(raw).data;
}

export function currentMonthRange() {
  const now = new Date();
  return { start: startOfMonth(now), end: endOfMonth(now) };
}
