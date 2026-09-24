import { APPS } from "../../app/config/apps";
import {
  decryptSecret,
  loadIntegrationEncryptionKey,
  IntegrationSecretError,
} from "../utils/integrationSecrets";
import type { IntegrationConfig, IntegrationConfigRow } from "./types";

// Thrown for a malformed/unsafe/disabled *row*, as opposed to
// IntegrationSecretError, which server/utils/integrationSecrets.ts throws
// for failures inside the cipher itself (wrong key, tampered ciphertext). A
// future orchestrator can act on the split: a config error means "skip this
// row and mark it misconfigured"; a secret error more likely means the
// shared encryption key itself is broken, which is a bigger deal.
export class IntegrationConfigError extends Error {
  override name = "IntegrationConfigError";
}

// Every app slug this studio knows about, uppercased for comparison against
// a secretRef's trailing segment (see assertSecretRefIsSafe). Reusing
// app/config/apps.ts here follows the same precedent as
// server/db/seed.ts/seedData.ts, which already import it into server/ code;
// only server/db/schema.ts itself is kept decoupled from app config (see its
// top-of-file comment).
const KNOWN_APP_SLUGS = new Set(APPS.map((app) => app.slug.toUpperCase()));

// `secretRef` is a row-supplied string used to index process.env — without a
// guard, any writer of an integration_config row (admin UI, seed data, a
// future import path) could point it at an unrelated, sensitive env var
// (e.g. the one backing server/utils/integrationSecrets.ts's own encryption
// key) and have that value handed straight to a provider whose job is to
// send credentials to a third party.
//
// A fixed allowlist of full names can't work here: per
// server/db/schema.ts's comment on `integrationConfig`, a vendor whose
// credential varies per app (clerk) uses a per-slug suffix, e.g.
// "NUXT_CLERK_SECRET_KEY_BASIN" vs "...WANDERIST" — there's no fixed set of
// literal names to enumerate. Instead:
//   1. the ref must be scoped to the row's own vendor via a "NUXT_<VENDOR>_"
//      prefix, which every legitimate name (shared or per-slug) satisfies
//      and no unrelated env var can;
//   2. if the ref's trailing segment happens to name a *different* known
//      app, it's rejected too — otherwise a `slug: "basin"` row could still
//      read `NUXT_CLERK_SECRET_KEY_WANDERIST` and leak another property's
//      credential to a provider.
function assertSecretRefIsSafe(
  row: IntegrationConfigRow,
  secretRef: string,
): void {
  const requiredPrefix = `NUXT_${row.vendor.toUpperCase()}_`;
  if (!secretRef.startsWith(requiredPrefix)) {
    throw new IntegrationConfigError(
      `integration_config.secret_ref "${secretRef}" for vendor "${row.vendor}" must start with "${requiredPrefix}".`,
    );
  }

  const trailingSegment = secretRef.slice(secretRef.lastIndexOf("_") + 1);
  const belongsToAnotherApp =
    KNOWN_APP_SLUGS.has(trailingSegment) &&
    trailingSegment !== row.slug.toUpperCase();
  if (belongsToAnotherApp) {
    throw new IntegrationConfigError(
      `integration_config.secret_ref "${secretRef}" belongs to app "${trailingSegment.toLowerCase()}", not "${row.slug}".`,
    );
  }
}

// A row carries at most one secret source (enforced by the
// integration_config_single_secret DB check): `secretRef` names a shared
// studio-wide env var (e.g. "NUXT_SENTRY_AUTH_TOKEN"); `encryptedSecret` is
// a per-app AES-256-GCM override from server/utils/integrationSecrets.ts.
// `loadDecryptionKey` is a thunk (not the key itself) so a row that only
// uses `secretRef` never touches runtimeConfig — only the encryptedSecret
// branch actually needs the key, so only that branch calls it.
//
// Reads process.env directly rather than useRuntimeConfig() (unlike every
// other server/ module that touches config) because `secretRef` is a
// dynamic, row-supplied key name — Nuxt's runtimeConfig is a static schema
// declared in nuxt.config.ts, so there is no key to look up until the row is
// read. This is a deliberate, narrow exception to that convention, and it
// carries a known limitation: per nuxt.config.ts's own comment, the Netlify
// preset only bakes a `NUXT_*` value into the deployed function when it's
// named inline in `runtimeConfig` at build time — a bare `process.env` read
// at request time (this function) will not see it. Per README.md's
// "Integrations" section, each vendor's `runtimeConfig` entry is added in
// that vendor's own provider issue; until a given vendor has one, a row
// using `secretRef` for it will resolve correctly in local dev/tests (where
// dotenvx populates real process.env) but not once deployed. Tracked as a
// follow-up rather than fixed here, since wiring specific vendor env vars
// into runtimeConfig now would mean implementing vendor scaffolding this
// issue explicitly excludes.
function resolveSecret(
  row: IntegrationConfigRow,
  loadDecryptionKey: () => Buffer,
): string | null {
  if (row.secretRef && row.encryptedSecret) {
    // The integration_config_single_secret DB check should make this
    // unreachable. If it happens anyway (bypassed write path, corrupted
    // row), fail loud rather than silently picking one source over the
    // other for a vendor credential.
    throw new IntegrationConfigError(
      `integration_config ${row.slug}:${row.vendor} has both secret_ref and encrypted_secret set.`,
    );
  }

  if (row.secretRef) {
    assertSecretRefIsSafe(row, row.secretRef);
    const secretFromEnv = process.env[row.secretRef];
    if (!secretFromEnv) {
      throw new IntegrationConfigError(
        `integration_config ${row.slug}:${row.vendor} references env var "${row.secretRef}", which is not set.`,
      );
    }
    return secretFromEnv;
  }

  if (!row.encryptedSecret) {
    return null;
  }

  // Loaded outside the try so a broken/missing encryption key (an
  // environment-wide misconfiguration) throws its own clear
  // IntegrationSecretError instead of being caught below and relabeled as a
  // per-row decrypt failure.
  const decryptionKey = loadDecryptionKey();
  try {
    return decryptSecret(
      row.encryptedSecret,
      decryptionKey,
      `${row.slug}:${row.vendor}`,
    );
  } catch (cause) {
    throw new IntegrationSecretError(
      `Failed to decrypt integration_config secret for ${row.slug}:${row.vendor}.`,
      { cause },
    );
  }
}

/**
 * Resolves a raw `integration_config` row into the `IntegrationConfig` a
 * provider's `fetch()` receives. Providers see one already-resolved
 * `secret` field and never need to know (or branch on) whether it came from
 * a shared env var or a decrypted per-app override.
 *
 * Throws if the row is disabled — callers pass in only rows meant to sync;
 * enforcing it here means "sync a disabled integration" can't happen
 * silently just because a caller forgot to filter on `enabled` upstream.
 */
export function resolveIntegrationConfig(
  row: IntegrationConfigRow,
  loadDecryptionKey: () => Buffer = loadIntegrationEncryptionKey,
): IntegrationConfig {
  if (!row.enabled) {
    throw new IntegrationConfigError(
      `integration_config ${row.slug}:${row.vendor} is not enabled.`,
    );
  }

  return {
    slug: row.slug,
    vendor: row.vendor,
    externalId: row.externalId,
    secret: resolveSecret(row, loadDecryptionKey),
  };
}
