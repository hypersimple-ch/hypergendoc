import { describe, expect, it } from "vitest";
import { authRateLimitRules } from "./better-auth.js";

describe("Better Auth rate limits", () => {
  it("applies the stricter rule to the password-reset request endpoint", () => {
    expect(authRateLimitRules["/request-password-reset"]).toEqual({
      window: 60,
      max: 5,
    });
    expect(authRateLimitRules).not.toHaveProperty("/forget-password");
  });
});
