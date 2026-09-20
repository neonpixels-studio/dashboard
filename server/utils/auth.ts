import type { H3Event } from "h3";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { useDb } from "../db";
import { users } from "../db/schema";

export type DbUser = InferSelectModel<typeof users>;

declare module "h3" {
  interface H3EventContext {
    user?: DbUser;
  }
}

export function requireUser(event: H3Event): DbUser {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return user;
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
