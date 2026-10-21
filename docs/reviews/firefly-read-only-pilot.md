# Firefly read-only boundary: verification

Verified on 2026-10-21 against base commit `9d5c5407c83e5b8a767cf37bb52170d1c6c290ff`.

## Problem and resulting behavior

The app describes its Firefly integration as read-only, but the authenticated API route and shared client could forward POST, PUT, and DELETE. The baseline reproduced an authenticated POST returning 200 from a fake upstream; both shared helpers also forwarded POST to a fetch stub.

The route now exports GET only. Next.js handles HEAD through GET and implements OPTIONS locally; unsupported mutation methods return 405. Both shared helpers reject unsupported methods and any non-null body before configuration lookup or network access. Existing reads, query values, path restrictions, upstream responses, and separate login/logout POST endpoints are preserved.

## Acceptance evidence

`npm run test:firefly-read-only` passed using an actual loopback Next.js server, a fake loopback Firefly server, and synthetic authentication values.

| Check | Verified result |
| --- | --- |
| Missing or invalid session | 401; no upstream request |
| Authenticated nested GET and query values | Expected path, query, response body and headers preserved |
| Upstream error | Status 429 and content type/body preserved |
| HEAD | Read-only upstream request; empty response body |
| POST, PUT, PATCH, DELETE | 405; no upstream request |
| OPTIONS | 204; Allow contains GET, HEAD, OPTIONS; no upstream request |
| Forbidden path or prefix lookalike | 404; no upstream request |
| Login and logout POST | Continue working independently of the Firefly proxy |
| Direct shared-client calls | Unsupported verbs and supplied bodies rejected before missing-config checks or fetch |
| Allowed shared-client reads | GET/query behavior and bodyless proxy HEAD preserved |

Direct-client checks compile the actual TypeScript source into a VM with an empty synthetic environment and a fetch stub. Rejected bodies include empty string, object, false, and zero. This verifies runtime rejection alongside the narrowed TypeScript options.

The test runner also cleans up its temporary servers on success, failure, SIGINT, and SIGTERM. Separate interruption checks confirmed exit codes 130/143 and termination of the detached Next.js process group.

## Reproduction

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:firefly-read-only
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
node --experimental-strip-types scripts/transaction-splits.test.mjs
git diff --check
```

These checks passed. The synthetic suite overrides the Firefly URL/token and authentication values itself; it does not require an environment file, real Firefly credentials, or financial data. The new Node test command reports one integration test file containing the HTTP and shared-client assertions.

The existing `test:transaction-splits` script uses `--experimental-default-type=module`, which is unsupported by the Node 25.6.1 runtime used for this verification. The compatible direct invocation above passed; the pre-existing script is unchanged.

## Review limits

Independent reviews found no remaining blocking issue in this increment. A test-server cancellation cleanup finding was fixed before the final checks.

The repository is connected to automatic Vercel deployments. `vercel.json` disables deployment for the exact review branch `fix/firefly-read-only-boundary`, so publishing this PR does not deploy the pilot. Other branches retain their existing deployment defaults; no Vercel project setting is changed.

No real Firefly requests, financial data changes, merge, or deployment were performed. A production build and production smoke test were not run. Cache/logout data retention remains a separate, untested increment; these results do not establish the health of the deployed app or completion of personal financial goals.

Technical implementation, tests, and this report belong in the repository and PR. Notion holds a short progress summary, review status, next action, and PR link.
