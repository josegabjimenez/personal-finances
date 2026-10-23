# Transaction navigation UX batch

Approved source tasks: [keep the transaction view](https://www.notion.so/402fcdfcb7b481b38eabc71735e2cc33), [see and clear filters](https://www.notion.so/402fcdfcb7b481a68aa1e56c22a628c9), [open dashboard totals](https://www.notion.so/402fcdfcb7b48147b3bec77fdf43106c).

## Delivered behavior

- Transaction rows carry their originating page into detail Back links: Transactions, a budget, a category, an account, or Dashboard recent activity. Transactions retains period/All view, search, type, account, category, and tag; entity pages retain their selected month/date range or All view. Journal or fallback split identity remains intact. Copied detail links keep this explicit return context, including on errors. Direct details without context fall back to `/transactions`.
- Applied type/account/category/tag filters appear as readable, removable chips above results. **Clear filters** keeps the selected period/All view and search. A normal month does not mark the Filters button active. Reopening the sheet resets canceled drafts and uses the latest intended filters; delayed search responses preserve newer typing and filter changes.
- The complete monthly Income and Spent cards link to deposits and withdrawals for the exact date range used by their summary request. Visible link text, native keyboard navigation, and focus styles make the action discoverable. Values, currencies, and summary calculations are unchanged.

Return destinations are restricted to `/`, `/transactions`, and one safe ID segment under `/budgets/`, `/categories/`, or `/accounts/`. Only the relevant query keys are rebuilt for each route; Dashboard takes no query. Unsupported routes, external URLs, traversal, and extra path segments fall back to `/transactions`. Browser history is not used to choose the destination.

## Verification · 2026-10-23

The exact product source passed full ESLint, webpack production build, and `tsc --noEmit` in an isolated copy. `npm run test:transaction-navigation` passed four focused helper tests for route-specific query preservation, search encoding, Dashboard, and unsafe/unsupported fallbacks. Next used its bundled local font fixture. The existing temporary navigation runner was extended with synthetic entity endpoints and reused fake authentication and local fake Firefly responses; no new test framework or product harness route was added.

Headless Chromium 145.0.7632.6 passed these focused route scenarios with the production service worker enabled:

1. Historical month and All view → a selected grouped split → Back: period, search, all four filters, and journal identity retained. A row without a journal retained its split index.
2. Budget, category, and account detail pages in a historical month and All view → selected grouped split → Back: exact origin and period retained. All views also loaded page two; newly fetched rows kept their fallback split index and the same origin. Fake upstream requests confirmed the historical range and page-two fetches.
3. Dashboard recent activity → copied detail URL in a fresh tab → Back returned to Dashboard. Failed details retained each allowed origin and returned there on click.
4. Direct details and a synthetic failed detail: safe Back targets; external URLs, protocol URLs, traversal, alternate/extra paths, and unknown return query keys were rejected or discarded.
5. Each chip removed only its own filter. Clear from the list and sheet preserved the month/All view and search. Plain month dates produced no chip or active-filter ring.
6. Month navigation, cancel/reopen, and applying dates from All kept the period and filter sheet coherent.
7. A delayed older search response preserved newer typing; browser Back synchronized the input.
8. Typing alongside delayed chip removal, Apply, and immediate sheet reopening preserved the intended filters. The temporary loopback gateway delayed navigation responses without changing the app service worker.
9. Dashboard totals kept the synthetic displayed amounts and matched the summary month; keyboard Enter opened Income/deposits and mobile tap opened Spent/withdrawals. Mobile chip removal worked; the 390px layout had no horizontal overflow.

There were no uncaught browser errors. [Compact synthetic observations](./transactions-navigation-observations.json) retain the scenario names. Both synthetic screenshots were visually inspected. Independent review found and resolved search/filter timing cases and finished with no remaining actionable findings.

## Review steps

1. Open a historical month or All transactions, enter a search, and apply type/account/category/tag filters. Open a row, then use **Back**. The same view and filters should remain.
2. Open a budget, category, or account in a historical month or All view. Open a transaction, then use **Back**. The same page and period should return. Repeat from Dashboard recent activity; **Back** should return to Dashboard.
3. Remove a chip, then use **Clear filters**. Search and the period should stay. Navigate to another month and reopen Filters; dates should follow the new month and canceled edits should be gone.
4. From Dashboard, activate **Income this month** or **Spent this month** by click, touch, or keyboard. Confirm the displayed month and Income/Expenses chip match the selected total.

Only synthetic data was used. Live Firefly records, production connectivity, and production financial totals were not tested. Existing middleware deprecation and transitive `jose` compression warnings remain nonfatal. Automatic preview status is reported against the PR's final commit; production release remains a separate review action.
