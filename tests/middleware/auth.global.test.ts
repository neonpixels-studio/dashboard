import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";
import type { RouteLocationNormalized } from "vue-router";

const mockIsSignedIn = ref(false);
const mockNavigateTo = vi.fn();

vi.stubGlobal("useAuth", () => ({ isSignedIn: mockIsSignedIn }));
vi.stubGlobal("navigateTo", mockNavigateTo);

const { default: authMiddleware } = await import("~/middleware/auth.global");

function route(path: string) {
  return { path } as RouteLocationNormalized;
}

describe("auth.global middleware", () => {
  beforeEach(() => {
    mockIsSignedIn.value = false;
    mockNavigateTo.mockClear();
  });

  it("lets an unauthenticated visitor stay on / (public)", () => {
    authMiddleware(route("/"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("lets an unauthenticated visitor stay on /login", () => {
    authMiddleware(route("/login"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor off a protected route", () => {
    authMiddleware(route("/dashboard"), route("/"));
    expect(mockNavigateTo).toHaveBeenCalledWith("/login");
  });

  it("treats a trailing slash as the same route", () => {
    authMiddleware(route("/login/"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects a signed-in user away from /login", () => {
    mockIsSignedIn.value = true;
    authMiddleware(route("/login"), route("/"));
    expect(mockNavigateTo).toHaveBeenCalledWith("/dashboard");
  });

  it("leaves a signed-in user on / (public landing stays reachable)", () => {
    mockIsSignedIn.value = true;
    authMiddleware(route("/"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("leaves a signed-in user on a protected route", () => {
    mockIsSignedIn.value = true;
    authMiddleware(route("/dashboard"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });
});
