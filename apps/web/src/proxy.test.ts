import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
describe("workspace proxy", () => {
  it("redirects a visitor without a session", () => {
    const response = proxy(
      new NextRequest("https://example.test/workspace/documents"),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.test/login?next=%2Fworkspace%2Fdocuments",
    );
  });
  it("allows a Better Auth session cookie through", () => {
    const response = proxy(
      new NextRequest("https://example.test/workspace", {
        headers: { cookie: "better-auth.session_token=opaque" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
