import { describe, it, expect, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { NuxtError } from "#app";
import { SIGNUPS_DISABLED_ERROR_CODE } from "#shared/constants/errors";
import ErrorPage from "~/error.vue";

const NOT_FOUND_ERROR: NuxtError = {
  statusCode: 404,
  statusMessage: "Not Found",
  name: "NuxtError",
  message: "Not Found",
  fatal: false,
};

const SIGNUPS_DISABLED_ERROR: NuxtError = {
  statusCode: 403,
  statusMessage: "Sign-ups are currently disabled",
  name: "NuxtError",
  message: "Sign-ups are currently disabled",
  fatal: false,
  data: { code: SIGNUPS_DISABLED_ERROR_CODE },
};

// A 403 that isn't the disabled-signups case — must not get that message.
const OTHER_FORBIDDEN_ERROR: NuxtError = {
  statusCode: 403,
  statusMessage: "Forbidden",
  name: "NuxtError",
  message: "Forbidden",
  fatal: false,
};

const UNAUTHORIZED_ERROR: NuxtError = {
  statusCode: 401,
  statusMessage: "Unauthorized",
  name: "NuxtError",
  message: "Unauthorized",
  fatal: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("error.vue", () => {
  it("renders the not-found message for a 404", () => {
    const wrapper = mount(ErrorPage, { props: { error: NOT_FOUND_ERROR } });

    expect(wrapper.find("h1").text()).toBe("This page isn't here.");
    expect(wrapper.find("p").text()).toBe(
      "The page you're looking for doesn't exist or has moved. Let's get you back on track.",
    );
    expect(wrapper.element).toMatchSnapshot();
  });

  it("renders a specific message for the disabled-signups 403", () => {
    const wrapper = mount(ErrorPage, {
      props: { error: SIGNUPS_DISABLED_ERROR },
    });

    expect(wrapper.find("h1").text()).toBe("Sign-ups are closed.");
    expect(wrapper.find("p").text()).toBe(
      "This dashboard isn't accepting new accounts right now. If you think you should have access, reach out to whoever invited you.",
    );
    expect(wrapper.element).toMatchSnapshot();
  });

  it("does not treat every 403 as the disabled-signups case", () => {
    const wrapper = mount(ErrorPage, {
      props: { error: OTHER_FORBIDDEN_ERROR },
    });

    expect(wrapper.find("h1").text()).toBe("Something went wrong.");
    expect(wrapper.find("p").text()).toBe(
      "An unexpected error occurred. Let's get you back on track.",
    );
  });

  it("renders the generic message for other non-404 errors, without echoing statusMessage", () => {
    const wrapper = mount(ErrorPage, { props: { error: UNAUTHORIZED_ERROR } });

    expect(wrapper.find("h1").text()).toBe("Something went wrong.");
    expect(wrapper.find("p").text()).toBe(
      "An unexpected error occurred. Let's get you back on track.",
    );
    expect(wrapper.element).toMatchSnapshot();
  });

  it("treats a null error as an unknown server error rather than a 404", () => {
    const wrapper = mount(ErrorPage, { props: { error: null } });

    expect(wrapper.find(".err__code").text()).toBe("500");
    expect(wrapper.find("h1").text()).toBe("Something went wrong.");
  });

  it("clears the error and redirects home on button click", async () => {
    const clearErrorSpy = vi.fn();
    vi.stubGlobal("clearError", clearErrorSpy);

    const wrapper = mount(ErrorPage, { props: { error: NOT_FOUND_ERROR } });
    await wrapper.find("button").trigger("click");

    expect(clearErrorSpy).toHaveBeenCalledWith({ redirect: "/" });
  });
});
