# Month navigation and transaction totals

Approved tasks: [direct month selection](https://app.notion.com/p/403fcdfcb7b481f28ce1e9b6db4f8821), [historical category spending](https://app.notion.com/p/403fcdfcb7b4819e8a9af6584f6d3ef8), [clear totals](https://app.notion.com/p/403fcdfcb7b481fd95ece6b40138fef6).

## Behavior

- Activity month navigation follows the Budgets sheet pattern, with recent months grouped by year and a direct month field for older history. All transactions and This month are visible actions. Changing the period keeps applied search, filters and transaction Back context, and resets pagination. Custom/open intervals display exact ISO From/To bounds.
- Categories uses the selected month's existing range query for the chart, amounts, title, empty state and detail links. Detail and Categories Back retain the selected period, including direct URLs and refresh. Navigation remains available on empty/error screens.
- Summary counts describe displayed transaction entries; each split counts once. Labels distinguish income, signed expenses and net income minus expenses. Transfers do not contribute to net. Currency totals remain separate without conversion. Loaded matches are identified until pagination completes, including errors. Existing pagination also handles ranges larger than the first page using the same limits and date/type parameters.

## Verification

ESLint, TypeScript, 16 period/totals/navigation/recurring checks and the existing split regression passed. They exercise leap/year boundaries, exact/open interval labels, preserved query context, split identity, overlapping pages, filters, signed values and multiple currencies. The existing production retry suite passed all 10 scenarios, including HTTP failure, repeated Retry, filtered pages, stale results, changed sources and unmount; [observations](./month-navigation-retry-observations.json) record the exact 1, 2, 2, 3 upstream page sequence. Its fixture targets the pagination sentinel independently of Next Link prefetch observers, and completion assertions now wait for the explicit completed-scope label.

The browser runner `npm run test:month-navigation-ux` builds and serves an isolated production app with a loopback-only fake Firefly upstream and synthetic session. It exercises real routes, proxy requests, historical category insights, month selection, filters, transaction Back, currency/type labels, pagination failure/retry and mobile layout. Optional `UX_PLAYWRIGHT_MODULE` and `UX_BROWSER_EXECUTABLE` select installed tooling; `UX_OUTPUT_DIR` saves local diagnostics. No application `.env` file is copied or read. The local Next font fixture avoids external font downloads; the production service worker remains enabled.

No real financial records, Firefly credentials, financial writes, production deployment or merge were used. Remote preview build state and its exact head commit are recorded in the PR. Live account data and native-device rendering remain for human review.
