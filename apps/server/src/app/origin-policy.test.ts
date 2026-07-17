import { describe, expect, it } from "vitest";
import { shouldRejectMutationOrigin } from "./origin-policy.js";

const appOrigin = "https://docs.example.test";
const request = (
  overrides: Partial<Parameters<typeof shouldRejectMutationOrigin>[0]> = {},
) =>
  shouldRejectMutationOrigin({
    url: "/api/companies",
    method: "POST",
    origin: appOrigin,
    appOrigin,
    ...overrides,
  });

describe("browser mutation origin policy", () => {
  it("accepts same-origin API mutations", () => {
    expect(request()).toBe(false);
  });

  it("rejects mismatched and missing origins", () => {
    expect(request({ origin: "https://attacker.example" })).toBe(true);
    expect(request({ origin: undefined })).toBe(true);
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "does not apply to safe %s requests",
    (method) => {
      expect(request({ method, origin: undefined })).toBe(false);
    },
  );

  it("does not intercept Better Auth or non-API requests", () => {
    expect(request({ url: "/api/auth/sign-in", origin: undefined })).toBe(
      false,
    );
    expect(request({ url: "/health/live", origin: undefined })).toBe(false);
  });
});
