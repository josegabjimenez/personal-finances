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

The failed Vercel deployment belongs to the older `f8e31fd` commit. A fresh lookup before publication found no Vercel deployment or GitHub status for `fc7f6f5`. The existing branch preview exclusion is unchanged, so a new Vercel build was not triggered. Local build success is not a successful Vercel deployment. No merge or production deployment was performed.
