import { describe, it, expect, beforeEach, vi } from "vitest";
import type { H3Event } from "h3";

const mockFindFirst = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn();
const mockInsert = vi.fn();

const runtimeConfig = { disableSignups: "" };

vi.mock("../../../server/db", () => ({
  useDb: () => ({
    query: { users: { findFirst: mockFindFirst } },
    insert: mockInsert,
  }),
}));
vi.stubGlobal("useRuntimeConfig", () => runtimeConfig);

const { getOrCreateUser, requireUser, signupsDisabled } =
  await import("../../../server/utils/auth");

const existingUser = {
  id: 1,
  providerId: "user_abc",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("requireUser", () => {
  it("returns the user resolved onto the event context", () => {
    const event = { context: { user: existingUser } } as unknown as H3Event;
    expect(requireUser(event)).toEqual(existingUser);
  });

  it("throws 401 when no user is on the context", () => {
    const event = { context: {} } as unknown as H3Event;
    expect(() => requireUser(event)).toThrowError(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});

describe("signupsDisabled", () => {
  it('is true only for the exact string "true"', () => {
    runtimeConfig.disableSignups = "true";
    expect(signupsDisabled()).toBe(true);

    runtimeConfig.disableSignups = "TRUE";
    expect(signupsDisabled()).toBe(false);

    runtimeConfig.disableSignups = "";
    expect(signupsDisabled()).toBe(false);
  });
});

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runtimeConfig.disableSignups = "";
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ returning: mockReturning });
  });

  it("returns the existing row without inserting", async () => {
    mockFindFirst.mockResolvedValue(existingUser);

    await expect(getOrCreateUser("user_abc")).resolves.toEqual(existingUser);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts and returns a new row when none exists", async () => {
    const created = { ...existingUser, id: 2, providerId: "user_xyz" };
    mockFindFirst.mockResolvedValue(undefined);
    mockReturning.mockResolvedValue([created]);

    await expect(getOrCreateUser("user_xyz")).resolves.toEqual(created);
    expect(mockValues).toHaveBeenCalledWith({ providerId: "user_xyz" });
  });

  it("throws 403 for a brand-new identity when sign-ups are disabled", async () => {
    runtimeConfig.disableSignups = "true";
    mockFindFirst.mockResolvedValue(undefined);

    await expect(getOrCreateUser("user_new")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("still returns an existing user when sign-ups are disabled", async () => {
    runtimeConfig.disableSignups = "true";
    mockFindFirst.mockResolvedValue(existingUser);

    await expect(getOrCreateUser("user_abc")).resolves.toEqual(existingUser);
  });
});
