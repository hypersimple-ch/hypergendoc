import { describe, expect, it, vi } from "vitest";
import { authRateLimitRules, createAuthMailCallbacks } from "./better-auth.js";

describe("Better Auth mail acceptance", () => {
  it("applies the stricter rule to the password-reset request endpoint", () => {
    expect(authRateLimitRules["/request-password-reset"]).toEqual({
      window: 60,
      max: 5,
    });
  });

  it.each(["signup", "verification", "reset"] as const)(
    "awaits durable %s enqueue failures",
    async (kind) => {
      const failure = new Error("database unavailable");
      const mail = {
        sendVerificationEmail: vi.fn().mockRejectedValue(failure),
        sendPasswordResetEmail: vi.fn().mockRejectedValue(failure),
      };
      const callbacks = createAuthMailCallbacks(mail);
      const operation =
        kind !== "reset"
          ? callbacks.sendVerificationEmail({
              user: { email: "a@example.test", name: "A" },
              url: "https://example.test/verify",
            })
          : callbacks.sendResetPassword({
              user: { email: "a@example.test", name: "A" },
              url: "https://example.test/reset",
            });
      await expect(operation).rejects.toBe(failure);
    },
  );
});
