import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import type { NuxtError } from "#app";
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
};

const GENERIC_ERROR: NuxtError = {
  statusCode: 401,
  statusMessage: "Unauthorized",
  name: "NuxtError",
  message: "Unauthorized",
  fatal: false,
};

beforeEach(() => {
  globalThis.clearError = () => {};
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

  it("falls back to the error's statusMessage for other non-404 errors", () => {
    const wrapper = mount(ErrorPage, { props: { error: GENERIC_ERROR } });

    expect(wrapper.find("h1").text()).toBe("Something went wrong.");
    expect(wrapper.find("p").text()).toBe("Unauthorized");
    expect(wrapper.element).toMatchSnapshot();
  });

  it("falls back to a generic message when the error has no statusMessage", () => {
    const wrapper = mount(ErrorPage, {
      props: {
        error: { ...GENERIC_ERROR, statusMessage: "" },
      },
    });

    expect(wrapper.find("h1").text()).toBe("Something went wrong.");
    expect(wrapper.find("p").text()).toBe(
      "An unexpected error occurred. Let's get you back on track.",
    );
  });

  it("treats a null error as a 404", () => {
    const wrapper = mount(ErrorPage, { props: { error: null } });

    expect(wrapper.find(".err__code").text()).toBe("404");
    expect(wrapper.find("h1").text()).toBe("This page isn't here.");
  });
});
