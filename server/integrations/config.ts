import {
  decryptSecret,
  loadIntegrationEncryptionKey,
  IntegrationSecretError,
} from "../utils/integrationSecrets";
import type { IntegrationConfig, IntegrationConfigRow } from "./types";

// `secretRef` is a row-supplied string used to index process.env — without a
// guard, any writer of an integration_config row (admin UI, seed data, a
// future import path) could point it at an unrelated, sensitive env var and
// have that value handed straight to a provider whose job is to send
// credentials to a third party. The naming convention constrains it to the
// "shared studio env var" shape described on integrationConfig in
// server/db/schema.ts; the denylist hard-blocks the specific NUXT_-prefixed
// vars this app relies on for things other than vendor integrations.
const SECRET_REF_PATTERN = /^NUXT_[A-Z0-9_]+$/;
const FORBIDDEN_SECRET_REFS = new Set([
  "NUXT_INTEGRATION_ENCRYPTION_KEY",
  "NUXT_DISABLE_SIGNUPS",
]);

function assertSecretRefIsSafe(secretRef: string): void {
  const isWellFormed = SECRET_REF_PATTERN.test(secretRef);
  const isForbidden = FORBIDDEN_SECRET_REFS.has(secretRef);
  if (!isWellFormed || isForbidden) {
    throw new IntegrationSecretError(
      `integration_config.secret_ref "${secretRef}" is not a valid integration secret name.`,
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
// read. This is a deliberate, narrow exception to that convention.
function resolveSecret(
  row: IntegrationConfigRow,
  loadDecryptionKey: () => Buffer,
): string | null {
  if (row.secretRef) {
    assertSecretRefIsSafe(row.secretRef);
    const secretFromEnv = process.env[row.secretRef];
    if (!secretFromEnv) {
      throw new IntegrationSecretError(
        `integration_config ${row.slug}:${row.vendor} references env var "${row.secretRef}", which is not set.`,
      );
    }
    return secretFromEnv;
  }
  if (row.encryptedSecret) {
    try {
      return decryptSecret(
        row.encryptedSecret,
        loadDecryptionKey(),
        `${row.slug}:${row.vendor}`,
      );
    } catch (cause) {
      throw new IntegrationSecretError(
        `Failed to decrypt integration_config secret for ${row.slug}:${row.vendor}.`,
        { cause },
      );
    }
  }
  return null;
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
    throw new Error(
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
