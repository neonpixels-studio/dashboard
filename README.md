# dashboard

A Nuxt 4 app scaffolded to match the house structure (see `basin`, `markpost`,
`wanderist`). This is a **bare skeleton**: the shared tooling, directory
structure, design system, and base UI kit — without auth or a database wired in.
Add Clerk + Neon/Drizzle + Sentry when you need them (they follow the same
pattern as the sibling apps).

## Stack

- **Nuxt 4** (Vue 3, compatibility version 4)
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

No external services or runtime env vars are wired in yet. dotenvx stays in the
scripts for when you add them — see `.env.example`.

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

## Structure

```
app/
  assets/css/main.css   design-system tokens + base classes
  components/           AppIcon, AppAlert
  composables/          useTheme
  layouts/              default
  pages/                index, dashboard
  plugins/              appearance.client (accent init)
  stores/               (add Pinia stores here)
server/
  api/                  (add endpoints here)
  middleware/           (add Nitro middleware here)
  utils/                (add server utils here)
tests/                  Vitest, mirrors app/
e2e/                    Playwright specs
```
