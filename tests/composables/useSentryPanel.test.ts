import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const { useSentryPanel } = await import("../../app/composables/useSentryPanel");

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubUseFetch() {
  const mockUseFetch = vi.fn(() => ({
    data: ref(null),
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn(),
  }));
  vi.stubGlobal("useFetch", mockUseFetch);
  return mockUseFetch;
}

describe("useSentryPanel", () => {
  it("requests the app's sentry endpoint, encoding the slug", () => {
    const mockUseFetch = stubUseFetch();

    useSentryPanel(() => "a/b?c");

    const [urlGetter, options] = mockUseFetch.mock.calls[0] as unknown as [
      () => string,
      { key: () => string; enabled: () => boolean },
    ];
    expect(urlGetter()).toBe("/api/apps/a%2Fb%3Fc/sentry");
    expect(options.key()).toBe("app-sentry-a%2Fb%3Fc");
  });

  it("loads client-side only so it cannot block server rendering", () => {
    const mockUseFetch = stubUseFetch();

    useSentryPanel("basin");

    const [, options] = mockUseFetch.mock.calls[0] as unknown as [
      unknown,
      { server: boolean; lazy: boolean },
    ];
    expect(options.server).toBe(false);
    expect(options.lazy).toBe(true);
  });

  it("does not fetch for an empty slug", () => {
    const mockUseFetch = stubUseFetch();

    useSentryPanel("");

    const [, options] = mockUseFetch.mock.calls[0] as unknown as [
      unknown,
      { enabled: () => boolean },
    ];
    expect(options.enabled()).toBe(false);
  });
});
