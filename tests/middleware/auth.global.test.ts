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

  it("redirects an unauthenticated visitor off / (the dashboard)", () => {
    authMiddleware(route("/"), route("/"));
    expect(mockNavigateTo).toHaveBeenCalledWith("/login");
  });

  it("lets an unauthenticated visitor stay on /login", () => {
    authMiddleware(route("/login"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("treats a trailing slash as the same route", () => {
    authMiddleware(route("/login/"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });

  it("redirects a signed-in user away from /login", () => {
    mockIsSignedIn.value = true;
    authMiddleware(route("/login"), route("/"));
    expect(mockNavigateTo).toHaveBeenCalledWith("/");
  });

  it("leaves a signed-in user on / (the dashboard)", () => {
    mockIsSignedIn.value = true;
    authMiddleware(route("/"), route("/"));
    expect(mockNavigateTo).not.toHaveBeenCalled();
  });
});
