import { describe, expect, it } from "vitest";
import { combineCiStates } from "../../shared/utils/githubCi";

describe("combineCiStates", () => {
  it("fails if any input fails, even beside pending and passing", () => {
    expect(combineCiStates(["passing", "pending", "failing"])).toBe("failing");
  });

  it("is pending when something is pending and nothing failed", () => {
    expect(combineCiStates(["passing", "pending", null])).toBe("pending");
  });

  it("passes only when everything with a signal passed", () => {
    expect(combineCiStates(["passing", null, "none"])).toBe("passing");
  });

  it("is none when only no-CI repos have a signal", () => {
    expect(combineCiStates(["none", null])).toBe("none");
  });

  it("is null when nothing has a signal at all", () => {
    expect(combineCiStates([])).toBeNull();
    expect(combineCiStates([null, null])).toBeNull();
  });
});
