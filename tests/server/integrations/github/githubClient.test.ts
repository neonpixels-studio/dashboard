import { describe, expect, it, vi } from "vitest";
import { createGithubClient } from "../../../../server/integrations/github/githubClient";
import { fakeGithubFetch, jsonOk } from "./fakeGithubFetch";

const TOKEN = "github_pat_secret";

function linkTo(url: string): HeadersInit {
  return { link: `<${url}>; rel="next", <${url}>; rel="last"` };
}

describe("createGithubClient", () => {
  it("sends the token, API version and accept header", async () => {
    const { fetchImpl, requests } = fakeGithubFetch({
      "/repos/o/r": { id: 1 },
    });
    const client = createGithubClient({ token: TOKEN, fetchImpl });

    await expect(client.get("/repos/o/r", { per_page: 5 })).resolves.toEqual({
      id: 1,
    });

    const [request] = requests;
    expect(request!.url.searchParams.get("per_page")).toBe("5");
    expect(request!.init?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  });

  it("fails loud on a non-2xx status without leaking the token", async () => {
    const { fetchImpl } = fakeGithubFetch({
      "/repos/o/r": () => new Response("nope", { status: 403 }),
    });
    const client = createGithubClient({ token: TOKEN, fetchImpl });

    const failure = await client.get("/repos/o/r").catch((error) => error);

    expect(failure.message).toBe(
      "GitHub GET /repos/o/r failed with status 403.",
    );
    expect(failure.message).not.toContain(TOKEN);
  });

  it("fails loud on a non-JSON body", async () => {
    const { fetchImpl } = fakeGithubFetch({
      "/repos/o/r": () => new Response("<html>", { status: 200 }),
    });
    const client = createGithubClient({ token: TOKEN, fetchImpl });

    await expect(client.get("/repos/o/r")).rejects.toThrow(/non-JSON/);
  });

  it("reports the shared run budget when the deadline aborts the request", async () => {
    const controller = new AbortController();
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      controller.abort();
      init?.signal?.throwIfAborted();
      return jsonOk({});
    }) as typeof fetch;
    const client = createGithubClient({
      token: TOKEN,
      fetchImpl,
      deadline: { signal: controller.signal, remainingMs: () => 0 },
    });

    await expect(client.get("/repos/o/r")).rejects.toThrow(/run budget/);
  });

  it("times out a request that never answers", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = ((_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
        })) as typeof fetch;
      const client = createGithubClient({ token: TOKEN, fetchImpl });

      const outcome = client.get("/repos/o/r").catch((error) => error);
      await vi.advanceTimersByTimeAsync(20_000);

      expect((await outcome).message).toMatch(/timed out after 20000ms/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to defaults for options passed as undefined", async () => {
    const { fetchImpl } = fakeGithubFetch({ "/repos/o/r": { id: 1 } });
    const client = createGithubClient({
      token: TOKEN,
      fetchImpl,
      deadline: undefined,
      baseUrl: undefined,
    });

    await expect(client.get("/repos/o/r")).resolves.toEqual({ id: 1 });
  });

  describe("getAllPages", () => {
    it("requests 100 per page and follows Link rel=next across every page", async () => {
      const { fetchImpl, requests } = fakeGithubFetch({
        "/items": (url) => {
          const page = Number(url.searchParams.get("page") ?? 1);
          if (page === 1) {
            return jsonOk(
              [{ n: 1 }, { n: 2 }],
              linkTo("https://api.github.com/items?per_page=100&page=2"),
            );
          }
          if (page === 2) {
            return jsonOk(
              [{ n: 3 }],
              linkTo("https://api.github.com/items?per_page=100&page=3"),
            );
          }
          return jsonOk([{ n: 4 }]);
        },
      });
      const client = createGithubClient({ token: TOKEN, fetchImpl });

      const items = await client.getAllPages("/items", { state: "open" });

      expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]);
      expect(requests).toHaveLength(3);
      expect(requests[0]!.url.searchParams.get("per_page")).toBe("100");
      expect(requests[0]!.url.searchParams.get("state")).toBe("open");
    });

    it("refuses a Link header that points at another host", async () => {
      const { fetchImpl, requests } = fakeGithubFetch({
        "/items": jsonOkWithLink("https://evil.example/items?page=2"),
      });
      const client = createGithubClient({ token: TOKEN, fetchImpl });

      await expect(client.getAllPages("/items")).rejects.toThrow(/off-host/);
      expect(requests).toHaveLength(1);
    });

    it("reads items out of a wrapped page when given a picker", async () => {
      const { fetchImpl } = fakeGithubFetch({
        "/items": (url) =>
          url.searchParams.get("page") === "2"
            ? jsonOk({ things: [{ n: 3 }] })
            : jsonOk(
                { things: [{ n: 1 }, { n: 2 }] },
                linkTo("https://api.github.com/items?page=2"),
              ),
      });
      const client = createGithubClient({ token: TOKEN, fetchImpl });

      const items = await client.getAllPages(
        "/items",
        {},
        (body) => (body as { things: unknown[] }).things,
      );

      expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it("rejects a page that is not an array", async () => {
      const { fetchImpl } = fakeGithubFetch({ "/items": { message: "hi" } });
      const client = createGithubClient({ token: TOKEN, fetchImpl });

      await expect(client.getAllPages("/items")).rejects.toThrow(/non-array/);
    });

    it("gives up on a Link chain that never ends", async () => {
      const { fetchImpl } = fakeGithubFetch({
        "/items": jsonOkWithLink("https://api.github.com/items?page=2"),
      });
      const client = createGithubClient({ token: TOKEN, fetchImpl });

      await expect(client.getAllPages("/items")).rejects.toThrow(/exceeded/);
    });
  });
});

function jsonOkWithLink(nextUrl: string) {
  return () => jsonOk([{ n: 1 }], linkTo(nextUrl));
}
