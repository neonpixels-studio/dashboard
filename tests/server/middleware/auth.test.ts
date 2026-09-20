import { describe, it, expect, beforeEach, vi } from "vitest";
import type { H3Event } from "h3";

const mockGetOrCreateUser = vi.fn();

// clerkMiddleware is identity here so the test drives the inner handler
// directly; Clerk's own session verification is not under test.
vi.mock("@clerk/nuxt/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
}));
vi.mock("../../../server/utils/auth", () => ({
  getOrCreateUser: mockGetOrCreateUser,
}));

const { default: authMiddleware } =
  await import("../../../server/middleware/auth");

const dbUser = { id: 1, providerId: "user_abc" };

function eventWithUserId(
  userId: string | null,
  headers: Record<string, string> = {},
) {
  return {
    context: { auth: () => ({ userId }) },
    node: { req: { headers } },
  } as unknown as H3Event;
}

describe("server auth middleware", () => {
  beforeEach(() => {
    mockGetOrCreateUser.mockReset();
    mockGetOrCreateUser.mockResolvedValue(dbUser);
  });

  it("resolves the database user onto the event context", async () => {
    const event = eventWithUserId("user_abc");

    await authMiddleware(event);

    expect(mockGetOrCreateUser).toHaveBeenCalledWith("user_abc");
    expect(event.context.user).toEqual(dbUser);
  });

  it("passes an unauthenticated request through with no user", async () => {
    const event = eventWithUserId(null);

    await authMiddleware(event);

    expect(mockGetOrCreateUser).not.toHaveBeenCalled();
    expect(event.context.user).toBeUndefined();
  });

  it("propagates a rejected sign-up so the request fails loud", async () => {
    mockGetOrCreateUser.mockRejectedValue(
      Object.assign(new Error("Sign-ups are currently disabled"), {
        statusCode: 403,
      }),
    );

    await expect(
      authMiddleware(eventWithUserId("user_new")),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("no-ops on Nitro's internal error-render request instead of re-throwing", async () => {
    mockGetOrCreateUser.mockRejectedValue(
      Object.assign(new Error("Sign-ups are currently disabled"), {
        statusCode: 403,
      }),
    );
    const event = eventWithUserId("user_new", { "x-nuxt-error": "true" });

    await authMiddleware(event);

    expect(mockGetOrCreateUser).not.toHaveBeenCalled();
    expect(event.context.user).toBeUndefined();
  });
});
