import { describe, expect, it, vi } from "vitest";
import type { ClerkClient } from "@clerk/backend";
import { createClerkUserCountGetter } from "../../../../server/integrations/clerk/clerkClient";

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
