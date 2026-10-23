# Transaction navigation UX batch

Approved source tasks: [keep the transaction view](https://www.notion.so/402fcdfcb7b481b38eabc71735e2cc33), [see and clear filters](https://www.notion.so/402fcdfcb7b481a68aa1e56c22a628c9), [open dashboard totals](https://www.notion.so/402fcdfcb7b48147b3bec77fdf43106c).

## Delivered behavior

- Transaction rows carry the applied list period/All view, search, type, account, category, and tag into detail Back links. Journal or fallback split identity remains intact. Direct and failed detail visits have a local `/transactions` fallback; return destinations are restricted to that exact list path and its known query keys.
- Applied type/account/category/tag filters appear as readable, removable chips above results. **Clear filters** keeps the selected period/All view and search. A normal month does not mark the Filters button active. Reopening the sheet resets canceled drafts and uses the latest intended filters; delayed search responses preserve newer typing and filter changes.
- The complete monthly Income and Spent cards link to deposits and withdrawals for the exact date range used by their summary request. Visible link text, native keyboard navigation, and focus styles make the action discoverable. Values, currencies, and summary calculations are unchanged.

## Verification · 2026-10-22

The exact product source passed full ESLint, webpack production build, and `tsc --noEmit` in an isolated copy. Next used its bundled local font fixture. A temporary browser runner reused the existing transaction-loading verification setup, fake authentication, and local fake Firefly responses; no new test framework or product harness route was added.

Headless Chromium 145.0.7632.6 passed these focused route scenarios with the production service worker enabled:

1. Historical month and All view → a selected grouped split → Back: period, search, all four filters, and journal identity retained. A row without a journal retained its split index.
2. Direct details and a synthetic failed detail: safe Back targets; external URLs, protocol URLs, alternate paths, and unknown return query keys were rejected or discarded.
3. Each chip removed only its own filter. Clear from the list and sheet preserved the month/All view and search. Plain month dates produced no chip or active-filter ring.
4. Month navigation, cancel/reopen, and applying dates from All kept the period and filter sheet coherent.
5. A delayed older search response preserved newer typing; browser Back synchronized the input.
6. Typing alongside delayed chip removal, Apply, and immediate sheet reopening preserved the intended filters. The temporary loopback gateway delayed navigation responses without changing the app service worker.
7. Dashboard totals kept the synthetic displayed amounts and matched the summary month; keyboard Enter opened Income/deposits and mobile tap opened Spent/withdrawals. Mobile chip removal worked; the 390px layout had no horizontal overflow.

There were no uncaught browser errors. [Compact synthetic observations](./transactions-navigation-observations.json) retain the scenario names. Both synthetic screenshots were visually inspected. Independent review found and resolved search/filter timing cases and finished with no remaining actionable findings.

## Review steps

1. Open a historical month or All transactions, enter a search, and apply type/account/category/tag filters. Open a row, then use **Back**. The same view and filters should remain.
2. Remove a chip, then use **Clear filters**. Search and the period should stay. Navigate to another month and reopen Filters; dates should follow the new month and canceled edits should be gone.
3. From Dashboard, activate **Income this month** or **Spent this month** by click, touch, or keyboard. Confirm the displayed month and Income/Expenses chip match the selected total.

Only synthetic data was used. Live Firefly records, production connectivity, and production financial totals were not tested. Existing middleware deprecation and transitive `jose` compression warnings remain nonfatal. Automatic preview status is reported against the PR's final commit; production release remains a separate review action.
