import { afterEach, describe, expect, it, vi } from "vitest";
import { authClient } from "./auth-client";
afterEach(() => vi.unstubAllGlobals());
describe("auth client", () => {
  it("uses Better Auth email paths with cookie credentials and never logs a password", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const logger = vi.spyOn(console, "log");
    vi.stubGlobal("fetch", fetcher);
    await authClient.login(
      "person@example.test",
      "a password that stays local",
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/sign-in/email");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    });
    expect(logger).not.toHaveBeenCalled();
    logger.mockRestore();
  });
});
