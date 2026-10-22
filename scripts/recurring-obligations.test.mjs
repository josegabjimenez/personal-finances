import assert from "node:assert/strict";
import test from "node:test";
import { buildRecurringObligations } from "../lib/firefly/recurring-obligations.ts";

// Entirely invented fixtures: no Firefly exports, credentials, or network calls.
const nextDate = "2030-05-15T12:00:00-05:00";

function bill(id, name, min, max = min) {
  return {
    type: "bills",
    id,
    attributes: {
      name,
      active: true,
      amount_min: String(min),
      amount_max: String(max),
      currency_code: "COP",
      repeat_freq: "monthly",
      next_expected_match: nextDate,
    },
  };
}

function scheduled(id, description, amount, overrides = {}) {
  return {
    id,
    recurrenceId: `demo-schedule-${id}`,
    title: description,
    description,
    recurrenceType: "withdrawal",
    active: true,
    applyRules: false,
    amount,
    currency: "COP",
    source: "Demo cash account",
    destination: "Demo merchant",
    tags: [],
    frequency: "Monthly",
    cadenceType: "monthly",
    cadenceMoment: "15",
    nextDate,
    ...overrides,
  };
}

function activeCopRange(obligations) {
  const active = obligations.filter((item) => item.active && item.currency === "COP");
  return {
    min: active.reduce((total, item) => total + item.amountMin, 0),
    max: active.reduce((total, item) => total + item.amountMax, 0),
  };
}

test("a linked bill and expense automation represent one COP 100,000 obligation", () => {
  const internet = bill("demo-internet-bill", "Demo Internet", 96_000, 104_000);
  const expense = scheduled("demo-internet-expense", "Demo Internet", 100_000, {
    billId: internet.id,
  });

  const obligations = buildRecurringObligations([expense], [internet]);

  assert.equal(obligations.length, 1, "the bill must not become a second expense");
  const [obligation] = obligations;
  assert.equal(obligation.bill?.id, internet.id, "retain the original bill association");
  assert.deepEqual(obligation.expenseAutomations.map((item) => item.id), [expense.id]);
  assert.equal(obligation.amountSource, "withdrawal");
  assert.deepEqual(activeCopRange(obligations), { min: 100_000, max: 100_000 },
    "the scheduled payment replaces the bill estimate instead of being added to it");
  assert.equal(obligation.match.confidence, "exact");
  assert.deepEqual(obligation.attention, [], "compatible explicit links need no reconciliation");
});

test("a matched card reserve does not add a second COP 42,000 expense", () => {
  const subscription = bill("demo-video-bill", "Demo Video Service TC99", 42_000);
  const expense = scheduled("demo-video-expense", "Demo Video Service TC99", 42_000, {
    billId: subscription.id,
    source: "Demo card TC99",
  });
  const reserve = scheduled("demo-video-reserve", "Reserva TC99 Demo Video Service", 42_000, {
    recurrenceType: "transfer",
    destination: "Savings for TC99",
  });
  const withoutReserve = buildRecurringObligations([expense], [subscription]);

  for (const matchedReserve of [reserve, { ...reserve, billId: subscription.id }]) {
    const obligations = buildRecurringObligations([matchedReserve, expense], [subscription]);

    assert.equal(obligations.length, 1, "a verified reserve belongs inside the existing obligation");
    const [obligation] = obligations;
    assert.deepEqual(obligation.reserveAutomations.map((item) => item.id), [reserve.id],
      "the reserve must be retained and linked, not silently discarded");
    assert.deepEqual(obligation.expenseAutomations.map((item) => item.id), [expense.id]);
    assert.equal(obligation.bill?.id, subscription.id);
    assert.deepEqual(activeCopRange(obligations), { min: 42_000, max: 42_000 });
    assert.deepEqual(activeCopRange(obligations), activeCopRange(withoutReserve),
      "moving money to a reserve must not increase the expense total");
    assert.deepEqual(obligation.attention, []);
  }
});

test("two compatible bill candidates leave the COP 75,000 expense visibly unresolved", () => {
  const firstBill = bill("demo-phone-bill-a", "Demo Phone Service", 75_000);
  const secondBill = bill("demo-phone-bill-b", "Demo Phone Service", 75_000);
  const expense = scheduled("demo-phone-expense", "Demo Phone Service", 75_000);

  const obligations = buildRecurringObligations([expense], [secondBill, firstBill]);

  assert.equal(obligations.length, 3, "both candidate bills and the unresolved expense must remain visible");
  const owners = obligations.filter((item) => item.expenseAutomations.some((entry) => entry.id === expense.id));
  assert.equal(owners.length, 1, "the expense must neither disappear nor be assigned twice");
  const [unresolved] = owners;
  assert.equal(unresolved.bill, undefined, "do not choose a bill when evidence is ambiguous");
  assert.equal(unresolved.status, "untracked");
  assert.equal(unresolved.match.confidence, "ambiguous");
  assert.deepEqual(new Set(unresolved.match.candidateIds), new Set([firstBill.id, secondBill.id]));
  assert.ok(unresolved.attention.length > 0, "the user must receive a reconciliation warning");
  assert.equal(unresolved.currency, "COP");
  assert.equal(unresolved.amountMin, 75_000);
  assert.equal(unresolved.amountMax, 75_000);

  const candidateBills = obligations.filter((item) => item.bill);
  assert.deepEqual(new Set(candidateBills.map((item) => item.bill.id)), new Set([firstBill.id, secondBill.id]));
  assert.ok(candidateBills.every((item) => item.expenseAutomations.length === 0),
    "neither candidate may silently claim the ambiguous automation");
});
