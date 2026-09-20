import type { H3Event } from "h3";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { useDb } from "../db";
import { users } from "../db/schema";
import { SIGNUPS_DISABLED_ERROR_CODE } from "../../shared/constants/errors";

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
      data: { code: SIGNUPS_DISABLED_ERROR_CODE },
    });
  }

  const [created] = await database
    .insert(users)
    .values({ providerId })
    .returning();
  return created;
}
