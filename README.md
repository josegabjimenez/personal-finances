# Finances

A fast, mobile-first PWA that reads your self-hosted [Firefly III](https://www.firefly-iii.org/) instance and shows you what matters in one glance.

- **Dashboard** — net worth, this month's income vs expenses, recent activity
- **Transactions** — list with search, filter by type and date range, pagination
- **Accounts** — balances grouped by assets and liabilities
- **Budgets** — spent vs limit for the current period, with progress bars
- **Categories** — donut chart + breakdown of where your money went
- **Piggy banks** — progress toward savings goals
- **Password-gated** — single-user login, token stays server-side only
- **Installable** — standalone PWA with offline fallback

## Tech

Next.js 16 (App Router, webpack builder) · React 19 · TypeScript · Tailwind CSS v4 · TanStack Query · Recharts · Serwist · jose · Zod.

## Local development

```bash
cp .env.local.example .env.local
# fill in the four values (see below)
npm install
npm run dev
# visit http://localhost:3000/login
```

### Environment variables

| name | required | description |
|---|---|---|
| `FIREFLY_BASE_URL` | yes | Base URL of your Firefly III instance, no trailing slash (e.g. `https://firefly.example.com`). Must be reachable from your Vercel deployment. |
| `FIREFLY_TOKEN` | yes | Personal Access Token from Firefly III → Profile → OAuth → Personal Access Tokens. |
| `APP_PASSWORD` | yes | The single password required by the login screen. |
| `AUTH_SECRET` | yes | ≥32 character random string used to sign the session cookie. Generate one with `openssl rand -base64 48`. |

All variables are server-only — none are exposed to the browser.

### Verify the token manually

```bash
curl -s "$FIREFLY_BASE_URL/api/v1/about/user" \
  -H "Authorization: Bearer $FIREFLY_TOKEN" \
  -H "Accept: application/vnd.api+json"
```

You should see a JSON:API response with your user record.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import it in Vercel → **New Project**.
3. In **Environment Variables**, add the four variables listed above (same names, no `NEXT_PUBLIC_` prefix).
4. Deploy.
5. On your phone, open the deployed URL in Safari / Chrome → **Add to Home Screen**. The PWA will launch standalone.

## Architecture

```
Browser ─► Next.js route handler ─► Firefly III REST API
            │ (reads signed           │ (Bearer token,
            │  session cookie,        │  server-side only)
            │  forwards request)      │
```

- `middleware.ts` gates every route except `/login`, `/offline`, `/api/auth/*`, and static assets. Redirects to `/login` if the session cookie is missing or invalid.
- `app/api/auth/login` compares the submitted password against `APP_PASSWORD` with constant-time equality, then issues an HMAC-signed HTTP-only cookie (`jose`).
- `app/api/firefly/[...path]` is an allow-listed passthrough that injects the bearer token server-side. Only a curated list of Firefly endpoints is forwarded.
- RSC pages fetch from Firefly during the server render for fast first paint; TanStack Query re-validates in the background when the user revisits a page.
- Serwist provides the service worker — caches static assets and slow-changing API responses (accounts, budgets, categories) with stale-while-revalidate; fast-changing ones (transactions, summary) use network-first with a 4s timeout.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | Dev server on `localhost:3000` (SW disabled in dev). |
| `npm run build` | Production build (uses webpack so Serwist works). |
| `npm start` | Start the production build locally. |
| `npm run lint` | Lint. |
| `npm run generate:icons` | Re-render the PWA icons from `public/icon.svg`. |

## Roadmap

Read-only v1. Next: quick-add transaction, account detail with balance sparkline, recurring-bill insights, month-over-month comparisons.
