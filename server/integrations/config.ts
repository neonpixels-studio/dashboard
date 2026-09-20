import {
  decryptSecret,
  loadIntegrationEncryptionKey,
  IntegrationSecretError,
} from "../utils/integrationSecrets";
import type { IntegrationConfig, IntegrationConfigRow } from "./types";

export class IntegrationConfigError extends Error {
  name = "IntegrationConfigError";
}

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
// literal names to enumerate. Instead, the ref must be scoped to the row's
// own vendor via a "NUXT_<VENDOR>_" prefix, which every legitimate name
// (shared or per-slug) satisfies and no unrelated env var can.
function assertSecretRefIsSafe(
  row: IntegrationConfigRow,
  secretRef: string,
): void {
  const requiredPrefix = `NUXT_${row.vendor.toUpperCase()}_`;
  if (!secretRef.startsWith(requiredPrefix)) {
    throw new IntegrationSecretError(
      `integration_config.secret_ref "${secretRef}" for vendor "${row.vendor}" must start with "${requiredPrefix}".`,
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
  if (row.secretRef && row.encryptedSecret) {
    // The integration_config_single_secret DB check should make this
    // unreachable. If it happens anyway (bypassed write path, corrupted
    // row), fail loud rather than silently picking one source over the
    // other for a vendor credential.
    throw new IntegrationSecretError(
      `integration_config ${row.slug}:${row.vendor} has both secret_ref and encrypted_secret set.`,
    );
  }

  if (row.secretRef) {
    assertSecretRefIsSafe(row, row.secretRef);
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
