import { afterEach, describe, expect, it, vi } from "vitest";
import { authClient } from "./auth-client";
afterEach(() => vi.unstubAllGlobals());
describe("auth client", () => {
  it("uses Better Auth email paths with cookie credentials and never logs a password", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
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

  it("surfaces Better Auth's safe top-level failure message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: "Email or password is incorrect." }),
            { status: 401 },
          ),
        ),
    );

    await expect(
      authClient.login("person@example.test", "incorrect password"),
    ).rejects.toThrow("Email or password is incorrect.");
  });

  it("uses the login verification callback for signup and resend requests", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    await authClient.register("Person", "person@example.test", "password");
    await authClient.sendVerification("person@example.test");

    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/auth/sign-up/email");
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      name: "Person",
      email: "person@example.test",
      password: "password",
      callbackURL: "/login?verified=true",
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "/api/auth/send-verification-email",
    );
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string)).toEqual({
      email: "person@example.test",
      callbackURL: "/login?verified=true",
    });
  });
});
