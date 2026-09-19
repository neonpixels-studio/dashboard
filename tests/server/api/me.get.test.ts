import { describe, it, expect } from "vitest";
import type { H3Event } from "h3";

const { default: meHandler } = await import("../../../server/api/me.get");

const dbUser = {
  id: 7,
  providerId: "user_abc",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("GET /api/me", () => {
  it("returns the current user without leaking the Clerk provider id", () => {
    const event = { context: { user: dbUser } } as unknown as H3Event;

    expect(meHandler(event)).toEqual({
      id: dbUser.id,
      createdAt: dbUser.createdAt,
    });
  });

  it("throws 401 when the middleware resolved no user", () => {
    const event = { context: {} } as unknown as H3Event;

    expect(() => meHandler(event)).toThrowError(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});
