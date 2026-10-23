# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Payments (Stripe, TEST MODE ONLY until Markus approves live): Secrets `STRIPE_SECRET_KEY` (sk_test_…) and `STRIPE_WEBHOOK_SECRET` (whsec_…). Both missing → payments off (dev unlock only). A live key is refused unless `STRIPE_LIVE_APPROVED=yes`. Optional `APP_BASE_URL` = the site's https origin (return pages must be on it).
- Stripe webhook endpoint: `https://<site>/api/billing/webhook`, events: checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid, charge.refunded.
- Billing checks (local DB only): `DATABASE_URL=<local> pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/billing/billing.check.ts`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Paid access comes ONLY from the verified Stripe webhook (`artifacts/api-server/src/billing/sync.ts`). Never grant access from the Checkout return page.
- The webhook is mounted in `app.ts` BEFORE `express.json` (Stripe signs the raw body). Moving it breaks every signature.
- Prices live only in `PRICES` (`artifacts/api-server/src/coaching/access.ts`); Checkout builds its line items from them.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
