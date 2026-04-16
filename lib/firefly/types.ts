import { z } from "zod";

/**
 * Firefly III returns JSON:API-style envelopes: { data, meta, links }.
 * We only validate the fields the UI actually uses.
 */

export const paginationMetaSchema = z
  .object({
    pagination: z
      .object({
        total: z.number().optional(),
        count: z.number().optional(),
        per_page: z.number().optional(),
        current_page: z.number().optional(),
        total_pages: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

// --- About / user --------------------------------------------------------

export const aboutUserSchema = z.object({
  data: z.object({
    type: z.string(),
    id: z.string(),
    attributes: z
      .object({
        email: z.string().optional(),
        role: z.string().optional(),
      })
      .passthrough(),
  }),
});
export type AboutUser = z.infer<typeof aboutUserSchema>;

// --- Summary basic -------------------------------------------------------

/**
 * /api/v1/summary/basic returns a flat object keyed by entry id, e.g.
 *   { "balance-in-EUR": { title, monetary_value, value_parsed, currency_code, ... }, ... }
 * We keep it loose and interpret in the query helper.
 */
export const summaryBasicSchema = z.record(
  z.string(),
  z
    .object({
      title: z.string().optional(),
      monetary_value: z.union([z.string(), z.number()]).optional(),
      value_parsed: z.string().optional(),
      currency_code: z.string().optional(),
      currency_symbol: z.string().optional(),
      key: z.string().optional(),
      sub_title: z.string().optional(),
    })
    .passthrough()
);
export type SummaryBasic = z.infer<typeof summaryBasicSchema>;

// --- Transactions --------------------------------------------------------

export const transactionSplitSchema = z
  .object({
    type: z.string(),
    amount: z.string(),
    currency_code: z.string().optional().nullable(),
    currency_symbol: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    date: z.string(),
    source_id: z.string().optional().nullable(),
    source_name: z.string().optional().nullable(),
    destination_id: z.string().optional().nullable(),
    destination_name: z.string().optional().nullable(),
    category_id: z.string().optional().nullable(),
    category_name: z.string().optional().nullable(),
    budget_id: z.string().optional().nullable(),
    budget_name: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .passthrough();

export const transactionSchema = z.object({
  type: z.literal("transactions"),
  id: z.string(),
  attributes: z
    .object({
      group_title: z.string().optional().nullable(),
      transactions: z.array(transactionSplitSchema),
    })
    .passthrough(),
});

export const transactionsListSchema = z.object({
  data: z.array(transactionSchema),
  meta: paginationMetaSchema.optional(),
});
export type TransactionGroup = z.infer<typeof transactionSchema>;
export type TransactionSplit = z.infer<typeof transactionSplitSchema>;

// --- Accounts ------------------------------------------------------------

export const accountSchema = z.object({
  type: z.literal("accounts"),
  id: z.string(),
  attributes: z
    .object({
      name: z.string(),
      active: z.boolean().optional(),
      type: z.string(), // "asset", "expense", "revenue", "liability", etc.
      account_role: z.string().optional().nullable(),
      currency_code: z.string().optional().nullable(),
      currency_symbol: z.string().optional().nullable(),
      current_balance: z.string().optional().nullable(),
      current_balance_date: z.string().optional().nullable(),
      liability_type: z.string().optional().nullable(),
      iban: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    .passthrough(),
});

export const accountsListSchema = z.object({
  data: z.array(accountSchema),
  meta: paginationMetaSchema.optional(),
});
export type Account = z.infer<typeof accountSchema>;

// --- Budgets -------------------------------------------------------------

export const budgetSpentEntrySchema = z
  .object({
    sum: z.string().optional(),
    currency_code: z.string().optional(),
  })
  .passthrough();

export const budgetSchema = z.object({
  type: z.literal("budgets"),
  id: z.string(),
  attributes: z
    .object({
      name: z.string(),
      active: z.boolean().optional(),
      auto_budget_amount: z.string().optional().nullable(),
      auto_budget_period: z.string().optional().nullable(),
      spent: z.array(budgetSpentEntrySchema).optional().nullable(),
    })
    .passthrough(),
});

export const budgetsListSchema = z.object({
  data: z.array(budgetSchema),
  meta: paginationMetaSchema.optional(),
});
export type Budget = z.infer<typeof budgetSchema>;

export const budgetLimitSchema = z.object({
  type: z.literal("budget_limits"),
  id: z.string(),
  attributes: z
    .object({
      budget_id: z.string(),
      amount: z.string(),
      currency_code: z.string().optional().nullable(),
      start: z.string(),
      end: z.string(),
      spent: z.string().optional().nullable(),
    })
    .passthrough(),
});

export const budgetLimitsListSchema = z.object({
  data: z.array(budgetLimitSchema),
  meta: paginationMetaSchema.optional(),
});
export type BudgetLimit = z.infer<typeof budgetLimitSchema>;

// --- Categories ----------------------------------------------------------

export const categorySchema = z.object({
  type: z.literal("categories"),
  id: z.string(),
  attributes: z
    .object({
      name: z.string(),
      notes: z.string().optional().nullable(),
    })
    .passthrough(),
});

export const categoriesListSchema = z.object({
  data: z.array(categorySchema),
  meta: paginationMetaSchema.optional(),
});
export type Category = z.infer<typeof categorySchema>;

// Insight expense-by-category row
export const insightCategoryRowSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    difference: z.string().optional().nullable(),
    difference_float: z.number().optional().nullable(),
    currency_code: z.string().optional().nullable(),
  })
  .passthrough();

export const insightCategorySchema = z.array(insightCategoryRowSchema);
export type InsightCategoryRow = z.infer<typeof insightCategoryRowSchema>;

// --- Piggy banks ---------------------------------------------------------

export const piggyBankSchema = z.object({
  type: z.literal("piggy_banks"),
  id: z.string(),
  attributes: z
    .object({
      name: z.string(),
      currency_code: z.string().optional().nullable(),
      current_amount: z.string().optional().nullable(),
      target_amount: z.string().optional().nullable(),
      percentage: z.number().optional().nullable(),
      left_to_save: z.string().optional().nullable(),
      target_date: z.string().optional().nullable(),
    })
    .passthrough(),
});

export const piggyBanksListSchema = z.object({
  data: z.array(piggyBankSchema),
  meta: paginationMetaSchema.optional(),
});
export type PiggyBank = z.infer<typeof piggyBankSchema>;
