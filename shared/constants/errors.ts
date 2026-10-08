// Stable error codes carried in createError()'s `data` field. A statusCode
// alone isn't a reliable discriminator on app/error.vue — multiple call
// sites can throw the same code for different reasons (e.g. any future 403
// alongside the disabled-signups one in server/utils/auth.ts) — so consumers
// match on this instead of statusCode + statusMessage.
export const SIGNUPS_DISABLED_ERROR_CODE = "signups_disabled";

// Thrown with a 403 when a Clerk identity is not on the owner allowlist.
export const NOT_OWNER_ERROR_CODE = "not_owner";
