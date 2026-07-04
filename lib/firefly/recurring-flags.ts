import type { TransactionSplit } from "./types";

export type RecurringTransactionKind =
  | "bill"
  | "recurrence"
  | "subscription"
  | "reserve";

export interface RecurringTransactionMeta {
  isRecurring: boolean;
  kind?: RecurringTransactionKind;
  id?: string;
  label?: string;
  detail?: string;
  confidence?: "exact" | "high";
  count?: number | null;
  total?: number | null;
}

export interface RecurringIndexBill {
  id: string;
  name: string;
  active: boolean;
  amountMin?: number;
  amountMax?: number;
  currency?: string | null;
  expectedDay?: number | null;
  nextExpected?: string | null;
}

export interface RecurringIndexTemplate {
  id: string;
  title: string;
  type: string;
  active: boolean;
  amount: number;
  currency?: string | null;
  descriptions: string[];
  sourceId?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  destinationId?: string | null;
  destinationName?: string | null;
  destinationType?: string | null;
  categoryName?: string | null;
  budgetName?: string | null;
  billId?: string | null;
  billName?: string | null;
  dayOfMonth?: number | null;
  nextDate?: string | null;
}

export interface RecurringIndex {
  bills: RecurringIndexBill[];
  templates: RecurringIndexTemplate[];
}

const AMOUNT_TOLERANCE = 1;
const DAY_WINDOW = 5;

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function exactTextMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  return Boolean(left && right && left === right);
}

function containsCanonicalText(
  haystack: string | null | undefined,
  needle: string | null | undefined
) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  return Boolean(h && n.length >= 5 && (h.includes(n) || n.includes(h)));
}

function descriptionsMatch(split: TransactionSplit, candidates: string[]) {
  const description = split.description;
  return candidates.some(
    (candidate) =>
      exactTextMatch(description, candidate) || containsCanonicalText(description, candidate)
  );
}

function amountMatches(splitAmount: string, expected: number | null | undefined) {
  const amount = parseAmount(splitAmount);
  if (amount === null || expected === null || expected === undefined) return false;
  return Math.abs(amount - Math.abs(expected)) <= AMOUNT_TOLERANCE;
}

function amountInRange(splitAmount: string, min?: number, max?: number) {
  const amount = parseAmount(splitAmount);
  if (amount === null) return false;
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo === undefined || hi === undefined) return false;
  return amount >= Math.abs(lo) - AMOUNT_TOLERANCE && amount <= Math.abs(hi) + AMOUNT_TOLERANCE;
}

function currencyMatches(a?: string | null, b?: string | null) {
  if (!a || !b) return true;
  return a === b;
}

function fieldMatches(
  splitValue: string | null | undefined,
  expectedValue: string | null | undefined
) {
  if (!expectedValue) return { ok: true, strong: false };
  if (!splitValue) return { ok: true, strong: false };
  return { ok: exactTextMatch(splitValue, expectedValue), strong: true };
}

function idOrNameMatches(
  splitId: string | null | undefined,
  expectedId: string | null | undefined,
  splitName: string | null | undefined,
  expectedName: string | null | undefined
) {
  if (expectedId && splitId) return { ok: splitId === expectedId, strong: true };
  return fieldMatches(splitName, expectedName);
}

function accountPairMatches(split: TransactionSplit, template: RecurringIndexTemplate) {
  const source = idOrNameMatches(
    split.source_id,
    template.sourceId,
    split.source_name,
    template.sourceName
  );
  const destination = idOrNameMatches(
    split.destination_id,
    template.destinationId,
    split.destination_name,
    template.destinationName
  );
  const sourceType = fieldMatches(split.source_type, template.sourceType);
  const destinationType = fieldMatches(split.destination_type, template.destinationType);

  return {
    ok: source.ok && destination.ok && sourceType.ok && destinationType.ok,
    strong:
      Number(source.strong) +
      Number(destination.strong) +
      Number(sourceType.strong) +
      Number(destinationType.strong),
  };
}

function categoryBudgetMatches(split: TransactionSplit, template: RecurringIndexTemplate) {
  const category = fieldMatches(split.category_name, template.categoryName);
  const budget = fieldMatches(split.budget_name, template.budgetName);
  return {
    ok: category.ok && budget.ok,
    strong: Number(category.strong) + Number(budget.strong),
  };
}

function dayFromDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCDate();
}

function dateMatches(splitDate: string, expectedDay?: number | null) {
  if (!expectedDay) return true;
  const actualDay = dayFromDate(splitDate);
  if (!actualDay) return true;
  return Math.abs(actualDay - expectedDay) <= DAY_WINDOW;
}

function isReserveTemplate(template: RecurringIndexTemplate) {
  return (
    template.type === "transfer" &&
    (containsCanonicalText(template.destinationName, "Savings for TC") ||
      containsCanonicalText(template.title, "reserva") ||
      template.descriptions.some((description) => containsCanonicalText(description, "FP")))
  );
}

function metadataMatch(split: TransactionSplit): RecurringTransactionMeta | null {
  if (split.bill_id || split.bill_name) {
    return {
      isRecurring: true,
      kind: "bill",
      id: split.bill_id ?? undefined,
      label: split.bill_name ?? "Linked bill",
      detail: "Firefly bill match",
      confidence: "exact",
      count: split.recurrence_count,
      total: split.recurrence_total,
    };
  }

  if (split.recurrence_id) {
    return {
      isRecurring: true,
      kind: "recurrence",
      id: split.recurrence_id,
      label: "Automated recurrence",
      detail: "Generated by Firefly recurrence",
      confidence: "exact",
      count: split.recurrence_count,
      total: split.recurrence_total,
    };
  }

  if (split.subscription_id || split.subscription_name) {
    return {
      isRecurring: true,
      kind: "subscription",
      id: split.subscription_id ?? undefined,
      label: split.subscription_name ?? "Linked subscription",
      detail: "Firefly subscription match",
      confidence: "exact",
      count: split.recurrence_count,
      total: split.recurrence_total,
    };
  }

  return null;
}

function matchTemplate(
  split: TransactionSplit,
  template: RecurringIndexTemplate
): RecurringTransactionMeta | null {
  if (!template.active) return null;
  if (split.type !== template.type) return null;
  if (!amountMatches(split.amount, template.amount)) return null;
  if (!currencyMatches(split.currency_code, template.currency)) return null;
  if (!dateMatches(split.date, template.dayOfMonth)) return null;

  const accounts = accountPairMatches(split, template);
  if (!accounts.ok) return null;

  const categoryBudget = categoryBudgetMatches(split, template);
  if (!categoryBudget.ok) return null;

  const byDescription = descriptionsMatch(split, [
    ...template.descriptions,
    template.billName ?? "",
    template.title,
  ]);

  const strongStructure = accounts.strong >= 2 || (accounts.strong >= 1 && categoryBudget.strong >= 1);
  if (!byDescription && !strongStructure) return null;

  const reserve = isReserveTemplate(template);
  return {
    isRecurring: true,
    kind: reserve ? "reserve" : template.billName ? "subscription" : "recurrence",
    id: template.billId ?? template.id,
    label: template.billName ?? template.title,
    detail: reserve
      ? `Matched reserve recurrence: ${template.title}`
      : `Matched recurrence: ${template.title}`,
    confidence: "high",
  };
}

function matchBill(split: TransactionSplit, bill: RecurringIndexBill): RecurringTransactionMeta | null {
  if (!bill.active) return null;
  if (split.type !== "withdrawal") return null;
  if (!amountInRange(split.amount, bill.amountMin, bill.amountMax)) return null;
  if (!currencyMatches(split.currency_code, bill.currency)) return null;
  if (!dateMatches(split.date, bill.expectedDay)) return null;
  if (!descriptionsMatch(split, [bill.name])) return null;

  return {
    isRecurring: true,
    kind: "bill",
    id: bill.id,
    label: bill.name,
    detail: `Matched bill: ${bill.name}`,
    confidence: "high",
  };
}

export function getRecurringTransactionMeta(
  split: TransactionSplit,
  index?: RecurringIndex | null
): RecurringTransactionMeta {
  const exact = metadataMatch(split);
  if (exact) return exact;

  if (index) {
    const templateMatch = index.templates
      .map((template) => matchTemplate(split, template))
      .find((match): match is RecurringTransactionMeta => Boolean(match));
    if (templateMatch) return templateMatch;

    const billMatch = index.bills
      .map((bill) => matchBill(split, bill))
      .find((match): match is RecurringTransactionMeta => Boolean(match));
    if (billMatch) return billMatch;
  }

  return { isRecurring: false };
}
