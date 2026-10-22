# Recurring-expense regression verification

Verified on 2026-10-21 with Node.js 25.6.1, based on `main` at
`1c4ab0ddc2cc867e4b0c8b8a39b991edc7296659`.

## Scope and results

The new suite imports the actual `buildRecurringObligations` function. All names,
IDs, dates, and amounts in its fixtures were invented for these tests. It does not
read environment files, call Firefly, start services, or change financial rules.

| Scenario | Expected outcome | Result |
| --- | --- | --- |
| Linked bill and withdrawal | One COP 100,000 obligation replaces the COP 96,000–104,000 bill estimate; the bill and automation remain associated once. | Passed |
| Matched card reserve | Both contextual and explicit-bill matching retain the reserve inside the existing obligation; expense total remains COP 42,000. | Passed |
| Two compatible bill candidates | The COP 75,000 automation remains unassigned with both candidate IDs and a warning; neither bill silently claims it. | Passed |

The ambiguous scenario deliberately preserves both bills and the unresolved
automation. Their combined amount is not asserted to be a reconciled spending
total while that ambiguity remains open.

## Validation

- `npm run test:recurring-obligations` — 3 tests passed, 0 failed.
- `npm run lint` — passed.
- `./node_modules/.bin/tsc --noEmit --incremental false` — passed.
- `node --experimental-strip-types scripts/transaction-splits.test.mjs` — existing regression passed.
- `git diff --check` — passed.

An independent review found no actionable issue in the three scenarios. The
checks validate consolidation outputs, not browser rendering, live account
balances, production behavior, or every possible matching rule.

Node reports `MODULE_TYPELESS_PACKAGE_JSON` when importing the repository's
TypeScript modules directly. The supported test command succeeds despite that
diagnostic. It intentionally omits `--experimental-default-type=module`, which
was removed in Node 25; the unrelated legacy split-test script and package-wide
module configuration remain unchanged.

## Deployment boundary

`vercel.json` disables automatic deployment for exactly
`test/recurring-expense-regressions`, preserving the existing
`fix/firefly-read-only-boundary` exclusion. No wildcard or production-branch
setting was added. No merge or deployment was performed for this test change.
