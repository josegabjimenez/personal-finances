import "server-only";

import { endOfMonth, startOfMonth, toYMD } from "@/lib/format";
import { fireflyFetch } from "./client";
import { accountsListSchema, transactionsListSchema, type Account, type TransactionGroup, type TransactionSplit } from "./types";

export const CREDIT_CARDS = [
  { key: "tc1", label: "TC1", name: "TC1 - Deuda", accountId: "88", reserveName: "Savings for TC1" },
  { key: "tc2", label: "TC2", name: "TC2 - Deuda", accountId: "89", reserveName: "Savings for TC 2" },
] as const;

export const LOAN_DEBTS = [
  { accountId: "90", name: "Lulo Bank - Crédito", purpose: "MacBook / phone", monthlyInterestRate: 0.0187, monthlyPayment: 206_004 },
  { accountId: "93", name: "préstamo doña Lily - electrodomésticos", purpose: "Appliances", monthlyInterestRate: 0, monthlyPayment: 500_000 },
] as const;

const DEFAULT_CURRENCY = "COP";
const INTEREST_FEE_RE = /inter[eé]s|intereses|interest|fee|fees|comisi[oó]n|commission|cuota\s+manejo|seguro|insurance|penalidad|penalty/i;
const UNASSIGNED = "Unassigned";

export type CreditCardKey = (typeof CREDIT_CARDS)[number]["key"];
type CreditCardConfig = (typeof CREDIT_CARDS)[number];

type DebtStatus = "covered" | "under_reserved" | "over_reserved" | "no_debt";
type LoanPaymentStatus = "paid_this_month" | "partial_payment" | "due" | "unknown";

export interface DebtPeriod {
  start: string;
  end: string;
}

export interface DebtBreakdownItem {
  name: string;
  amount: number;
  count: number;
}

export interface DebtRecentTransaction {
  id: string;
  groupId: string;
  date: string;
  description: string;
  type: string;
  amount: number;
  currency: string;
  cardKey: CreditCardKey;
  cardName: string;
  sourceName?: string | null;
  destinationName?: string | null;
  categoryName?: string | null;
  budgetName?: string | null;
  tags?: string[] | null;
  kind: "purchase" | "reservation" | "payment" | "interest_fee";
}

export interface CreditCardDebtMetrics {
  key: CreditCardKey;
  label: string;
  name: string;
  accountId: string;
  reserveName: string;
  found: boolean;
  reserveFound: boolean;
  currency: string;
  debt: number;
  reserved: number;
  gap: number;
  coverage: number | null;
  status: DebtStatus;
  monthlyPurchases: number;
  monthlyPayments: number;
  monthlyReservations: number;
  monthlyInterestFees: number;
  byCategory: DebtBreakdownItem[];
  byBudget: DebtBreakdownItem[];
  recentTransactions: DebtRecentTransaction[];
  transactions: DebtRecentTransaction[];
}

export interface OtherLiabilityDebt {
  id: string;
  name: string;
  currency: string;
  debt: number;
  liabilityType?: string | null;
}

export interface LoanPeriodPayment {
  id: string;
  groupId: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  sourceName?: string | null;
  destinationName?: string | null;
}

export interface LoanDebtMetrics extends OtherLiabilityDebt {
  purpose?: string | null;
  monthlyPayment?: number | null;
  monthlyInterestRate?: number | null;
  estimatedMonthlyInterest: number;
  estimatedMonthlyPrincipal: number;
  estimatedMonthsRemaining: number | null;
  paymentsThisPeriod: number;
  latestPeriodPayment: LoanPeriodPayment | null;
  status: LoanPaymentStatus;
}

export interface DebtDashboardResponse {
  asOf: string;
  monthStart: string;
  monthEnd: string;
  currency: string;
  cards: CreditCardDebtMetrics[];
  loans: LoanDebtMetrics[];
  transactions: DebtRecentTransaction[];
  otherLiabilities: OtherLiabilityDebt[];
  missingAccounts: string[];
  totals: {
    totalDebt: number;
    creditCardDebt: number;
    loanDebt: number;
    totalReserved: number;
    cardReserveGap: number;
    totalGap: number;
    monthlyCardPurchases: number;
    monthlyCardPayments: number;
    monthlyCardReservations: number;
    monthlyLoanPayments: number;
    scheduledLoanPayments: number;
    monthlyInterestFees: number;
    estimatedLoanInterest: number;
    monthlyPurchases: number;
    monthlyPayments: number;
    monthlyReservations: number;
    otherLiabilitiesDebt: number;
  };
}

export function defaultDebtPeriod(now = new Date()): DebtPeriod {
  return { start: toYMD(startOfMonth(now)), end: toYMD(endOfMonth(now)) };
}

export function monthPeriodFromYMD(ymd: string): DebtPeriod | null {
  const match = /^(\d{4})-(\d{2})/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  const month = new Date(year, monthIndex, 1);
  return { start: toYMD(startOfMonth(month)), end: toYMD(endOfMonth(month)) };
}

export function normalizeDebtPeriod(input?: { start?: string | null; end?: string | null; month?: string | null }, now = new Date()): DebtPeriod {
  const fromMonth = input?.month ? monthPeriodFromYMD(input.month) : null;
  if (fromMonth) return fromMonth;

  const start = input?.start && /^\d{4}-\d{2}-\d{2}$/.test(input.start) ? input.start : null;
  const end = input?.end && /^\d{4}-\d{2}-\d{2}$/.test(input.end) ? input.end : null;
  if (start && end && start <= end) return { start, end };
  if (start) return { start, end: toYMD(endOfMonth(new Date(`${start}T00:00:00`))) };
  return defaultDebtPeriod(now);
}

export function shiftDebtPeriod(period: DebtPeriod, months: number): DebtPeriod {
  const d = new Date(`${period.start}T00:00:00`);
  const shifted = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return { start: toYMD(startOfMonth(shifted)), end: toYMD(endOfMonth(shifted)) };
}

function parseMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function absMoney(value: string | number | null | undefined) {
  return Math.abs(parseMoney(value));
}

function namesEqual(a: string | null | undefined, b: string) {
  return (a ?? "").trim().toLocaleLowerCase("es-CO") === b.trim().toLocaleLowerCase("es-CO");
}

function getAccountCurrency(account?: Account | null) {
  return account?.attributes.currency_code ?? DEFAULT_CURRENCY;
}

async function listAccountsByType(type: "asset" | "liability", limit: number) {
  const raw = await fireflyFetch("/accounts", {
    searchParams: { type, limit },
    revalidate: 60,
    tags: ["accounts"],
  });
  return accountsListSchema.parse(raw).data;
}

async function listTransactionsForRange(start: string, end: string, limit: number) {
  const firstRaw = await fireflyFetch("/transactions", {
    searchParams: { start, end, limit, page: 1 },
    revalidate: 30,
    tags: ["transactions"],
  });
  const first = transactionsListSchema.parse(firstRaw);
  const totalPages = first.meta?.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fireflyFetch("/transactions", {
        searchParams: { start, end, limit, page: index + 2 },
        revalidate: 30,
        tags: ["transactions"],
      }).then((raw) => transactionsListSchema.parse(raw).data)
    )
  );
  return [first.data, ...rest].flat();
}

function flattenSplits(groups: TransactionGroup[]) {
  return groups.flatMap((group) =>
    group.attributes.transactions.map((split, index) => ({
      groupId: group.id,
      splitId: `${group.id}:${index}`,
      split,
    }))
  );
}

function addBreakdown(map: Map<string, DebtBreakdownItem>, name: string | null | undefined, amount: number) {
  const key = name?.trim() || UNASSIGNED;
  const current = map.get(key) ?? { name: key, amount: 0, count: 0 };
  current.amount += amount;
  current.count += 1;
  map.set(key, current);
}

function sortedBreakdown(map: Map<string, DebtBreakdownItem>, limit?: number) {
  const items = [...map.values()].sort((a, b) => b.amount - a.amount);
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

function descriptionMentionsCard(description: string, card: CreditCardConfig) {
  const normalized = description.toLocaleLowerCase("es-CO");
  return normalized.includes(`(${card.label.toLocaleLowerCase("es-CO")})`) || normalized.includes(card.label.toLocaleLowerCase("es-CO"));
}

function classifyCardTransaction(split: TransactionSplit, card: CreditCardConfig) {
  const description = split.description ?? "";
  if (split.type === "withdrawal" && namesEqual(split.source_name, card.name)) {
    if (INTEREST_FEE_RE.test(description)) return "interest_fee" as const;
    return "purchase" as const;
  }
  if (split.type === "withdrawal" && descriptionMentionsCard(description, card) && INTEREST_FEE_RE.test(description)) {
    return "interest_fee" as const;
  }
  if (split.type === "transfer" && namesEqual(split.destination_name, card.reserveName)) {
    return "reservation" as const;
  }
  if (split.type === "transfer" && namesEqual(split.destination_name, card.name)) {
    return "payment" as const;
  }
  return null;
}

function getStatus(debt: number, reserved: number): DebtStatus {
  if (debt <= 0) return "no_debt";
  if (Math.abs(reserved - debt) < 1) return "covered";
  if (reserved > debt) return "over_reserved";
  return "under_reserved";
}

function isLoanLiability(account: Account) {
  const liabilityType = account.attributes.liability_type?.toLocaleLowerCase("es-CO") ?? "";
  return /loan|debt|mortgage|cr[eé]dito|prestamo|pr[eé]stamo/.test(liabilityType);
}

function getLoanConfig(account: Account) {
  return LOAN_DEBTS.find((loan) => loan.accountId === account.id || namesEqual(account.attributes.name, loan.name));
}

function isPaymentTowardLiability(split: TransactionSplit, account: Account) {
  if (split.type !== "transfer" && split.type !== "deposit") return false;
  return split.destination_id === account.id || namesEqual(split.destination_name, account.attributes.name);
}

function getLoanStatus(paymentsThisPeriod: number, monthlyPayment?: number | null): LoanPaymentStatus {
  if (!monthlyPayment || monthlyPayment <= 0) return paymentsThisPeriod > 0 ? "paid_this_month" : "unknown";
  if (paymentsThisPeriod >= monthlyPayment) return "paid_this_month";
  if (paymentsThisPeriod > 0) return "partial_payment";
  return "due";
}

function buildLoanMetrics(account: Account, groups: TransactionGroup[]): LoanDebtMetrics {
  const config = getLoanConfig(account);
  const currency = getAccountCurrency(account);
  const debt = absMoney(account.attributes.current_balance);
  const payments: LoanPeriodPayment[] = [];

  for (const { groupId, splitId, split } of flattenSplits(groups)) {
    if (!isPaymentTowardLiability(split, account)) continue;
    payments.push({
      id: splitId || groupId,
      groupId,
      date: split.date,
      description: split.description || "Loan payment",
      amount: absMoney(split.amount),
      currency: split.currency_code ?? currency,
      sourceName: split.source_name,
      destinationName: split.destination_name,
    });
  }

  payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const monthlyInterestRate = config?.monthlyInterestRate ?? null;
  const monthlyPayment = config?.monthlyPayment ?? null;
  const estimatedMonthlyInterest = monthlyInterestRate ? debt * monthlyInterestRate : 0;
  const estimatedMonthlyPrincipal = monthlyPayment ? Math.max(monthlyPayment - estimatedMonthlyInterest, 0) : 0;

  return {
    id: account.id,
    name: account.attributes.name,
    currency,
    debt,
    liabilityType: account.attributes.liability_type,
    purpose: config?.purpose ?? null,
    monthlyPayment,
    monthlyInterestRate,
    estimatedMonthlyInterest,
    estimatedMonthlyPrincipal,
    estimatedMonthsRemaining: estimatedMonthlyPrincipal > 0 ? Math.ceil(debt / estimatedMonthlyPrincipal) : null,
    paymentsThisPeriod: payments.reduce((sum, payment) => sum + payment.amount, 0),
    latestPeriodPayment: payments[0] ?? null,
    status: getLoanStatus(payments.reduce((sum, payment) => sum + payment.amount, 0), monthlyPayment),
  };
}

function buildCardMetrics(
  card: CreditCardConfig,
  liabilities: Account[],
  assets: Account[],
  groups: TransactionGroup[]
): CreditCardDebtMetrics {
  const liability = liabilities.find((a) => a.id === card.accountId) ?? liabilities.find((a) => namesEqual(a.attributes.name, card.name));
  const reserve = assets.find((a) => namesEqual(a.attributes.name, card.reserveName));
  const currency = getAccountCurrency(liability ?? reserve);
  const debt = absMoney(liability?.attributes.current_balance);
  const reserved = absMoney(reserve?.attributes.current_balance);
  const byCategory = new Map<string, DebtBreakdownItem>();
  const byBudget = new Map<string, DebtBreakdownItem>();
  const transactions: DebtRecentTransaction[] = [];
  let monthlyPurchases = 0;
  let monthlyPayments = 0;
  let monthlyReservations = 0;
  let monthlyInterestFees = 0;

  for (const { groupId, splitId, split } of flattenSplits(groups)) {
    const kind = classifyCardTransaction(split, card);
    if (!kind) continue;
    const amount = absMoney(split.amount);
    if (kind === "purchase") {
      monthlyPurchases += amount;
      addBreakdown(byCategory, split.category_name, amount);
      addBreakdown(byBudget, split.budget_name, amount);
    } else if (kind === "interest_fee") {
      monthlyInterestFees += amount;
      addBreakdown(byCategory, split.category_name ?? "Interest & fees", amount);
      addBreakdown(byBudget, split.budget_name, amount);
    } else if (kind === "payment") {
      monthlyPayments += amount;
    } else {
      monthlyReservations += amount;
    }

    transactions.push({
      id: splitId || groupId,
      groupId,
      date: split.date,
      description: split.description || "No description",
      type: split.type,
      amount,
      currency: split.currency_code ?? currency,
      cardKey: card.key,
      cardName: card.name,
      sourceName: split.source_name,
      destinationName: split.destination_name,
      categoryName: split.category_name,
      budgetName: split.budget_name,
      tags: split.tags,
      kind,
    });
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const gap = debt - reserved;
  return {
    key: card.key,
    label: card.label,
    name: card.name,
    accountId: card.accountId,
    reserveName: card.reserveName,
    found: Boolean(liability),
    reserveFound: Boolean(reserve),
    currency,
    debt,
    reserved,
    gap,
    coverage: debt > 0 ? reserved / debt : null,
    status: getStatus(debt, reserved),
    monthlyPurchases,
    monthlyPayments,
    monthlyReservations,
    monthlyInterestFees,
    byCategory: sortedBreakdown(byCategory),
    byBudget: sortedBreakdown(byBudget),
    recentTransactions: transactions.slice(0, 6),
    transactions,
  };
}

export async function getDebtDashboard(input?: { start?: string | null; end?: string | null; month?: string | null }, now = new Date()): Promise<DebtDashboardResponse> {
  const period = normalizeDebtPeriod(input, now);
  const [liabilities, assets, transactionGroups] = await Promise.all([
    listAccountsByType("liability", 100),
    listAccountsByType("asset", 200),
    listTransactionsForRange(period.start, period.end, 100),
  ]);

  const cards = CREDIT_CARDS.map((card) => buildCardMetrics(card, liabilities, assets, transactionGroups));
  const transactions = cards.flatMap((card) => card.transactions).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const cardIds = new Set(cards.map((card) => card.accountId));
  const cardNames = new Set(cards.map((card) => card.name.toLocaleLowerCase("es-CO")));
  const nonCardLiabilities = liabilities
    .filter((account) => !cardIds.has(account.id) && !cardNames.has(account.attributes.name.toLocaleLowerCase("es-CO")))
    .filter((account) => absMoney(account.attributes.current_balance) > 0);
  const loans = nonCardLiabilities
    .filter((account) => getLoanConfig(account) || isLoanLiability(account))
    .map((account) => buildLoanMetrics(account, transactionGroups))
    .sort((a, b) => b.debt - a.debt);
  const loanIds = new Set(loans.map((loan) => loan.id));
  const otherLiabilities = nonCardLiabilities
    .filter((account) => !loanIds.has(account.id))
    .map((account) => ({
      id: account.id,
      name: account.attributes.name,
      currency: account.attributes.currency_code ?? DEFAULT_CURRENCY,
      debt: absMoney(account.attributes.current_balance),
      liabilityType: account.attributes.liability_type,
    }))
    .sort((a, b) => b.debt - a.debt);

  const missingAccounts = cards.flatMap((card) => [
    ...(card.found ? [] : [card.name]),
    ...(card.reserveFound ? [] : [card.reserveName]),
  ]);
  const currency = cards.find((card) => card.currency)?.currency ?? loans[0]?.currency ?? otherLiabilities[0]?.currency ?? DEFAULT_CURRENCY;
  const cardDebt = cards.reduce((sum, card) => sum + card.debt, 0);
  const totalReserved = cards.reduce((sum, card) => sum + card.reserved, 0);
  const cardReserveGap = Math.max(cardDebt - totalReserved, 0);
  const loanDebt = loans.reduce((sum, item) => sum + item.debt, 0);
  const otherLiabilitiesDebt = otherLiabilities.reduce((sum, item) => sum + item.debt, 0);
  const monthlyCardPurchases = cards.reduce((sum, card) => sum + card.monthlyPurchases, 0);
  const monthlyCardPayments = cards.reduce((sum, card) => sum + card.monthlyPayments, 0);
  const monthlyCardReservations = cards.reduce((sum, card) => sum + card.monthlyReservations, 0);
  const monthlyLoanPayments = loans.reduce((sum, loan) => sum + loan.paymentsThisPeriod, 0);

  return {
    asOf: now.toISOString(),
    monthStart: period.start,
    monthEnd: period.end,
    currency,
    cards,
    loans,
    transactions,
    otherLiabilities,
    missingAccounts,
    totals: {
      totalDebt: cardDebt + loanDebt + otherLiabilitiesDebt,
      creditCardDebt: cardDebt,
      loanDebt,
      totalReserved,
      cardReserveGap,
      totalGap: cardReserveGap,
      monthlyCardPurchases,
      monthlyCardPayments,
      monthlyCardReservations,
      monthlyLoanPayments,
      scheduledLoanPayments: loans.reduce((sum, loan) => sum + (loan.monthlyPayment ?? 0), 0),
      monthlyInterestFees: cards.reduce((sum, card) => sum + card.monthlyInterestFees, 0),
      estimatedLoanInterest: loans.reduce((sum, loan) => sum + loan.estimatedMonthlyInterest, 0),
      monthlyPurchases: monthlyCardPurchases,
      monthlyPayments: monthlyCardPayments,
      monthlyReservations: monthlyCardReservations,
      otherLiabilitiesDebt,
    },
  };
}
