import assert from "node:assert/strict";
import { test } from "node:test";
import { activityPeriodHref, activityPeriodLabel, monthRange, parseMonth } from "../lib/activity-period.ts";

test("month boundaries include leap years and early years", () => {
  assert.deepEqual(monthRange(2024, 2), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(monthRange(2023, 2), { start: "2023-02-01", end: "2023-02-28" });
  assert.deepEqual(monthRange(2023, 12), { start: "2023-12-01", end: "2023-12-31" });
  assert.deepEqual(monthRange(1, 1), { start: "0001-01-01", end: "0001-01-31" });
  assert.equal(parseMonth("2024-13"), null);
  assert.equal(parseMonth("0000-01"), null);
});

test("changing periods preserves filters, search and origin while resetting pagination", () => {
  const original = new URLSearchParams({ q: "synthetic", type: "withdrawal", account: "Fake account", category: "Fake category", tag: "fake", from: "/categories?start=2024-01-01", page: "7", view: "all", month: "2025-10" });
  const month = new URL(activityPeriodHref("/transactions", original.toString(), { year: 2011, month: 2 }), "http://localhost").searchParams;
  for (const key of ["q", "type", "account", "category", "tag", "from"]) assert.equal(month.get(key), original.get(key));
  assert.equal(month.get("start"), "2011-02-01");
  assert.equal(month.get("end"), "2011-02-28");
  for (const key of ["page", "view", "month"]) assert.equal(month.has(key), false);
  const all = new URL(activityPeriodHref("/transactions", month.toString(), "all"), "http://localhost").searchParams;
  assert.equal(all.get("view"), "all");
  assert.equal(all.has("start"), false);
  assert.equal(all.has("end"), false);
  assert.equal(all.get("from"), original.get("from"));
});

test("custom and open intervals use exact labels, whole months use month labels", () => {
  assert.equal(activityPeriodLabel(new URLSearchParams("start=2024-01-10&end=2024-02-12"), 2024, 1), "From 2024-01-10 to 2024-02-12");
  assert.equal(activityPeriodLabel(new URLSearchParams("start=2024-01-10"), 2024, 1), "From 2024-01-10");
  assert.equal(activityPeriodLabel(new URLSearchParams("end=2024-02-12"), 2024, 2), "Through 2024-02-12");
  assert.equal(activityPeriodLabel(new URLSearchParams("start=2024-02-01&end=2024-02-29"), 2024, 2, "en-US"), "February 2024");
});
