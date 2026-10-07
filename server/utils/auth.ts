import type { H3Event } from "h3";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { useDb } from "../db";
import { users } from "../db/schema";
import {
  NOT_OWNER_ERROR_CODE,
  SIGNUPS_DISABLED_ERROR_CODE,
} from "#shared/constants/errors";

export type DbUser = InferSelectModel<typeof users>;

declare module "h3" {
  interface H3EventContext {
    user?: DbUser;
  }
}

const ALLOWLIST_SEPARATOR = ",";

export function requireUser(event: H3Event): DbUser {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  assertOwner(user.providerId);
  return user;
}

function ownerClerkUserIds(): string[] {
  // Read via runtimeConfig for the same build-time bake-in as signupsDisabled().
  return useRuntimeConfig()
    .ownerClerkUserIds.split(ALLOWLIST_SEPARATOR)
    .map((userId: string) => userId.trim())
    .filter((userId: string) => userId.length > 0);
}

// Fails closed: an unset or empty allowlist matches nobody.
export function isOwner(providerId: string): boolean {
  return ownerClerkUserIds().includes(providerId);
}

export function assertOwner(providerId: string): void {
  if (isOwner(providerId)) {
    return;
  }
  throw createError({
    statusCode: 403,
    statusMessage: "Forbidden",
    data: { code: NOT_OWNER_ERROR_CODE },
  });
}

export function signupsDisabled(): boolean {
  // Read via runtimeConfig (not process.env) so the value bakes into the server
  // bundle at build time and survives into the deployed Netlify function.
  return useRuntimeConfig().disableSignups === "true";
}

export async function getOrCreateUser(providerId: string): Promise<DbUser> {
  const database = useDb();

  const existing = await database.query.users.findFirst({
    where: eq(users.providerId, providerId),
  });
  if (existing) {
    return existing;
  }

  if (signupsDisabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: "Sign-ups are currently disabled",
      data: { code: SIGNUPS_DISABLED_ERROR_CODE },
    });
  }

  // onConflictDoNothing guards a race between two concurrent first-time
  // requests for the same providerId (e.g. a login firing parallel API
  // calls): both can miss the findFirst() above, but the unique constraint
  // on provider_id lets only one insert win. The loser gets an empty
  // `returning()` here instead of an unhandled unique-violation error, and
  // re-reads the row the winner just created.
  const [created] = await database
    .insert(users)
    .values({ providerId })
    .onConflictDoNothing({ target: users.providerId })
    .returning();
  if (created) {
    return created;
  }

  const raced = await database.query.users.findFirst({
    where: eq(users.providerId, providerId),
  });
  if (!raced) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create user",
    });
  }
  return raced;
}
