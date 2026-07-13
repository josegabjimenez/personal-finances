import "server-only";
import { listBills, listRecurrences } from "./queries";
import type {
  RecurringIndex,
  RecurringIndexBill,
  RecurringIndexTemplate,
} from "./recurring-flags";
import type { Bill, Recurrence, RecurrenceTransaction } from "./types";

export interface ScheduledRecurringTransaction {
  id: string;
  recurrenceId: string;
  title: string;
  recurrenceType: string;
  active: boolean;
  applyRules: boolean;
  amount: number;
  currency: string;
  description: string;
  source?: string | null;
  sourceType?: string | null;
  destination?: string | null;
  destinationType?: string | null;
  category?: string | null;
  budget?: string | null;
  billId?: string | null;
  billName?: string | null;
  tags: string[];
  frequency: string;
  cadenceDescription?: string | null;
  nextDate?: string | null;
  firstDate?: string | null;
  latestDate?: string | null;
  repeatUntil?: string | null;
  notes?: string | null;
}

export type RecurringObligationStatus =
  | "automated"
  | "tracked"
  | "untracked"
  | "paused"
  | "reserve_only";

export interface RecurringObligation {
  id: string;
  name: string;
  active: boolean;
  status: RecurringObligationStatus;
  amountMin: number;
  amountMax: number;
  currency: string;
  nextDate?: string | null;
  frequency: string;
  source?: string | null;
  destination?: string | null;
  category?: string | null;
  budget?: string | null;
  bill?: Bill;
  automation?: ScheduledRecurringTransaction;
  reserve?: ScheduledRecurringTransaction;
  attention: string[];
}

export interface RecurringOverview {
  bills: Bill[];
  recurrences: Recurrence[];
  scheduled: ScheduledRecurringTransaction[];
  obligations: RecurringObligation[];
  activeBills: Bill[];
  activeRecurrences: Recurrence[];
  totals: {
    activeBills: number;
    activeRecurrences: number;
    activeScheduledTransactions: number;
    activeScheduledWithdrawals: number;
    activeScheduledTransfers: number;
    withdrawalAmount: number;
    transferAmount: number;
    billAmountMin: number;
    billAmountMax: number;
    activeObligations: number;
    needsAttention: number;
    currency: string;
  };
}

function parseMoney(value: string | null | undefined) {
  const parsed = parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstKnownCurrency(
  scheduled: ScheduledRecurringTransaction[],
  bills: Bill[]
) {
  return (
    scheduled.find((item) => item.currency)?.currency ??
    bills.find((bill) => bill.attributes.currency_code)?.attributes.currency_code ??
    "COP"
  );
}

function formatFrequency(recurrence: Recurrence) {
  const repetitions = recurrence.attributes.repetitions ?? [];
  const first = repetitions[0];
  if (first?.description) return first.description;
  if (first?.type === "monthly" && first.moment) return `Monthly on day ${first.moment}`;
  if (first?.type) return first.type.replaceAll("_", " ");
  return recurrence.attributes.type;
}

function nextOccurrence(recurrence: Recurrence) {
  const occurrences = (recurrence.attributes.repetitions ?? [])
    .flatMap((rep) => rep.occurrences ?? [])
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  if (occurrences.length === 0) return recurrence.attributes.first_date ?? null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return (
    occurrences.find((date) => Date.parse(date) >= startOfToday.getTime()) ??
    occurrences[0] ??
    recurrence.attributes.first_date ??
    null
  );
}

function dayFromDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCDate();
}

function dayFromRecurrence(recurrence: Recurrence) {
  const moment = recurrence.attributes.repetitions?.[0]?.moment;
  const parsedMoment = Number(moment);
  if (Number.isInteger(parsedMoment) && parsedMoment >= 1 && parsedMoment <= 31) {
    return parsedMoment;
  }
  return dayFromDate(nextOccurrence(recurrence) ?? recurrence.attributes.first_date);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function billToIndexItem(bill: Bill): RecurringIndexBill {
  const attrs = bill.attributes;
  return {
    id: bill.id,
    name: attrs.name,
    active: attrs.active ?? false,
    amountMin: parseMoney(attrs.amount_min),
    amountMax: parseMoney(attrs.amount_max),
    currency: attrs.currency_code,
    expectedDay: dayFromDate(attrs.next_expected_match ?? attrs.date),
    nextExpected: attrs.next_expected_match ?? attrs.date,
  };
}

function recurrenceTemplateToIndexItem(
  recurrence: Recurrence,
  transaction: RecurrenceTransaction,
  index: number
): RecurringIndexTemplate {
  return {
    id: `${recurrence.id}-${transaction.id ?? index}`,
    title: recurrence.attributes.title,
    type: recurrence.attributes.type,
    active: recurrence.attributes.active ?? false,
    amount: parseMoney(transaction.amount),
    currency: transaction.currency_code,
    descriptions: uniqueStrings([
      transaction.description,
      transaction.subscription_name,
      recurrence.attributes.description,
      recurrence.attributes.title,
    ]),
    sourceId: transaction.source_id,
    sourceName: transaction.source_name,
    sourceType: transaction.source_type,
    destinationId: transaction.destination_id,
    destinationName: transaction.destination_name,
    destinationType: transaction.destination_type,
    categoryName: transaction.category_name,
    budgetName: transaction.budget_name,
    billId: transaction.subscription_id,
    billName: transaction.subscription_name,
    dayOfMonth: dayFromRecurrence(recurrence),
    nextDate: nextOccurrence(recurrence),
  };
}

function buildRecurringIndex(bills: Bill[], recurrences: Recurrence[]): RecurringIndex {
  return {
    bills: bills.map(billToIndexItem),
    templates: recurrences.flatMap((recurrence) =>
      (recurrence.attributes.transactions ?? []).map((transaction, index) =>
        recurrenceTemplateToIndexItem(recurrence, transaction, index)
      )
    ),
  };
}

export async function getRecurringIndex(): Promise<RecurringIndex> {
  const [bills, recurrences] = await Promise.all([listBills(), listRecurrences()]);
  return buildRecurringIndex(bills, recurrences);
}

function scheduledFromRecurrence(
  recurrence: Recurrence,
  transaction: RecurrenceTransaction,
  index: number
): ScheduledRecurringTransaction {
  return {
    id: `${recurrence.id}-${transaction.id ?? index}`,
    recurrenceId: recurrence.id,
    title: recurrence.attributes.title,
    recurrenceType: recurrence.attributes.type,
    active: recurrence.attributes.active ?? false,
    applyRules: recurrence.attributes.apply_rules ?? false,
    amount: parseMoney(transaction.amount),
    currency: transaction.currency_code ?? "COP",
    description: transaction.description ?? recurrence.attributes.description ?? recurrence.attributes.title,
    source: transaction.source_name,
    sourceType: transaction.source_type,
    destination: transaction.destination_name,
    destinationType: transaction.destination_type,
    category: transaction.category_name,
    budget: transaction.budget_name,
    billId: transaction.subscription_id,
    billName: transaction.subscription_name,
    tags: transaction.tags ?? [],
    frequency: formatFrequency(recurrence),
    cadenceDescription: recurrence.attributes.repetitions?.[0]?.description,
    nextDate: nextOccurrence(recurrence),
    firstDate: recurrence.attributes.first_date,
    latestDate: recurrence.attributes.latest_date,
    repeatUntil: recurrence.attributes.repeat_until,
    notes: recurrence.attributes.notes,
  };
}

const OBLIGATION_AMOUNT_TOLERANCE = 1;

function normalizeConcept(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(megan|auto|reserva|pago|gasto|fp)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptMatches(
  leftValues: Array<string | null | undefined>,
  rightValues: Array<string | null | undefined>
) {
  const left = leftValues.map(normalizeConcept).filter(Boolean);
  const right = rightValues.map(normalizeConcept).filter(Boolean);
  return left.some((a) =>
    right.some(
      (b) => a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)))
    )
  );
}

function cardKey(values: Array<string | null | undefined>) {
  for (const value of values) {
    const match = normalizeConcept(value).match(/(?:^|\s)tc\s*(\d+)(?:\s|$)/u);
    if (match?.[1]) return `tc${match[1]}`;
  }
  return null;
}

function amountMatches(value: number, expected: number) {
  return Math.abs(Math.abs(value) - Math.abs(expected)) <= OBLIGATION_AMOUNT_TOLERANCE;
}

function billAmountRange(bill: Bill, fallback?: number) {
  const attrs = bill.attributes;
  const min = attrs.amount_min == null ? fallback ?? 0 : parseMoney(attrs.amount_min);
  const max = attrs.amount_max == null ? fallback ?? min : parseMoney(attrs.amount_max);
  return { min, max };
}

function expenseMatchesBill(item: ScheduledRecurringTransaction, bill: Bill) {
  if (item.recurrenceType !== "withdrawal") return false;
  if (item.billId) return item.billId === bill.id;
  if (item.billName && normalizeConcept(item.billName) === normalizeConcept(bill.attributes.name)) {
    return true;
  }

  const { min, max } = billAmountRange(bill);
  const amountInRange =
    item.amount >= min - OBLIGATION_AMOUNT_TOLERANCE &&
    item.amount <= max + OBLIGATION_AMOUNT_TOLERANCE;
  const currencyMatches =
    !bill.attributes.currency_code || item.currency === bill.attributes.currency_code;
  return (
    amountInRange &&
    currencyMatches &&
    conceptMatches([item.description, item.title], [bill.attributes.name])
  );
}

function reserveMatchesObligation(
  reserve: ScheduledRecurringTransaction,
  obligation: RecurringObligation
) {
  const expense = obligation.automation;
  if (!expense || reserve.recurrenceType !== "transfer") return false;
  if (!amountMatches(reserve.amount, expense.amount)) return false;
  if (reserve.currency && expense.currency && reserve.currency !== expense.currency) return false;

  const reserveCard = cardKey([
    reserve.description,
    reserve.title,
    reserve.source,
    reserve.destination,
  ]);
  const expenseCard = cardKey([
    obligation.name,
    expense.description,
    expense.title,
    expense.source,
  ]);
  if (reserveCard && expenseCard && reserveCard !== expenseCard) return false;

  return conceptMatches(
    [reserve.description, reserve.title],
    [obligation.name, expense.description, expense.title, expense.billName]
  );
}

function buildRecurringObligations(
  bills: Bill[],
  scheduled: ScheduledRecurringTransaction[]
) {
  const expenses = scheduled.filter((item) => item.recurrenceType === "withdrawal");
  const reserves = scheduled.filter((item) => item.recurrenceType === "transfer");
  const usedExpenses = new Set<string>();

  const obligations: RecurringObligation[] = bills.map((bill) => {
    const candidates = expenses.filter((item) => expenseMatchesBill(item, bill));
    const automation = candidates[0];
    if (automation) usedExpenses.add(automation.id);

    const range = billAmountRange(bill, automation?.amount);
    const billActive = bill.attributes.active ?? false;
    const active = billActive && (automation?.active ?? true);
    const attention: string[] = [];
    if (!automation) attention.push("No automation linked");
    if (candidates.length > 1) attention.push("Multiple automations linked");
    if (
      automation &&
      (automation.amount < range.min - OBLIGATION_AMOUNT_TOLERANCE ||
        automation.amount > range.max + OBLIGATION_AMOUNT_TOLERANCE)
    ) {
      attention.push("Automation amount is outside the bill range");
    }
    if (automation && billActive !== automation.active) {
      attention.push("Bill and automation status differ");
    }

    return {
      id: `bill-${bill.id}`,
      name: bill.attributes.name,
      active,
      status: active ? (automation ? "automated" : "tracked") : "paused",
      amountMin: range.min,
      amountMax: range.max,
      currency: bill.attributes.currency_code ?? automation?.currency ?? "COP",
      nextDate:
        automation?.nextDate ?? bill.attributes.next_expected_match ?? bill.attributes.date,
      frequency: automation?.frequency ?? bill.attributes.repeat_freq ?? "Recurring",
      source: automation?.source,
      destination: automation?.destination,
      category: automation?.category,
      budget: automation?.budget,
      bill,
      automation,
      attention,
    } satisfies RecurringObligation;
  });

  for (const expense of expenses) {
    if (usedExpenses.has(expense.id)) continue;
    obligations.push({
      id: `automation-${expense.id}`,
      name: expense.description,
      active: expense.active,
      status: expense.active ? "untracked" : "paused",
      amountMin: expense.amount,
      amountMax: expense.amount,
      currency: expense.currency,
      nextDate: expense.nextDate,
      frequency: expense.frequency,
      source: expense.source,
      destination: expense.destination,
      category: expense.category,
      budget: expense.budget,
      automation: expense,
      attention: ["No bill linked"],
    });
  }

  for (const reserve of reserves) {
    const candidates = obligations.filter((obligation) =>
      reserveMatchesObligation(reserve, obligation)
    );
    if (candidates.length === 1) {
      candidates[0].reserve = reserve;
      continue;
    }

    obligations.push({
      id: `reserve-${reserve.id}`,
      name: reserve.description,
      active: reserve.active,
      status: "reserve_only",
      amountMin: 0,
      amountMax: 0,
      currency: reserve.currency,
      nextDate: reserve.nextDate,
      frequency: reserve.frequency,
      source: reserve.source,
      destination: reserve.destination,
      reserve,
      attention: [
        candidates.length > 1
          ? "Reserve match is ambiguous"
          : "Reserve is not linked to an expense",
      ],
    });
  }

  return obligations.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const aTime = a.nextDate ? Date.parse(a.nextDate) : Number.MAX_SAFE_INTEGER;
    const bTime = b.nextDate ? Date.parse(b.nextDate) : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || a.name.localeCompare(b.name);
  });
}

export async function getRecurringOverview(): Promise<RecurringOverview> {
  const [bills, recurrences] = await Promise.all([listBills(), listRecurrences()]);
  const scheduled = recurrences.flatMap((recurrence) =>
    (recurrence.attributes.transactions ?? []).map((transaction, index) =>
      scheduledFromRecurrence(recurrence, transaction, index)
    )
  );

  const activeBills = bills.filter((bill) => bill.attributes.active ?? false);
  const activeRecurrences = recurrences.filter(
    (recurrence) => recurrence.attributes.active ?? false
  );
  const activeScheduled = scheduled.filter((item) => item.active);
  const obligations = buildRecurringObligations(bills, scheduled);
  const currency = firstKnownCurrency(scheduled, bills);

  return {
    bills,
    recurrences,
    scheduled,
    obligations,
    activeBills,
    activeRecurrences,
    totals: {
      activeBills: activeBills.length,
      activeRecurrences: activeRecurrences.length,
      activeScheduledTransactions: activeScheduled.length,
      activeScheduledWithdrawals: activeScheduled.filter(
        (item) => item.recurrenceType === "withdrawal"
      ).length,
      activeScheduledTransfers: activeScheduled.filter(
        (item) => item.recurrenceType === "transfer"
      ).length,
      withdrawalAmount: activeScheduled
        .filter((item) => item.recurrenceType === "withdrawal")
        .reduce((sum, item) => sum + item.amount, 0),
      transferAmount: activeScheduled
        .filter((item) => item.recurrenceType === "transfer")
        .reduce((sum, item) => sum + item.amount, 0),
      billAmountMin: activeBills.reduce(
        (sum, bill) => sum + parseMoney(bill.attributes.amount_min),
        0
      ),
      billAmountMax: activeBills.reduce(
        (sum, bill) => sum + parseMoney(bill.attributes.amount_max),
        0
      ),
      activeObligations: obligations.filter(
        (obligation) => obligation.active && obligation.status !== "reserve_only"
      ).length,
      needsAttention: obligations.filter((obligation) => obligation.attention.length > 0).length,
      currency,
    },
  };
}
