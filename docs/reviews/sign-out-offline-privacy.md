# Sign-out and offline privacy assessment

**Assessment completed; privacy exposure reproduced.** This is an observation-only review, not a privacy fix or a claim that privacy checks passed.

Assessed 2026-10-22, source `5f278d32dddb80b6178378268d2b4d4a81c597b7`, Next.js 16.2.4 production build, Node 25.6.1, Playwright 1.62.1, installed Chrome 155.0.8059.85. Product code is unchanged. The assessment did not use real financial data, the real Firefly service, environment files, or a deployment.

## What the browser showed

Each scenario used a separate fresh persistent browser profile. The production service worker was activated and controlling the page before financial documents were warmed with full reloads. Accounts contained the invented `PRIVACY_DEMO_ACCOUNT` with balance COP 12,345.67. Transactions contained 51 invented withdrawals of COP 42.25; scrolling the real All transactions UI loaded page 2 through the real browser API path.

| Observation | Valid session control | After Sign out | Expired session |
| --- | --- | --- | --- |
| Direct online API / document response, bypassing worker | 200 / 200 | 401 / 307 to login | 401 / 307 to login |
| Already open page after going offline | Fake account visible | Login visible; financial data absent | Fake account still visible |
| Offline full navigation to warmed Accounts | Fake account visible | Fake account visible | Fake account visible |
| Offline Transactions, including page 2 | Fake transactions visible | Fake transactions visible | Fake transactions visible |
| Offline Accounts in a new tab | Fake account visible | Fake account visible | Fake account visible |
| Offline Accounts after closing/reopening Chrome with same profile | Fake account visible | Fake account visible | Fake account visible |
| Offline browser read of warmed accounts API | 200, fake marker present | 200, fake marker present | 200, fake marker present |

Sign out used the actual UI button and logout POST, returned 200, and removed the session cookie. Expiry used an HS256 token signed with the isolated application's fake secret, with a past JWT expiration and a future browser-cookie expiration. Server rejection was verified separately from the worker.

Offline was independently verified: a unique uncached API request failed with `TypeError: Failed to fetch`, while upstream request counts stayed unchanged throughout each offline phase (24→24, 27→27, 30→30). Cached reads and displayed pages therefore did not depend on a successful new Firefly response.

One earlier diagnostic run briefly reached a Chrome error page immediately after logout; new-tab/reopened access still reproduced the exposure. The retained final run completed all displayed rows above with an activated controller. Navigation timing can affect the immediate post-logout page; it does not establish erasure of stored data.

## What remained stored

The harness inspected every Cache Storage cache and every entry, reporting cache entry counts and only responses containing the invented financial markers. It found financial HTML documents in `others`, RSC responses in `pages-rsc`, and JSON in `apis`. The precache and `pages-rsc-prefetch` were also inspected; the final run found no financial marker in their responses. This describes observed storage separately from visible DOM text and an explicit browser API read.

Source inspection explains the result: `app/sw.ts` spreads Serwist's `defaultCache` before its custom Firefly rules. The installed default `/api/*` GET handler uses `apis`; the general non-API handler caches documents in `others`. The configured custom `firefly-slow`/`firefly-live` names and their 5-minute/60-second settings therefore do not describe the observed cache hits. This assessment did not measure long-term expiry.

The logout handler removes the cookie, and middleware rejects missing/expired sessions on the network. Neither operation removed the observed browser financial caches. Successful network authorization checks do not prevent the worker from returning previously stored responses while offline.

## Reproduce

Prerequisites: install repository dependencies with `npm ci`, have a supported Node version and Google Chrome installed, and make Playwright available. If Playwright is not already available, a separate pinned temporary installation avoids changing this repository:

```sh
privacy_runtime_dir="$(mktemp -d)"
npm install --prefix "$privacy_runtime_dir" --no-package-lock --no-save playwright@1.62.1
privacy_evidence_dir="$(mktemp -d)"
PRIVACY_PLAYWRIGHT_MODULE="$privacy_runtime_dir/node_modules/playwright" \
PRIVACY_OUTPUT_DIR="$privacy_evidence_dir" npm run test:privacy
rm -rf "$privacy_runtime_dir" # Keep privacy_evidence_dir for review.
```

`PRIVACY_PLAYWRIGHT_MODULE` accepts a module/package path; otherwise normal Node resolution is used. The browser channel defaults to installed `chrome` and may be overridden with `PRIVACY_BROWSER_CHANNEL`. The script records the actual browser version. The installed browser can update independently of Playwright.

The harness copies tracked source to a temporary directory, skipping all `.env*` files and repository documentation, and links existing dependencies. It builds and starts Next in production mode with a minimal synthetic environment and a loopback fake upstream. Next's font test hook supplies bundled local Geist files, avoiding Google font downloads. Browser DNS is limited to loopback. It preserves the app's auth, UI, middleware, and generated service worker. Profiles, sessions, fake servers, and build files are removed on normal completion or SIGINT/SIGTERM; evidence remains in the printed output directory.

For a manual browser reproduction in an equivalent isolated setup: sign in with fake data, wait for an activated controller, reload Accounts and Transactions while online, scroll to load page 2, sign out, then switch offline **before revisiting protected routes online**. Open the warmed routes in a new tab and reopen the same test profile offline. For expiry, keep the warmed profile and substitute a correctly signed expired synthetic JWT. An online browser revisit can overwrite a document cache with a login response and obscure the earlier offline exposure.

## Evidence and verification

- [Minimized observation JSON](./sign-out-offline-privacy-observations.json): actual cache inventories, DOM markers, worker states, network controls, and fake upstream paths; no cookies, tokens, passwords, or response bodies.
- [Signed-out browser reopened offline](./sign-out-offline-privacy-reopened.png).
- [Signed-out offline transactions](./sign-out-offline-privacy-transactions.png).
- `npm run test:privacy`: completed all three scenarios, exit 0. This means the assessment ran successfully; the privacy outcome is the exposure above.
- A final review tightened the cache-miss assertion to require a fetch error. All three retained observations satisfy it; this assertion-only change was validated against the saved results without repeating the browser run.
- `node --check scripts/sign-out-offline-privacy.mjs`, focused ESLint, TypeScript, and `git diff --check`: passed.
- Startup SIGTERM smoke: exit 143, captured Next child stopped, no new temporary app/profile directory remained.

Build warnings concern the existing middleware convention and jose compression APIs in Edge; compilation and the real auth controls succeeded. Raw build/server logs remain temporary because they include machine paths.

Limits: this tests desktop Chrome on loopback with freshly warmed synthetic data and a browser restart, not Safari/iOS, OS reboot, elapsed cache TTLs, encrypted storage, multi-user account switching, or production behavior on Jose's device. An already rendered page staying visible after expiry is recorded separately from new offline navigation. No privacy policy about valid-session offline retention was chosen.

## Recommended next decision

Approve a focused follow-up to prevent financial data from being displayed or retrieved offline after explicit sign-out or session expiry, covering document, RSC, and API caches plus already open UI. Decide the desired valid-session offline experience before choosing a retention/clearing strategy. Implementing that behavior is outside this assessment. The branch-specific Vercel exclusion suppresses automatic deployment of `test/sign-out-offline-privacy`; existing branch rules are preserved.
