import { describe, expect, it, vi, afterEach } from "vitest";
import { api, clearApiCache } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiCache();
});
describe("api client", () => {
  it("sends cookie credentials and surfaces safe contract errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Sign in required.",
            requestId: "request-123",
          },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(api("/api/workspaces/current")).rejects.toMatchObject({
      code: "unauthenticated",
      message: "Sign in required.",
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    });
  });
  it("does not expose malformed server responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(api("/api/companies")).rejects.toMatchObject({
      message: "We could not complete that request. Please try again.",
    });
  });

  it("deduplicates identical in-flight GET requests", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        calls += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const [first, second] = await Promise.all([
      api("/api/workspaces/current"),
      api("/api/workspaces/current"),
    ]);
    expect(calls).toBe(1);
    expect(first).toEqual(second);
  });

  it("reuses a recent GET response within the cache window", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        calls += 1;
        return new Response(JSON.stringify({ n: calls }), { status: 200 });
      }),
    );
    await api("/api/workspaces/current");
    const again = await api("/api/workspaces/current");
    expect(calls).toBe(1);
    expect(again).toEqual({ n: 1 });
  });

  it("clears the GET cache after a non-GET request", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
        calls += 1;
        return new Response(JSON.stringify({ method: init?.method ?? "GET" }), {
          status: 200,
        });
      }),
    );
    await api("/api/workspaces/current");
    await api("/api/workspaces", { method: "POST", body: { name: "x" } });
    const fresh = await api("/api/workspaces/current");
    expect(calls).toBe(3);
    expect(fresh).toEqual({ method: "GET" });
  });

  it("does not serve a failed GET from the cache", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        calls += 1;
        return new Response("nope", { status: 500 });
      }),
    );
    await expect(api("/api/workspaces/current")).rejects.toMatchObject({
      code: "network_error",
    });
    await expect(api("/api/workspaces/current")).rejects.toBeDefined();
    expect(calls).toBe(2);
  });
});
