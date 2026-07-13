import type { Bill } from "./types";

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
  sourceId?: string | null;
  source?: string | null;
  sourceType?: string | null;
  destinationId?: string | null;
  destination?: string | null;
  destinationType?: string | null;
  category?: string | null;
  budget?: string | null;
  billId?: string | null;
  billName?: string | null;
  tags: string[];
  frequency: string;
  cadenceType?: string | null;
  cadenceMoment?: string | null;
  cadenceSkip?: number | null;
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
  | "mixed"
  | "reserve_only"
  | "transfer_only";

export type ObligationMatchConfidence = "exact" | "high" | "ambiguous" | "unmatched";

export interface RecurringObligation {
  id: string;
  conceptKey: string;
  name: string;
  active: boolean;
  status: RecurringObligationStatus;
  amountMin: number;
  amountMax: number;
  amountSource: "withdrawal" | "bill_range" | "none";
  currency: string;
  nextDate?: string | null;
  frequency: string;
  source?: string | null;
  destination?: string | null;
  category?: string | null;
  budget?: string | null;
  bill?: Bill;
  expenseAutomations: ScheduledRecurringTransaction[];
  reserveAutomations: ScheduledRecurringTransaction[];
  attention: string[];
  match: {
    billMethod?: "subscription_id" | "subscription_name" | "canonical_concept";
    reserveMethod?: "bill_id" | "card_concept";
    confidence: ObligationMatchConfidence;
    candidateIds: string[];
  };
}

const AMOUNT_TOLERANCE_CENTS = 100;
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

export function canonicalConcept(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/^megan auto\s+/u, "")
    .replace(/^reserva pago tc\s*\d+\s+/u, "")
    .replace(/^reserva tc\s*\d+\s+/u, "")
    .replace(/^reserva\s+/u, "")
    .replace(/^fp\s+/u, "")
    .replace(/\s+gasto tc\s*\d+$/u, "")
    .replace(/\s+tc\s*\d+$/u, "")
    .trim();
}

function cardKey(values: Array<string | null | undefined>) {
  for (const value of values) {
    const match = normalizeText(value).match(/(?:^|\s)tc\s*(\d+)(?:\s|$)/u);
    if (match?.[1]) return `tc${match[1]}`;
  }
  return null;
}

function reserveCardKey(item: ScheduledRecurringTransaction) {
  const destination = normalizeText(item.destination);
  const match = destination.match(/^savings for tc\s*(\d+)$/u);
  return match?.[1] ? `tc${match[1]}` : null;
}

export function isCardReserve(item: ScheduledRecurringTransaction) {
  return item.recurrenceType === "transfer" && reserveCardKey(item) !== null;
}

function moneyCents(value: number) {
  return Math.round(Math.abs(value) * 100);
}

function amountsMatch(left: number, right: number) {
  return Math.abs(moneyCents(left) - moneyCents(right)) <= AMOUNT_TOLERANCE_CENTS;
}

function billRange(bill: Bill, fallback?: number) {
  const minValue = bill.attributes.amount_min;
  const maxValue = bill.attributes.amount_max;
  const parsedMin = minValue == null ? fallback ?? 0 : Number(minValue);
  const parsedMax = maxValue == null ? fallback ?? parsedMin : Number(maxValue);
  return {
    min: Number.isFinite(parsedMin) ? parsedMin : fallback ?? 0,
    max: Number.isFinite(parsedMax) ? parsedMax : fallback ?? 0,
  };
}

function amountFitsBill(item: ScheduledRecurringTransaction, bill: Bill) {
  const range = billRange(bill);
  const amount = moneyCents(item.amount);
  return (
    amount >= moneyCents(range.min) - AMOUNT_TOLERANCE_CENTS &&
    amount <= moneyCents(range.max) + AMOUNT_TOLERANCE_CENTS
  );
}

function currencyMatches(item: ScheduledRecurringTransaction, bill: Bill) {
  const currency = bill.attributes.currency_code;
  return !currency || currency === item.currency;
}

function dayOfMonth(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCDate();
}

function daysCompatible(left: string | null | undefined, right: string | null | undefined) {
  const leftDay = dayOfMonth(left);
  const rightDay = dayOfMonth(right);
  return leftDay === null || rightDay === null || Math.abs(leftDay - rightDay) <= DAY_WINDOW;
}

function cadenceMatchesBill(item: ScheduledRecurringTransaction, bill: Bill) {
  const billFrequency = normalizeText(bill.attributes.repeat_freq);
  const cadenceType = normalizeText(item.cadenceType);
  if (billFrequency && cadenceType && billFrequency !== cadenceType) return false;
  return daysCompatible(item.nextDate, bill.attributes.next_expected_match ?? bill.attributes.date);
}

function cadenceMatchesItems(
  left: ScheduledRecurringTransaction,
  right: ScheduledRecurringTransaction
) {
  if (left.cadenceType && right.cadenceType && left.cadenceType !== right.cadenceType) {
    return false;
  }
  if (left.cadenceMoment && right.cadenceMoment) {
    return left.cadenceMoment === right.cadenceMoment;
  }
  return daysCompatible(left.nextDate, right.nextDate);
}

function exactConceptMatch(item: ScheduledRecurringTransaction, bill: Bill) {
  const billConcept = canonicalConcept(bill.attributes.name);
  return Boolean(
    billConcept &&
      [item.description, item.title]
        .map(canonicalConcept)
        .filter(Boolean)
        .some((candidate) => candidate === billConcept)
  );
}

function expenseBillConflicts(item: ScheduledRecurringTransaction, bill: Bill) {
  const conflicts: string[] = [];
  if (item.billName && normalizeText(item.billName) !== normalizeText(bill.attributes.name)) {
    conflicts.push("Bill ID and bill name disagree");
  }
  if (!currencyMatches(item, bill)) conflicts.push("Automation currency differs from the bill");
  if (!amountFitsBill(item, bill)) conflicts.push("Automation amount is outside the bill range");
  if (!cadenceMatchesBill(item, bill)) conflicts.push("Automation cadence differs from the bill");
  return conflicts;
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function firstDate(items: ScheduledRecurringTransaction[]) {
  return [...items]
    .sort((a, b) => timestamp(a.nextDate) - timestamp(b.nextDate) || a.id.localeCompare(b.id))[0]
    ?.nextDate;
}

function aggregateField(
  items: ScheduledRecurringTransaction[],
  field: "source" | "destination" | "category" | "budget"
) {
  const values = Array.from(new Set(items.map((item) => item[field]).filter(Boolean)));
  return values.length === 1 ? values[0] : null;
}

type ExpenseAssignment = {
  item: ScheduledRecurringTransaction;
  bill?: Bill;
  method?: RecurringObligation["match"]["billMethod"];
  confidence: ObligationMatchConfidence;
  candidateIds: string[];
  attention: string[];
};

function assignExpenseToBill(
  item: ScheduledRecurringTransaction,
  bills: Bill[],
  billById: Map<string, Bill>,
  billsByName: Map<string, Bill[]>
): ExpenseAssignment {
  if (item.billId) {
    const bill = billById.get(item.billId);
    if (!bill) {
      return {
        item,
        confidence: "unmatched",
        candidateIds: [item.billId],
        attention: ["Automation references a missing bill"],
      };
    }
    return {
      item,
      bill,
      method: "subscription_id",
      confidence: "exact",
      candidateIds: [bill.id],
      attention: expenseBillConflicts(item, bill),
    };
  }

  if (item.billName) {
    const candidates = billsByName.get(normalizeText(item.billName)) ?? [];
    const compatible = candidates.filter(
      (bill) => amountFitsBill(item, bill) && currencyMatches(item, bill)
    );
    if (compatible.length === 1 && candidates.length === 1) {
      const [bill] = compatible;
      return {
        item,
        bill,
        method: "subscription_name",
        confidence: "exact",
        candidateIds: [bill.id],
        attention: [],
      };
    }
    return {
      item,
      confidence: candidates.length > 1 ? "ambiguous" : "unmatched",
      candidateIds: candidates.map((bill) => bill.id),
      attention: [
        candidates.length > 1
          ? "Bill name matches multiple bills"
          : "Bill name does not match a compatible bill",
      ],
    };
  }

  const candidates = bills.filter(
    (bill) =>
      exactConceptMatch(item, bill) &&
      amountFitsBill(item, bill) &&
      currencyMatches(item, bill) &&
      cadenceMatchesBill(item, bill)
  );
  if (candidates.length === 1) {
    const [bill] = candidates;
    return {
      item,
      bill,
      method: "canonical_concept",
      confidence: "high",
      candidateIds: [bill.id],
      attention: [],
    };
  }
  return {
    item,
    confidence: candidates.length > 1 ? "ambiguous" : "unmatched",
    candidateIds: candidates.map((bill) => bill.id),
    attention: [
      candidates.length > 1
        ? "Automation matches multiple bills"
        : "No bill linked",
    ],
  };
}

function obligationFromBill(
  bill: Bill,
  assignments: ExpenseAssignment[]
): RecurringObligation {
  const expenses = assignments.map((assignment) => assignment.item);
  const activeExpenses = expenses.filter((item) => item.active);
  const billActive = bill.attributes.active ?? false;
  const statusMismatch = expenses.some((item) => item.active !== billActive);
  const active = billActive || activeExpenses.length > 0;
  const range = billRange(bill, expenses[0]?.amount);
  const configuredAmount = expenses.reduce((sum, item) => sum + item.amount, 0);
  const attention = assignments.flatMap((assignment) => assignment.attention);
  if (expenses.length === 0 && billActive) attention.push("No expense automation linked");
  if (expenses.length > 1) attention.push("Multiple expense automations linked");
  if (statusMismatch) attention.push("Bill and automation status differ");

  let status: RecurringObligationStatus;
  if (statusMismatch) status = "mixed";
  else if (!active) status = "paused";
  else if (expenses.length > 0) status = "automated";
  else status = "tracked";

  return {
    id: `bill-${bill.id}`,
    conceptKey: canonicalConcept(bill.attributes.name),
    name: bill.attributes.name,
    active,
    status,
    amountMin: expenses.length > 0 ? configuredAmount : range.min,
    amountMax: expenses.length > 0 ? configuredAmount : range.max,
    amountSource: expenses.length > 0 ? "withdrawal" : "bill_range",
    currency: bill.attributes.currency_code ?? expenses[0]?.currency ?? "COP",
    nextDate: firstDate(activeExpenses.length > 0 ? activeExpenses : expenses) ??
      bill.attributes.next_expected_match ?? bill.attributes.date,
    frequency: expenses[0]?.frequency ?? bill.attributes.repeat_freq ?? "Recurring",
    source: aggregateField(expenses, "source"),
    destination: aggregateField(expenses, "destination"),
    category: aggregateField(expenses, "category"),
    budget: aggregateField(expenses, "budget"),
    bill,
    expenseAutomations: expenses,
    reserveAutomations: [],
    attention: Array.from(new Set(attention)),
    match: {
      billMethod: assignments[0]?.method,
      confidence: assignments.some((assignment) => assignment.confidence === "high")
        ? "high"
        : expenses.length > 0
          ? "exact"
          : "unmatched",
      candidateIds: Array.from(new Set(assignments.flatMap((assignment) => assignment.candidateIds))),
    },
  };
}

function obligationFromUnmatchedExpense(assignment: ExpenseAssignment): RecurringObligation {
  const item = assignment.item;
  return {
    id: `automation-${item.id}`,
    conceptKey: canonicalConcept(item.description) || canonicalConcept(item.title),
    name: item.description,
    active: item.active,
    status: item.active ? "untracked" : "paused",
    amountMin: item.amount,
    amountMax: item.amount,
    amountSource: "withdrawal",
    currency: item.currency,
    nextDate: item.nextDate,
    frequency: item.frequency,
    source: item.source,
    destination: item.destination,
    category: item.category,
    budget: item.budget,
    expenseAutomations: [item],
    reserveAutomations: [],
    attention: assignment.attention,
    match: {
      confidence: assignment.confidence,
      candidateIds: assignment.candidateIds,
    },
  };
}

function reserveMatchesExpense(
  reserve: ScheduledRecurringTransaction,
  obligation: RecurringObligation
) {
  const reserveConcept = canonicalConcept(reserve.description) || canonicalConcept(reserve.title);
  const reserveCard = reserveCardKey(reserve);
  if (!reserveConcept || !reserveCard) return false;

  return obligation.expenseAutomations.some((expense) => {
    const expenseCard = cardKey([
      obligation.name,
      expense.description,
      expense.title,
      expense.source,
    ]);
    const expenseConcepts = [obligation.name, expense.description, expense.title]
      .map(canonicalConcept)
      .filter(Boolean);
    return (
      expenseConcepts.includes(reserveConcept) &&
      expenseCard === reserveCard &&
      amountsMatch(reserve.amount, expense.amount) &&
      reserve.currency === expense.currency &&
      cadenceMatchesItems(reserve, expense)
    );
  });
}

function standaloneTransfer(
  item: ScheduledRecurringTransaction,
  status: "reserve_only" | "transfer_only",
  attention: string[],
  candidateIds: string[] = []
): RecurringObligation {
  return {
    id: `${status === "reserve_only" ? "reserve" : "transfer"}-${item.id}`,
    conceptKey: canonicalConcept(item.description) || canonicalConcept(item.title),
    name: item.description,
    active: item.active,
    status,
    amountMin: status === "transfer_only" ? item.amount : 0,
    amountMax: status === "transfer_only" ? item.amount : 0,
    amountSource: "none",
    currency: item.currency,
    nextDate: item.nextDate,
    frequency: item.frequency,
    source: item.source,
    destination: item.destination,
    expenseAutomations: [],
    reserveAutomations: status === "reserve_only" ? [item] : [],
    attention,
    match: {
      confidence: candidateIds.length > 1 ? "ambiguous" : "unmatched",
      candidateIds,
    },
  };
}

export function buildRecurringObligations(
  scheduledInput: readonly ScheduledRecurringTransaction[],
  billsInput: readonly Bill[]
) {
  const bills = [...billsInput].sort((a, b) => a.id.localeCompare(b.id));
  const scheduled = [...scheduledInput].sort((a, b) => a.id.localeCompare(b.id));
  const billById = new Map(bills.map((bill) => [bill.id, bill]));
  const billsByName = new Map<string, Bill[]>();
  for (const bill of bills) {
    const key = normalizeText(bill.attributes.name);
    billsByName.set(key, [...(billsByName.get(key) ?? []), bill]);
  }

  const expenseAssignments = scheduled
    .filter((item) => item.recurrenceType === "withdrawal")
    .map((item) => assignExpenseToBill(item, bills, billById, billsByName));
  const assignmentsByBill = new Map<string, ExpenseAssignment[]>();
  for (const assignment of expenseAssignments) {
    if (!assignment.bill) continue;
    assignmentsByBill.set(assignment.bill.id, [
      ...(assignmentsByBill.get(assignment.bill.id) ?? []),
      assignment,
    ]);
  }

  let obligations = bills.map((bill) =>
    obligationFromBill(bill, assignmentsByBill.get(bill.id) ?? [])
  );
  obligations.push(
    ...expenseAssignments
      .filter((assignment) => !assignment.bill)
      .map(obligationFromUnmatchedExpense)
  );

  const reserveAssignments = new Map<string, ScheduledRecurringTransaction[]>();
  const standaloneTransfers: RecurringObligation[] = [];
  for (const transfer of scheduled.filter((item) => item.recurrenceType === "transfer")) {
    if (!isCardReserve(transfer)) {
      standaloneTransfers.push(
        standaloneTransfer(
          transfer,
          "transfer_only",
          ["Transfer is not a verified card reserve"]
        )
      );
      continue;
    }

    if (transfer.billId) {
      const direct = obligations.find((obligation) => obligation.bill?.id === transfer.billId);
      if (direct) {
        reserveAssignments.set(direct.id, [
          ...(reserveAssignments.get(direct.id) ?? []),
          transfer,
        ]);
        continue;
      }
    }

    const candidates = obligations.filter((obligation) =>
      reserveMatchesExpense(transfer, obligation)
    );
    if (candidates.length === 1) {
      const [obligation] = candidates;
      reserveAssignments.set(obligation.id, [
        ...(reserveAssignments.get(obligation.id) ?? []),
        transfer,
      ]);
    } else {
      standaloneTransfers.push(
        standaloneTransfer(
          transfer,
          "reserve_only",
          [
            candidates.length > 1
              ? "Card reserve match is ambiguous"
              : "Card reserve is not linked to an expense",
          ],
          candidates.map((candidate) => candidate.id)
        )
      );
    }
  }

  obligations = obligations.map((obligation) => {
    const reserves = reserveAssignments.get(obligation.id) ?? [];
    if (reserves.length === 0) return obligation;
    return {
      ...obligation,
      reserveAutomations: reserves,
      attention:
        reserves.length > 1
          ? [...obligation.attention, "Multiple card reserve automations linked"]
          : obligation.attention,
      match: {
        ...obligation.match,
        reserveMethod: reserves.some((reserve) => reserve.billId)
          ? "bill_id"
          : "card_concept",
      },
    };
  });

  return [...obligations, ...standaloneTransfers].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (
      timestamp(a.nextDate) - timestamp(b.nextDate) ||
      a.conceptKey.localeCompare(b.conceptKey) ||
      a.id.localeCompare(b.id)
    );
  });
}
