# dashboard

A Nuxt 4 app scaffolded to match the house structure (see `basin`, `markpost`,
`wanderist`). Auth (Clerk) and the database (Neon + Drizzle) are wired in;
Sentry is not, and follows the same pattern as the sibling apps when you want it.

## Stack

- **Nuxt 4** (Vue 3, compatibility version 4)
- **Clerk** (`@clerk/nuxt`) — auth, session verification, sign-in UI
- **Neon + Drizzle ORM** — Postgres over HTTP, schema-first migrations
- **Pinia** — state (module ready; no stores yet)
- **Tailwind CSS 4** — via `@tailwindcss/vite`, alongside the token-based design
  system in `app/assets/css/main.css`
- **Vitest** + `@vue/test-utils` — unit/component tests (`tests/`)
- **Playwright** — e2e tests (`e2e/`)
- **Netlify** — deploy target (`nitro` preset)
- **dotenvx** — encrypted, committed env files
- **ESLint + Prettier + fallow** — lint, format, dead-code/dep audit
- **husky + gitleaks** — pre-commit env-file + secret guards

## Setup

```bash
nvm use                 # Node from .nvmrc (24.16.0)
npm install
npm run dev
```

`npm run dev` needs a decrypted `.env`, so do the one-time setup below first.

### Clerk + Neon setup (one time)

Two external services. `.env.example` documents every var and where to get it.

1. **Neon** — create a project at <https://console.neon.tech>. Copy the pooled
   connection string from Connection Details. Create a second branch (e.g.
   `e2e`) and copy its connection string too; e2e runs must never point at the
   dev database.
2. **Clerk** — create an application at <https://dashboard.clerk.com>. From API
   Keys copy the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
3. **Write the encrypted env files.** Values live encrypted in the committed
   `.env*` files; the private keys land in `.env.keys`, which is gitignored —
   back it up to your password manager or the files become undecryptable.

   ```bash
   npx dotenvx set DATABASE_URL "postgres://…"    -f .env
   npx dotenvx set NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY "pk_test_…" -f .env
   npx dotenvx set NUXT_CLERK_SECRET_KEY "sk_test_…" -f .env
   ```

   Repeat for `.env.dev` (Netlify previews) and `.env.production` (live keys).
   For `.env.e2e`, set `E2E_DATABASE_URL` to the e2e branch instead of
   `DATABASE_URL` — it takes precedence wherever both are read.

4. **Create the schema.** `server/db/migrations/0000_*.sql` is already generated
   and committed; this applies it.

   ```bash
   npm run db:migrate                 # dev database
   npm run db:migrate:production      # live database
   ```

   The e2e database needs no manual step — `e2e/global-setup.ts` migrates it on
   every run.

5. **Verify.** `npm run dev`, sign up at <http://localhost:3000/login>, then
   check that `/api/me` returns a row. The first sign-in inserts it.

### How auth fits together

- `server/middleware/auth.ts` wraps Clerk's `clerkMiddleware()` (nuxt.config
  sets `clerk.skipServerMiddleware: true` so this file owns registration). It
  verifies the session and puts the matching database row on
  `event.context.user`, inserting one on first sign-in.
- `server/utils/auth.ts` — `requireUser(event)` returns that row or throws 401.
  Every authenticated route handler starts with it; see `server/api/me.get.ts`.
- `app/middleware/auth.global.ts` guards the client. `/` and `/login` are
  public; everything else redirects to `/login`. Add public routes to
  `PUBLIC_PATHS`.
- `users.provider_id` holds the Clerk user id. Rows are keyed by an internal
  `serial` id so foreign keys never point at a vendor identifier.
- Set `NUXT_DISABLE_SIGNUPS=true` in an environment to reject new identities
  with a 403 while existing users keep working. It is read through
  `runtimeConfig`, so it bakes in at build time — set it per environment.

## Integrations

Two layers of secrets:

- **Shared studio keys** live encrypted in the committed dotenvx env files,
  `NUXT_*` convention, read via `runtimeConfig` — same as Clerk/Neon above.
  `.env.example` documents every var and where to get it.
- **Per-app overrides** (e.g. a property using its own Stripe/Sentry account)
  live encrypted in the database (`integration_config` table — added in a
  later issue), encrypted/decrypted with `server/utils/integrationSecrets.ts`
  and `NUXT_INTEGRATION_ENCRYPTION_KEY`. That module is deliberately isolated
  from the DB/config layer so it can be unit-tested without touching real
  secrets or a database (`tests/server/utils/integrationSecrets.test.ts`
  covers round-trip, tamper-detection, and wrong-key failure).

`NUXT_INTEGRATION_ENCRYPTION_KEY`, the Stripe vars, the GA4 vars, the Sentry
vars, and the per-app Clerk secret keys are wired into `runtimeConfig` today
(see nuxt.config.ts) — declared there so the Netlify preset forwards them
into the deployed function's `process.env`, even though the code that
actually reads them (`server/integrations/config.ts`'s `resolveSecret`,
`server/integrations/stripe/provider.ts`'s `resolveProductIdsSource`,
`server/integrations/ga4/provider.ts`'s `resolvePropertyId` and its direct
`NUXT_GA4_SA_CLIENT_EMAIL` read, `server/integrations/sentry/provider.ts`'s
`resolveProjectSlug` and its direct `NUXT_SENTRY_ORG` read) does a plain
`process.env` lookup rather than `useRuntimeConfig()`, since each resolves a
row/app-specific key name at runtime. The remaining vendor vars below are
documented here and in `.env.example` so they're ready to set, but each
one's `runtimeConfig` entry and actual API client land with that vendor's
provider issue (blog-platform sync — separate issue).

Set any of the vars below the same way as Clerk/Neon:

```bash
npx dotenvx set NUXT_STRIPE_SECRET_KEY "sk_live_…" -f .env
```

### Google Analytics 4

Reports sessions (current 30d total + daily series for the sparkline) and a
channel/traffic-source split for every property — see
`server/integrations/ga4/provider.ts`. One shared service account across
properties, scoped per property by property ID, same override precedent as
Stripe's product IDs.

1. Create a service account at
   <https://console.cloud.google.com> → IAM & Admin → Service Accounts.
2. In each GA4 property, grant that service account "Viewer" access:
   Admin → Property Access Management.
3. Download the service account's JSON key and copy `client_email` and
   `private_key` into `NUXT_GA4_SA_CLIENT_EMAIL` /
   `NUXT_GA4_SA_PRIVATE_KEY`. An `integration_config` row's `secret_ref`
   pointing at `NUXT_GA4_SA_PRIVATE_KEY` is what actually resolves the
   private key into `config.secret` at sync time
   (`server/integrations/config.ts`'s `resolveSecret`); the client email is
   not treated as a secret and is read directly from `process.env`.
4. Copy each property's numeric Property ID (Admin → Property Settings) into
   the matching `NUXT_GA4_PROPERTY_ID_*` var. This env var is the deploy-time
   default; an `integration_config` row's `external_id` column, once set,
   overrides it per app.

### Stripe

Reports MRR and active subscriber counts for the product-template apps
(basin, markpost, wanderist). One shared Stripe account across properties,
scoped per property by product ID — see
`server/integrations/stripe/provider.ts`.

1. Secret key — <https://dashboard.stripe.com/apikeys> (restricted,
   read-only: Subscriptions, Customers, Products) → `NUXT_STRIPE_SECRET_KEY`.
2. Per-property product ID(s) — <https://dashboard.stripe.com/products> → the
   product → copy its `prod_...` ID → `NUXT_STRIPE_PRODUCT_ID_*`. A comma-
   separated list scopes MRR across several tiers/products for the same app
   (e.g. `prod_basin_core,prod_basin_pro`). This env var is the deploy-time
   default; an `integration_config` row's `external_id` column, once set,
   overrides it per app.

### Per-app Clerk

Reports total user count (`users`, current) and a new-signups delta over the
trailing 30 days (`new_users`, `30d`) for each product-template app's own
Clerk instance — separate from this dashboard's own Clerk app configured
above — see `server/integrations/clerk/provider.ts`. Unlike Stripe/GA4's one
shared studio-wide credential, each app has its own Clerk instance, so
there's no shared default: the secret key itself is what identifies which
app's data is being read, and an app with no secret configured anywhere
simply produces no rows (not a zeroed metric, not a thrown error).

1. Secret key — each property's own <https://dashboard.clerk.com> → API Keys
   → Secret key → the matching `NUXT_CLERK_SECRET_KEY_*` var.
2. An `integration_config` row (`vendor: "clerk"`) with `secret_ref` pointing
   at that var is what actually resolves the key into `config.secret` at
   sync time (`server/integrations/config.ts`'s `resolveSecret`).

### Sentry

Reports open-issue and fatal-issue counts for the product-template apps
(basin, markpost, wanderist) — grimicorn.dev and neonpixels.dev don't use
Sentry and get no `integration_config` row for it. One shared Sentry org
across properties, scoped per property by project slug — see
`server/integrations/sentry/provider.ts`. The per-app status-chip
label/tone mapping ships as a standalone, unit-tested pure function,
`server/integrations/sentry/mapping.ts`'s `sentryStatusChip`: any
unresolved fatal-level issue is `danger` ("N FATAL"), otherwise any other
open issue is `warn` ("N OPEN"), otherwise `ok` ("OK"). It isn't called
from the read API yet — wiring it into the property card's status chip
(alongside curating which metrics render there at all) is
`app/components/PropertyCard.vue`'s existing `@todo #19`, not this issue.

1. Auth token — <https://sentry.io/settings/account/api/auth-tokens/>, needs
   `project:read` and `org:read` scopes → `NUXT_SENTRY_AUTH_TOKEN`.
2. Org slug (`NUXT_SENTRY_ORG`) — the slug in your Sentry settings URL.
3. Per-property project slug — that project's Settings page, in the URL as
   `sentry.io/organizations/<org>/projects/<slug>/` →
   `NUXT_SENTRY_PROJECT_*`. This env var is the deploy-time default; an
   `integration_config` row's `external_id` column, once set, overrides it
   per app.

### Blog platforms (danholloran.me cross-posting targets)

Reads post counts + per-post cross-post status for the writing template
(danholloran; the only app with `template: "writing"` in
`app/config/apps.ts`) — see `server/integrations/syndication`. Publishing
itself happens outside this app; these providers only read what's already
live on each platform. One shared account per platform (no per-slug env var
suffix, since there's only one writing-template app today).

- **Hashnode** — <https://hashnode.com/settings/developer> → generate a
  Personal Access Token (`NUXT_HASHNODE_TOKEN`). Publication ID is on the
  blog's dashboard → Settings → General (`NUXT_HASHNODE_PUBLICATION_ID`); an
  `integration_config` row's `external_id`, once set, overrides it, same
  precedent as Stripe's product IDs / GA4's property IDs.
- **DEV.to** — <https://dev.to/settings/extensions> → DEV API Keys → Generate
  API Key (`NUXT_DEVTO_API_KEY`). No separate publication id: the key alone
  identifies the account.
- **Medium** — Medium retired its own publish API and has no supported read
  endpoint either, so this reads via RapidAPI's unofficial "medium2" API
  (aka mediumapi.com — <https://docs.mediumapi.com/>), a **paid** add-on.
  Subscribe at
  <https://rapidapi.com/nishujain199719-vgIfuFHxLd0/api/medium2> for
  `NUXT_MEDIUM_RAPIDAPI_KEY`; `NUXT_MEDIUM_USERNAME` is the plain `@handle`.
  Until that key is provisioned, `NUXT_MEDIUM_RAPIDAPI_KEY` stays unset and
  the Medium provider (`server/integrations/syndication/medium`) resolves to
  silently empty — no rows, no error — the same way a property with no
  Clerk instance configured shows no Clerk data. Once subscribed, this
  provider self-limits to once every 24h (see `MEDIUM_MIN_SYNC_INTERVAL_HOURS`
  in `mediumSyncGuard.ts`) regardless of how often the orchestrator itself
  runs, and fetches full detail for at most `MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC`
  posts per sync (`provider.ts`) — both numbers are derived from, and sized
  to stay well under, the plan's 150-requests/month cap (see the comment on
  `MEDIUM_MIN_SYNC_INTERVAL_HOURS` for the exact math); the `posts` count
  metric itself always reports the platform's true total regardless of that
  per-sync bound. A persistently _failing_ Medium sync (bad key, an
  unexpected response shape) is a known, accepted gap in this budget — the
  guard's clock only advances on success, so a stuck failure retries every
  orchestrator tick rather than backing off; watch the health chip and
  disable the integration_config row if that happens, and see the PR that
  introduced this provider for the follow-up (a proper attempt-independent
  circuit breaker) that would close it.

### Cross-app sync trigger

`NUXT_SYNC_TRIGGER_SECRET` — shared secret a sibling app (or
`netlify/functions/scheduled-sync.ts`, the 15-minute poller) presents on
`POST /api/sync`'s `Authorization: Bearer` header to trigger a dashboard
refresh. Generate with `openssl rand -hex 32`; no external account needed.

Setting it in a dotenvx file is **not enough on its own** for
`scheduled-sync.ts` to see it. That function is a separate bundle built by
Netlify's own Functions build step (not the Nuxt app), so it never goes
through the `runtimeConfig`/dotenvx-decrypt path that `server/api/sync.post.ts`
does — it reads `process.env.NUXT_SYNC_TRIGGER_SECRET` directly at invoke
time, which only has a value if it's also set as a real environment variable
in Netlify's own UI (Site configuration → Environment variables, Functions
scope), matching the value already in `.env.production`. Without that step
the scheduled function throws on every run (fails loud — see its own
top-of-file comment) instead of silently syncing nothing.

### Encrypting per-app secrets

`NUXT_INTEGRATION_ENCRYPTION_KEY` — base64-encoded 32-byte AES-256-GCM key.
Generate with `openssl rand -base64 32`. Rotating it orphans any secrets
already encrypted with the old key, so any DB-stored per-app secret needs
re-encrypting (or the integration needs re-authenticating) after a rotation.

## Scripts

| Script             | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Dev server (decrypts `.env` via dotenvx)      |
| `npm run build`    | Production build (decrypts `.env.production`) |
| `npm run test`     | Vitest (watch)                                |
| `npm run test:ci`  | Vitest (run once)                             |
| `npm run lint`     | Prettier check + ESLint + fallow audit        |
| `npm run lint:fix` | Prettier write + ESLint --fix + fallow fix    |
| `npm run e2e`      | Playwright (decrypts `.env.e2e`)              |

### Database scripts

All decrypt `.env` via dotenvx (so they hit the dev database) except where noted.

| Script                          | What it does                                          |
| ------------------------------- | ----------------------------------------------------- |
| `npm run db:generate`           | Diff `server/db/schema.ts` into a new migration       |
| `npm run db:migrate`            | Apply pending migrations                              |
| `npm run db:migrate:production` | Apply pending migrations (decrypts `.env.production`) |
| `npm run db:push`               | Push the schema without a migration (dev only)        |
| `npm run db:studio`             | Drizzle Studio                                        |

Schema changes are schema-first: edit `server/db/schema.ts`, run
`npm run db:generate`, commit the generated SQL alongside the schema change,
then `npm run db:migrate`.

`npm run db:push` diffs `server/db/schema.ts` directly against the live
database — it never reads `server/db/migrations/`, so hand-authored SQL that
has no `schema.ts` counterpart (e.g. the `updated_at` triggers in
`0002_add-updated-at-trigger.sql`) is invisible to it. A dev database kept in
sync with `db:push` alone won't have those triggers; run `npm run db:migrate`
at least once to pick them up.

## Structure

```
app/
  assets/css/main.css   design-system tokens + base classes
  components/           AppIcon, AppAlert
  composables/          useTheme
  layouts/              default
  middleware/           auth.global (route guard)
  pages/                index, login, dashboard
  plugins/              appearance.client (accent init)
  stores/               (add Pinia stores here)
server/
  api/                  me.get (pattern for authenticated routes)
  db/                   schema, useDb, migrations/
  middleware/           auth (Clerk session -> event.context.user)
  utils/                auth (requireUser, getOrCreateUser),
                        integrationSecrets (encrypt/decrypt per-app secrets)
tests/                  Vitest, mirrors app/ and server/
e2e/                    Playwright specs + Clerk sign-in setup
drizzle.config.ts       drizzle-kit config (schema in, migrations out)
```

### e2e and Clerk

`e2e/global-setup.ts` migrates the e2e database and provisions a Clerk test user
via the Backend API — no extra credential env vars, the app's own
`NUXT_CLERK_SECRET_KEY` is enough. Playwright then runs three projects in order:
`unauthenticated` (no session exists yet, so guards behave like a real visitor's),
`setup` (signs in via `@clerk/testing`, saves state to `e2e/.auth/user.json`),
then `chromium` (everything else, with that session).

### e2e in CI

`ci.yml`'s `e2e` job runs each `e2e/*.spec.ts` file as its own matrix shard
(skipped outside pull requests, and skipped when no e2e-relevant path
changed), mirroring the pattern in `basin`/`markpost`/`wanderist`: it decrypts
`.env.e2e` with the `DOTENV_PRIVATE_KEY_E2E` repository secret, then uses the
`NEON_API_KEY`/`NEON_PROJECT_ID` stored inside that same file to create a
fresh Neon branch per shard (deleted again in a final `if: always()` step)
so specs never collide on shared state.

**Required setup:** `.env.e2e` does not yet carry `NEON_API_KEY` /
`NEON_PROJECT_ID` (only `E2E_DATABASE_URL`, a single static branch, is set).
Until someone with Neon console access adds them —
`npx dotenvx set NEON_API_KEY "<key>" -f .env.e2e` and the same for
`NEON_PROJECT_ID` — the `e2e` job's "Create Neon branch" step will fail with
`MISSING_KEY`. The `DOTENV_PRIVATE_KEY_E2E` repository secret itself already
exists in GitHub Actions, so no new Actions secret is needed — only those two
encrypted values inside `.env.e2e`.
