import assert from "node:assert/strict";
import test from "node:test";
import { transactionReturnHref } from "../lib/transactions-navigation.ts";

const month = { start: "2026-01-01", end: "2026-01-31" };

test("direct category month links survive transaction detail and Back", () => {
  assert.equal(transactionReturnHref("/categories/42?month=2011-04&unknown=discard"), "/categories/42?month=2011-04");
});

test("each entity origin keeps its month or All view and drops unrelated query keys", () => {
  for (const path of ["/budgets/demo-budget", "/categories/42", "/accounts/demo_account"]) {
    for (const period of [month, { view: "all" }]) {
      const source = new URLSearchParams({ ...period, q: "ignored", returnTo: "https://example.invalid", journal: "ignored" });
      assert.equal(transactionReturnHref(`${path}?${source}`), `${path}?${new URLSearchParams(period)}`);
    }
    assert.equal(transactionReturnHref(path), path);
  }
});

test("the transaction list keeps every applied filter and search characters", () => {
  const context = { ...month, q: "coffee? & café #1", type: "withdrawal", account: "Demo Checking", category: "Food", tag: "home" };
  const source = new URLSearchParams({ ...context, unknown: "discard", returnTo: "/" });
  assert.equal(transactionReturnHref(`/transactions?${source}`), `/transactions?${new URLSearchParams(context)}`);
  assert.equal(transactionReturnHref("/transactions?view=all&q=one?two"), "/transactions?view=all&q=one%3Ftwo");
});

test("Dashboard recent activity returns to Dashboard without query state", () => {
  assert.equal(transactionReturnHref("/"), "/");
  assert.equal(transactionReturnHref("/?view=all&returnTo=https://example.invalid"), "/");
});

test("direct and unsupported return destinations fall back to the local list", () => {
  for (const value of [
    undefined, "", "https://example.invalid", "https://example.invalid/budgets/1",
    "//example.invalid", "javascript:alert(1)", "/\\example.invalid", "/login",
    "/transactions/1", "/transactions-extra", "/transactions/../login", "/budgets",
    "/budgets/1/extra", "/budgets/../login", "/budgets/%2e%2e", "/budgets/1%2F..",
    "/categories/1\\..", "/accounts//example.invalid", "/debts/demo-card", "/#dashboard",
  ]) {
    assert.equal(transactionReturnHref(value), "/transactions", String(value));
  }
});
