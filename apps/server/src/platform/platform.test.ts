import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  createHealthChecker,
  createInMemoryRateLimiter,
  createPrivateObjectStore,
  createStructuredLogger,
  loadServerEnvironment,
  redact,
  uploadLogo,
} from "./index.js";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

describe("platform", () => {
  it("uses random private keys and records a content hash without public ACLs", async () => {
    const put = vi.fn();
    const store = createPrivateObjectStore(
      {
        put,
        delete: vi.fn(),
        get: vi.fn().mockResolvedValue({
          bytes: png,
          contentType: "image/png",
        }),
      },
      "bucket",
      () => Buffer.alloc(24, 7),
    );
    const saved = await store.putPrivate({
      bytes: png,
      contentType: "image/png",
      metadata: { Filename: "ignored\r\nvalue", unsafe_key: "x" },
    });
    expect(saved.key).toBe(`private/${Buffer.alloc(24, 7).toString("hex")}`);
    expect(saved.sha256).toBe(createHash("sha256").update(png).digest("hex"));
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { filename: "ignoredvalue", sha256: saved.sha256 },
      }),
    );
    await expect(
      store.authorizedGet({
        key: saved.key,
        authorize: () => Promise.resolve(false),
      }),
    ).rejects.toThrow("denied");
  });

  it("uses magic bytes and removes an uploaded private object if ownership creation fails", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = {
      putPrivate: vi.fn().mockResolvedValue({
        key: "private/key",
        sha256: "hash",
        bytes: png.byteLength,
        contentType: "image/png",
      }),
      delete: remove,
      authorizedGet: vi.fn(),
    };
    await expect(
      uploadLogo(
        { workspaceId: "workspace", companyId: "company", bytes: png },
        store,
        { create: vi.fn().mockRejectedValue(new Error("db failed")) },
      ),
    ).rejects.toThrow("db failed");
    expect(remove).toHaveBeenCalledWith("private/key");
    await expect(
      uploadLogo(
        {
          workspaceId: "workspace",
          companyId: "company",
          bytes: new Uint8Array([0, 1]),
        },
        store,
        { create: vi.fn() },
      ),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      uploadLogo(
        {
          workspaceId: "workspace",
          companyId: "company",
          bytes: Buffer.concat([png, Buffer.from("<script>polyglot</script>")]),
        },
        store,
        { create: vi.fn() },
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("redacts sensitive fields in child request and actor logs", () => {
    const records: Record<string, unknown>[] = [];
    const logger = createStructuredLogger({
      write: (record) => records.push({ ...record }),
    }).child({
      requestId: "request-123",
      workspaceId: "workspace",
      actor: {
        type: "agent",
        credentialId: "credential",
        workspaceId: "workspace",
        allowedCompanyIds: [],
        actions: [],
        requestId: "request-123",
      },
    });
    logger.info("request.complete", {
      token: "secret",
      nested: { documentBody: "body" },
      title: "title",
    });
    expect(records[0]).toMatchObject({
      requestId: "request-123",
      credentialId: "credential",
      token: "[REDACTED]",
      nested: { documentBody: "[REDACTED]" },
      title: "[REDACTED]",
    });
    expect(redact({ signedUrl: "x" })).toEqual({ signedUrl: "[REDACTED]" });
  });

  it("allows only the private Compose object store to use production HTTP", () => {
    const values = {
      NODE_ENV: "production",
      APP_ORIGIN: "https://docs.example.test",
      BETTER_AUTH_SECRET: "auth-secret",
      CREDENTIAL_PEPPER: "credential-pepper",
      DATABASE_URL: "postgresql://database",
      S3_REGION: "us-east-1",
      S3_BUCKET: "private",
      S3_ACCESS_KEY: "access",
      S3_SECRET_KEY: "secret",
      SMTP_URL: "smtps://mail.example.test:465",
      MAIL_FROM: "noreply@example.test",
    };
    expect(
      loadServerEnvironment({
        ...values,
        S3_ENDPOINT: "http://object-store:9000",
      }).s3.endpoint,
    ).toBe("http://object-store:9000");
    expect(() =>
      loadServerEnvironment({
        ...values,
        S3_ENDPOINT: "http://storage.example.test",
      }),
    ).toThrow("must use HTTPS");
  });

  it("reports failed dependencies and enforces windows", async () => {
    const health = createHealthChecker([
      { name: "database", check: () => Promise.resolve() },
      {
        name: "storage",
        check: () => Promise.reject(new Error("unavailable")),
      },
    ]);
    await expect(health.check()).resolves.toEqual({
      status: "degraded",
      checks: { database: "ok", storage: "failed" },
    });
    const limiter = createInMemoryRateLimiter(() => 100);
    expect(
      (await limiter.consume({ key: "ip", limit: 1, windowMs: 50 })).allowed,
    ).toBe(true);
    expect(
      (await limiter.consume({ key: "ip", limit: 1, windowMs: 50 })).allowed,
    ).toBe(false);
  });
});
