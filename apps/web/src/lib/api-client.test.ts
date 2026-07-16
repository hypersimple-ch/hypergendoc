import { describe, expect, it, vi, afterEach } from "vitest";
import { api } from "./api-client";

afterEach(() => vi.unstubAllGlobals());
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
});
