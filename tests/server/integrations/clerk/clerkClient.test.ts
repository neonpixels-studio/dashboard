import { describe, expect, it, vi } from "vitest";
import type { ClerkClient, User } from "@clerk/backend";
import {
  classifySignInMethod,
  createClerkUserCountGetter,
  createClerkUserScanner,
  summarizeClerkUser,
} from "../../../../server/integrations/clerk/clerkClient";

function buildStubClerkClient(
  getCount: ClerkClient["users"]["getCount"],
  getUserList: ClerkClient["users"]["getUserList"],
): Pick<ClerkClient, "users"> {
  return {
    users: { getCount, getUserList } as ClerkClient["users"],
  };
}

describe("createClerkUserCountGetter", () => {
  it("calls the total-count endpoint when no createdAtAfter is given", async () => {
    const getCount = vi.fn(async () => 842);
    const getUserList = vi.fn();
    const getClerkUserCount = createClerkUserCountGetter(
      "sk_test_unused",
      buildStubClerkClient(getCount, getUserList),
    );

    const response = await getClerkUserCount({});

    expect(getCount).toHaveBeenCalledWith();
    expect(getUserList).not.toHaveBeenCalled();
    expect(response).toEqual({ totalCount: 842 });
  });

  it("calls the paginated user-list endpoint, scoped to createdAtAfter with the minimum page size, when a window is given", async () => {
    const getCount = vi.fn();
    const getUserList = vi.fn(async () => ({
      data: [],
      totalCount: 37,
    }));
    const getClerkUserCount = createClerkUserCountGetter(
      "sk_test_unused",
      buildStubClerkClient(getCount, getUserList),
    );

    const response = await getClerkUserCount({
      createdAtAfter: 1_700_000_000_000,
    });

    expect(getCount).not.toHaveBeenCalled();
    expect(getUserList).toHaveBeenCalledWith({
      createdAtAfter: 1_700_000_000_000,
      limit: 1,
    });
    expect(response).toEqual({ totalCount: 37 });
  });

  it("treats createdAtAfter: 0 as a real window boundary, not as unset", async () => {
    const getCount = vi.fn();
    const getUserList = vi.fn(async () => ({ data: [], totalCount: 5 }));
    const getClerkUserCount = createClerkUserCountGetter(
      "sk_test_unused",
      buildStubClerkClient(getCount, getUserList),
    );

    await getClerkUserCount({ createdAtAfter: 0 });

    expect(getUserList).toHaveBeenCalledWith({ createdAtAfter: 0, limit: 1 });
    expect(getCount).not.toHaveBeenCalled();
  });
});

function buildUser(overrides: Record<string, unknown> = {}): User {
  return {
    createdAt: 1_700_000_000_000,
    lastActiveAt: 1_700_100_000_000,
    passwordEnabled: false,
    enterpriseAccounts: [],
    web3Wallets: [],
    emailAddresses: [{ verification: { status: "verified" } }],
    externalAccounts: [],
    ...overrides,
  } as unknown as User;
}

describe("classifySignInMethod", () => {
  it.each([
    [{ externalAccounts: [{ provider: "oauth_github" }] }, "github"],
    [{ externalAccounts: [{ provider: "google" }] }, "google"],
    [{ enterpriseAccounts: [{}], passwordEnabled: true }, "sso"],
    [{ web3Wallets: [{}] }, "web3"],
    [{ externalAccounts: [], passwordEnabled: true }, "password"],
    [{ externalAccounts: [], passwordEnabled: false }, "passwordless"],
  ])("classifies %j as %s", (overrides, expected) => {
    expect(classifySignInMethod(buildUser(overrides))).toBe(expected);
  });

  it("prefers a linked social provider over a password", () => {
    const user = buildUser({
      externalAccounts: [{ provider: "oauth_google" }],
      passwordEnabled: true,
    });

    expect(classifySignInMethod(user)).toBe("google");
  });
});

describe("summarizeClerkUser", () => {
  it("keeps only timestamps, email verification and method - no identifying fields", () => {
    const summary = summarizeClerkUser(
      buildUser({ id: "user_1", firstName: "Dan" }),
    );

    expect(summary).toEqual({
      createdAt: 1_700_000_000_000,
      lastActiveAt: 1_700_100_000_000,
      hasVerifiedEmail: true,
      signInMethod: "passwordless",
    });
  });

  it("treats an unverified or verification-less email as not verified", () => {
    expect(
      summarizeClerkUser(
        buildUser({
          emailAddresses: [
            { verification: { status: "unverified" } },
            { verification: null },
          ],
        }),
      ).hasVerifiedEmail,
    ).toBe(false);
  });
});

describe("createClerkUserScanner", () => {
  function pagedClient(pages: User[][], totalCount: number) {
    const getUserList = vi.fn(async ({ offset }: { offset: number }) => ({
      data: pages[offset / 500] ?? [],
      totalCount,
    }));
    const client = {
      users: {
        getCount: vi.fn(),
        getUserList,
      } as unknown as ClerkClient["users"],
    };
    return { client, getUserList };
  }

  it("pages through the user list at the max page size until every user is seen", async () => {
    const firstPage = Array.from({ length: 500 }, () => buildUser());
    const secondPage = [buildUser(), buildUser()];
    const { client, getUserList } = pagedClient([firstPage, secondPage], 502);

    const scan = await createClerkUserScanner("sk_test_unused", client)();

    expect(getUserList).toHaveBeenCalledTimes(2);
    expect(getUserList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 500, offset: 500 }),
    );
    expect(scan.users).toHaveLength(502);
    expect(scan.totalCount).toBe(502);
  });

  it("can complete a scan of exactly the cap (10 full pages)", async () => {
    const fullPage = Array.from({ length: 500 }, () => buildUser());
    const { client, getUserList } = pagedClient(
      Array.from({ length: 10 }, () => fullPage),
      5_000,
    );

    const scan = await createClerkUserScanner("sk_test_unused", client)();

    expect(getUserList).toHaveBeenCalledTimes(10);
    expect(scan.users).toHaveLength(5_000);
    expect(scan.consistent).toBe(true);
  });

  it("makes a single request for an instance over the page cap, since the scan can never complete", async () => {
    const fullPage = Array.from({ length: 500 }, () => buildUser());
    const { client, getUserList } = pagedClient([fullPage], 5_001);

    const scan = await createClerkUserScanner("sk_test_unused", client)();

    expect(getUserList).toHaveBeenCalledTimes(1);
    expect(scan.totalCount).toBe(5_001);
    expect(scan.users).toHaveLength(500);
  });

  it("flags the scan inconsistent when the total shrinks between pages (mid-scan deletion)", async () => {
    const fullPage = Array.from({ length: 500 }, () => buildUser());
    const totals = [501, 500];
    const getUserList = vi.fn(async ({ offset }: { offset: number }) => ({
      data: offset === 0 ? fullPage : [buildUser()],
      totalCount: totals[offset / 500]!,
    }));
    const client = {
      users: { getUserList } as unknown as ClerkClient["users"],
    };

    const scan = await createClerkUserScanner("sk_test_unused", client)();

    expect(scan.users).toHaveLength(501);
    expect(scan.consistent).toBe(false);
  });

  it("reports a stable scan as consistent", async () => {
    const { client } = pagedClient([[buildUser()]], 1);

    const scan = await createClerkUserScanner("sk_test_unused", client)();

    expect(scan.consistent).toBe(true);
  });

  it("stops on an empty page even if the reported total is larger", async () => {
    const { client, getUserList } = pagedClient([[]], 50);

    const scan = await createClerkUserScanner("sk_test_unused", client)();

    expect(getUserList).toHaveBeenCalledTimes(1);
    expect(scan.users).toEqual([]);
  });
});
