import { describe, expect, it } from "vitest";
import { normalizePasswordResetResponse } from "./reset-response.js";

describe("password reset anti-enumeration", () => {
  it("turns an enqueue failure into the same generic success shape", async () => {
    const normalized = normalizePasswordResetResponse(
      "/api/auth/request-password-reset",
      Response.json({ message: "internal" }, { status: 500 }),
    );
    expect(normalized.suppressedFailure).toBe(true);
    expect(normalized.response.status).toBe(200);
    expect(await normalized.response.json()).toEqual({
      status: true,
      message:
        "If this email exists in our system, check your inbox shortly; delivery may be delayed",
    });
  });

  it("uses the same response after durable acceptance", async () => {
    const normalized = normalizePasswordResetResponse(
      "/api/auth/request-password-reset",
      Response.json({ status: true, message: "provider-specific" }),
    );
    expect(normalized.suppressedFailure).toBe(false);
    expect(await normalized.response.json()).toEqual({
      status: true,
      message:
        "If this email exists in our system, check your inbox shortly; delivery may be delayed",
    });
  });

  it("does not hide signup or client errors", () => {
    expect(
      normalizePasswordResetResponse(
        "/api/auth/sign-up/email",
        new Response(null, { status: 500 }),
      ).response.status,
    ).toBe(500);
    expect(
      normalizePasswordResetResponse(
        "/api/auth/request-password-reset",
        new Response(null, { status: 400 }),
      ).response.status,
    ).toBe(400);
  });
});
