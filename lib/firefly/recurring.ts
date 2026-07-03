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

export interface RecurringOverview {
  bills: Bill[];
  recurrences: Recurrence[];
  scheduled: ScheduledRecurringTransaction[];
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
  const currency = firstKnownCurrency(scheduled, bills);

  return {
    bills,
    recurrences,
    scheduled,
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
      currency,
    },
  };
}
