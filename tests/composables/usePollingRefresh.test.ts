import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import {
  DATA_REFRESH_INTERVAL_MS,
  usePollingRefresh,
} from "../../app/composables/usePollingRefresh";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("usePollingRefresh", () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
    setHidden(false);
  });

  it("calls refresh once per interval", async () => {
    const refresh = vi.fn();
    scope.run(() => usePollingRefresh(refresh));

    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("stops polling when the scope is disposed", async () => {
    const refresh = vi.fn();
    scope.run(() => usePollingRefresh(refresh));
    scope.stop();

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS * 3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("pauses while hidden and refreshes immediately on return", async () => {
    const refresh = vi.fn();
    scope.run(() => usePollingRefresh(refresh));

    setHidden(true);
    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS * 3);
    expect(refresh).not.toHaveBeenCalled();

    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("skips a tick while the previous refresh is still in flight", async () => {
    let resolveRefresh: () => void = () => {};
    const refresh = vi.fn(
      () => new Promise<void>((resolve) => (resolveRefresh = resolve)),
    );
    scope.run(() => usePollingRefresh(refresh));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh();
    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a refresh rejects", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("boom"));
    scope.run(() => usePollingRefresh(refresh));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not poll when the tab starts hidden", async () => {
    setHidden(true);
    const refresh = vi.fn();
    scope.run(() => usePollingRefresh(refresh));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not refresh on tab return within one interval of the last refresh", async () => {
    const refresh = vi.fn();
    scope.run(() => usePollingRefresh(refresh));

    await vi.advanceTimersByTimeAsync(DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    setHidden(true);
    setHidden(false);
    setHidden(true);
    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
