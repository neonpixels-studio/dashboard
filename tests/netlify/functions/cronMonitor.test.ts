import { afterEach, describe, expect, it, vi } from "vitest";

const captureCheckInMock = vi.fn();

vi.mock("@sentry/nuxt", () => ({
  captureCheckIn: (...args: unknown[]) => captureCheckInMock(...args),
}));

import {
  SCHEDULED_SYNC_CRON,
  SCHEDULED_SYNC_MONITOR_CONFIG,
  SCHEDULED_SYNC_MONITOR_SLUG,
  withScheduledSyncMonitor,
} from "../../../netlify/functions/cronMonitor";
import { config } from "../../../netlify/functions/scheduled-sync";

const DSN = "https://example@o0.ingest.sentry.io/1";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  captureCheckInMock.mockReset();
});

describe("monitor config", () => {
  it("uses the same cron expression as the function's Netlify schedule", () => {
    expect(SCHEDULED_SYNC_CRON).toBe(config.schedule);
    expect(SCHEDULED_SYNC_MONITOR_CONFIG.schedule).toEqual({
      type: "crontab",
      value: config.schedule,
    });
  });
});

describe("withScheduledSyncMonitor", () => {
  it("sends in_progress with the upsert config, then ok on a 2xx response", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    captureCheckInMock.mockReturnValueOnce("check-in-1");
    const response = new Response("ok", { status: 200 });

    const result = await withScheduledSyncMonitor(async () => response);

    expect(result).toBe(response);
    expect(captureCheckInMock).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: SCHEDULED_SYNC_MONITOR_SLUG, status: "in_progress" },
      SCHEDULED_SYNC_MONITOR_CONFIG,
    );
    expect(captureCheckInMock).toHaveBeenNthCalledWith(
      2,
      {
        monitorSlug: SCHEDULED_SYNC_MONITOR_SLUG,
        status: "ok",
        checkInId: "check-in-1",
      },
      undefined,
    );
  });

  it("sends error when the job returns a non-2xx response", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    captureCheckInMock.mockReturnValueOnce("check-in-1");

    await withScheduledSyncMonitor(
      async () => new Response("bad", { status: 502 }),
    );

    expect(captureCheckInMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error", checkInId: "check-in-1" }),
      undefined,
    );
  });

  it("sends error and rethrows the original error when the job throws", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    captureCheckInMock.mockReturnValueOnce("check-in-1");
    const failure = new Error("boom");

    await expect(
      withScheduledSyncMonitor(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(captureCheckInMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error", checkInId: "check-in-1" }),
      undefined,
    );
  });

  it("no-ops without SENTRY_DSN but still runs the job", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const response = new Response("ok");

    const result = await withScheduledSyncMonitor(async () => response);

    expect(result).toBe(response);
    expect(captureCheckInMock).not.toHaveBeenCalled();
  });

  it("does not let an SDK failure break the job", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    captureCheckInMock.mockImplementation(() => {
      throw new Error("sdk down");
    });
    const response = new Response("ok");

    await expect(withScheduledSyncMonitor(async () => response)).resolves.toBe(
      response,
    );
  });
});
