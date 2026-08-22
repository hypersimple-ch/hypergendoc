import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "../security-headers";

describe("web security headers", () => {
  it("prevents framing and restricts page resources in production", () => {
    const headers = Object.fromEntries(
      securityHeaders("production").map(({ key, value }) => [key, value]),
    );

    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
    expect(headers["Content-Security-Policy"]).not.toContain(
      "fonts.googleapis.com",
    );
    expect(headers["Content-Security-Policy"]).not.toContain(
      "fonts.gstatic.com",
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toContain("includeSubDomains");
  });

  it("does not bulk-load third-party font stylesheets", () => {
    const styles = readFileSync(
      new URL("./app/styles.css", import.meta.url),
      "utf8",
    );
    expect(styles).not.toContain("fonts.googleapis.com");
    expect(styles).not.toContain("@import url(");
  });

  it("allows only the development evaluator needed by Next hot reload", () => {
    expect(contentSecurityPolicy("development")).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("test")).not.toContain("'unsafe-eval'");
    expect(securityHeaders("development")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Strict-Transport-Security" }),
      ]),
    );
  });
});
