# Transaction loading retry

Source task: [Personal finances · Retry transaction loading after connection failures](https://www.notion.so/401fcdfcb7b481028a21c2e6489d078a). Implemented from merged `main` commit `88d8946ceef3820eeae47c1195390d4fee3a1dc6` and verified on 2026-10-22.

## Behavior

A failed request for older transactions now leaves the loaded rows and active filters in place and displays an accessible error with a **Retry** button. Pagination advances only after a successful response, so Retry repeats the failed page. Automatic loading pauses during errors; repeated clicks and observer callbacks share one in-flight request.

Each replacement list has its own request session. Changing the fetch URL or initial data, or unmounting the list, aborts the outstanding request and invalidates late results. A stale response, JSON completion, rejection, or queued observer cannot append to a replacement list or clear its loading state. Observation rearms after successful pages, including when active filters hide the entire appended page. The final page stops normally.

## Verification

`npm run test:transaction-loading-retry` passed all 10 scenarios in an isolated production build using Next.js 16.2.4, Node 22.23.2, Playwright, and installed headless Chromium 145.0.7632.6. The same command passed full ESLint, `tsc --noEmit`, and the product's webpack production build before creating a temporary component harness route. The harness route exists only in that temporary app and is never shipped.

| Scenario | Result |
| --- | --- |
| Real `/transactions?view=all` route, active search/type/account/category/tag filters, HTTP 503 through the app proxy | 25 displayed rows and the URL/input filters remained; error and Retry were visible |
| Repeated Retry clicks, then successful page 2 and final empty page 3 | Target upstream sequence was exactly **1, 2, 2, 3**; row count increased to 26 once; loading and Retry disappeared |
| Browser network rejection, repeated observer callbacks, and repeated Retry clicks | Same page retried once; loaded row retained; no automatic retry while errored |
| Successful page hidden entirely by filters | Observer rearmed and the following final page completed |
| New initial data with the same fetch URL, and a changed fetch URL | Late success, rejection, and delayed JSON each left the new list/request intact (6 cases) |
| Unmount during a request | Abort signal set; late success and queued observer ignored |
| Single-page list | No loading, Retry, or extra request |

There were no uncaught browser errors. [Structured synthetic observations](./transaction-loading-retry-observations.json) retain the scenario names and target upstream page sequence. An independent reviewer found no actionable product findings and independently exercised the actual transpiled component's retry and race handling.

## Reproduction and limits

Provide Playwright through normal module resolution or `RETRY_PLAYWRIGHT_MODULE`. Optionally select an installed browser with `RETRY_BROWSER_CHANNEL` or `RETRY_BROWSER_EXECUTABLE`, and save logs/observations with `RETRY_OUTPUT_DIR`. The runner fails early if its browser is unavailable and cleans up temporary servers, browser profiles, builds, and sessions on completion or interruption.

Only synthetic fixtures and a local fake Firefly upstream were used. The runner copies tracked source plus its explicit fixture files, excludes `.env` files, uses a cleared process environment with fake settings, and blocks external browser host resolution. Next's local font fixture avoids Google downloads. Unrelated navigation prefetches receive separate empty synthetic responses, so they cannot consume the target failure. The production service worker remains enabled during browser checks.

The existing middleware deprecation and transitive `jose` compression warnings remain nonfatal. Native Edge rendering did not deliver observer callbacks on this host, including on an independent static control, so the successful browser run used the already-installed Chromium executable. Live financial records, production connectivity, device/offline privacy behavior, and Google font downloads were not assessed. Remote preview readiness is reported by the PR's current Vercel check.
