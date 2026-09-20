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

Only `NUXT_INTEGRATION_ENCRYPTION_KEY` is wired into `runtimeConfig` today,
since it's what the helper above already consumes. The vendor vars below are
documented here and in `.env.example` so they're ready to set, but each one's
`runtimeConfig` entry and actual API client land with that vendor's provider
issue (GA4/Stripe/Clerk/Sentry/blog-platform sync — separate issues).

Set any of the vars below the same way as Clerk/Neon:

```bash
npx dotenvx set NUXT_STRIPE_SECRET_KEY "sk_live_…" -f .env
```

### Google Analytics 4

Reports property traffic via the GA4 Data API using a service account.

1. Create a service account at
   <https://console.cloud.google.com> → IAM & Admin → Service Accounts.
2. In each GA4 property, grant that service account "Viewer" access:
   Admin → Property Access Management.
3. Download the service account's JSON key and copy `client_email` and
   `private_key` into `NUXT_GA4_SA_CLIENT_EMAIL` /
   `NUXT_GA4_SA_PRIVATE_KEY`.
4. Copy each property's numeric Property ID (Admin → Property Settings) into
   the matching `NUXT_GA4_PROPERTY_ID_*` var.

### Stripe

Reports revenue/subscription stats. One Stripe account across properties,
scoped per property by product ID.

1. Secret key — <https://dashboard.stripe.com/apikeys>.
2. Per-property product ID — <https://dashboard.stripe.com/products> → the
   product → copy its `prod_...` ID → `NUXT_STRIPE_PRODUCT_ID_*`.

### Per-app Clerk

Reads user/session counts for each property's own Clerk app (separate from
this dashboard's own Clerk app configured above). Each property's
<https://dashboard.clerk.com> → API Keys → Secret key goes in the matching
`NUXT_CLERK_SECRET_KEY_*` var.

### Sentry

Reports open issue counts per property.

1. Auth token — <https://sentry.io/settings/account/api/auth-tokens/>, needs
   `project:read` and `org:read` scopes.
2. Org slug (`NUXT_SENTRY_ORG`) — the slug in your Sentry settings URL.
3. Per-property project slug — that project's Settings page, in the URL as
   `sentry.io/organizations/<org>/projects/<slug>/`.

### Blog platforms (markpost publishing targets)

- **Hashnode** — <https://hashnode.com/settings/developer> → generate a
  Personal Access Token (`NUXT_HASHNODE_TOKEN`). Publication ID is on the
  blog's dashboard → Settings → General.
- **DEV.to** — <https://dev.to/settings/extensions> → DEV API Keys → Generate
  API Key.
- **Medium** — Medium retired its publish API, so stats read via RapidAPI's
  unofficial Medium API. Subscribe at
  <https://rapidapi.com/nishujain199719-vgIfuFHxLd0/api/medium2> for
  `NUXT_MEDIUM_RAPIDAPI_KEY`; `NUXT_MEDIUM_USERNAME` is the plain `@handle`.

### Cross-app sync trigger

`NUXT_SYNC_TRIGGER_SECRET` — shared secret a sibling app presents to trigger
an on-demand dashboard refresh instead of waiting for the next poll. Generate
with `openssl rand -hex 32`; no external account needed.

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
