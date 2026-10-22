# Sign-out and offline privacy build repair

Verified locally on 2026-10-22 against PR #25 head `fc7f6f5ff176b40dd2bbf9251391935400d82ff2` plus the two source changes in this commit. Runtime: Node 22.23.2, npm 10.9.8, locked dependencies, Next.js 16.2.4.

## Failure and correction

[Vercel deployment 7VvN7MhVfr4V1rjK6RkNEgNoR3HT](https://vercel.com/jose-gabriels-projects-a796812a/personal-finances/7VvN7MhVfr4V1rjK6RkNEgNoR3HT) built `f8e31fdb1109896aeedf8f86b5ce2f99f01cbf22`. Webpack compilation succeeded, then TypeScript rejected the conversion from `ExtendableMessageEvent` to the DOM `MessageEvent` in `app/sw.ts`. The current PR head retained that error, which a fresh local type check reproduced.

The worker now reads `event.data` directly. `ExtendableMessageEvent` already defines this property, along with the worker's `waitUntil` and `ports` APIs.

Full lint also found `react-hooks/purity` rejecting the session guard's eager `Date.now()` state argument. A lazy `useState` initializer preserves the initial expiry decision and avoids repeating the clock read on later renders. No lint or build check was disabled.

## Verification

| Check | Before repair | After repair |
| --- | --- | --- |
| `tsc --noEmit` | TS2352 at `app/sw.ts:129` | Passed |
| `npm run lint` | `react-hooks/purity` in session guard | Passed |
| `npm run build` | Vercel failure above | Passed locally: worker bundle, TypeScript, all 7 static pages, and build traces completed |
| `git diff --check` | — | Passed |

The local build used a cleared process environment with synthetic application settings, an unreachable loopback Firefly URL, and no `.env` files. As in the assessment harness, Next's `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` hook supplied installed local Geist fonts; Google font downloads were not tested. No real financial records or credentials were accessed. An independent read-only reviewer found no actionable issues in the final source diff and reviewed the reported check outcomes.

The build still emits warnings for the existing middleware naming convention and transitive `jose` compression APIs in Edge. They do not fail this build.

## Limits and remote state

This verifies the build repair. The [original browser assessment](./sign-out-offline-privacy.md) describes the earlier baseline and reproduced exposure; its saved observations do not verify the later privacy implementation. Browser privacy scenarios, production connectivity, and device behavior were not rerun for this two-line correction.

The failed Vercel deployment belongs to the older `f8e31fd` commit. At the initial build-repair handoff, the branch preview exclusion still prevented a fresh remote build; that state is historical and superseded by the authorized preview run below.

## Authorized automatic preview builds

On 2026-10-22 Jose authorized previews for this PR and future Personal Finances PRs. Commit `2181aa14a6fd55dff3e71505751159b098942b12` removes the three stale `git.deploymentEnabled: false` branch exceptions from `vercel.json`, restoring Vercel's default Git deployment behavior. The linked `personal-finances` project's `previewDeploymentsDisabled` setting was explicitly set to `false`. The production branch configuration was not changed. An independent read-only review found no actionable issues in this configuration change.

The existing Git integration automatically built that exact commit on `test/sign-out-offline-privacy`: [deployment `dpl_4nd14dDnMF7Gd1m55VnGWKdAr7w2`](https://vercel.com/jose-gabriels-projects-a796812a/personal-finances/4nd14dDnMF7Gd1m55VnGWKdAr7w2), [preview URL](https://personal-finances-dr3tjfrxr-jose-gabriels-projects-a796812a.vercel.app). Vercel reported `READY`, and GitHub's `Vercel` status reported `success` / `Deployment has completed`. No manual retry was needed.

The remote build completed webpack compilation, TypeScript, all 7 static pages, and build traces; Vercel reported `Build Completed` in 29 seconds. This confirms the earlier source build repair on Vercel. Configuration JSON parsing and `git diff --check` also passed. The final documentation commit's deployment is recorded in the PR's current Vercel check.

No authenticated application requests, real Firefly queries, or browser privacy scenarios were run during preview verification. Build readiness does not establish the privacy behavior described in the earlier assessment. No merge or production deployment was performed.
