import multipart from "@fastify/multipart";
import { ErrorEnvelopeSchema } from "@hypergendoc/contracts";
import { DocumentInputError } from "@hypergendoc/document";
import Fastify, { type FastifyInstance } from "fastify";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AuthorizationError } from "../modules/memberships/service.js";
import { AppError } from "../platform/errors.js";
import { registerApplicationErrorHandler } from "./error-handler.js";

const requestId = "boundary-request-123";
const secret = "private-database-password-and-internal-path";
const apps: FastifyInstance[] = [];

function createBoundary() {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const app = Fastify({
    genReqId: () => requestId,
    bodyLimit: 256,
    disableRequestLogging: true,
    logger: { level: "error", base: null, timestamp: false, stream },
  });
  apps.push(app);
  registerApplicationErrorHandler(app);
  return {
    app,
    errorLogs: () =>
      logs.join("").split("\n").filter(Boolean).map((line): unknown => JSON.parse(line)),
  };
}

function expectSafeResponse(
  response: { statusCode: number; body: string; json(): unknown },
  status: number,
  code: string,
) {
  expect(response.statusCode).toBe(status);
  const payload = response.json();
  const envelope = ErrorEnvelopeSchema.parse(payload);
  expect(payload).toEqual({
    error: {
      code,
      message: envelope.error.message,
      requestId,
    },
  });
  expect(response.body).not.toContain(secret);
  expect(response.body).not.toContain("stack");
}

async function listen(app: FastifyInstance) {
  return app.listen({ host: "127.0.0.1", port: 0 });
}

async function readResponse(response: Response) {
  const body = await response.text();
  return {
    statusCode: response.status,
    body,
    json: (): unknown => JSON.parse(body),
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("application error boundary", () => {
  it.each([
    ["forbidden", 403],
    ["conflict", 409],
    ["not_found", 404],
  ] as const)("maps domain authorization %s to %i without logging it", async (code, status) => {
    const { app, errorLogs } = createBoundary();
    app.get("/domain", () => {
      const error = new AuthorizationError(code);
      error.message = secret;
      throw error;
    });

    expectSafeResponse(await app.inject("/domain"), status, code);
    expect(errorLogs()).toEqual([]);
  });

  it("hides document validation details behind a 400 envelope", async () => {
    const { app, errorLogs } = createBoundary();
    app.post("/document", () => {
      throw new DocumentInputError("invalid_body");
    });

    expectSafeResponse(
      await app.inject({ method: "POST", url: "/document" }),
      400,
      "validation_failed",
    );
    expect(errorLogs()).toEqual([]);
  });

  it("does not expose Zod input or custom validation messages", async () => {
    const { app, errorLogs } = createBoundary();
    app.post("/validate", (request) =>
      z.object({ value: z.string().min(100, secret) }).parse(request.body),
    );

    expectSafeResponse(
      await app.inject({ method: "POST", url: "/validate", payload: { value: secret } }),
      400,
      "validation_failed",
    );
    expect(errorLogs()).toEqual([]);
  });

  it("normalizes a malformed multipart JSON field over HTTP", async () => {
    const { app, errorLogs } = createBoundary();
    await app.register(multipart);
    app.post("/upload", async (request) => {
      for await (const part of request.parts()) {
        if (part.type === "file") await part.toBuffer();
      }
      return { uploaded: true };
    });
    const origin = await listen(app);
    const response = await fetch(`${origin}/upload`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=boundary" },
      body: `--boundary\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n{"${secret}"\r\n--boundary--\r\n`,
    });

    expectSafeResponse(await readResponse(response), 400, "validation_failed");
    expect(errorLogs()).toEqual([]);
  });

  it("normalizes a body exceeding the HTTP admission limit", async () => {
    const { app, errorLogs } = createBoundary();
    app.post("/body", (request) => request.body);
    const origin = await listen(app);
    const response = await fetch(`${origin}/body`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: secret.repeat(20) }),
    });

    expectSafeResponse(await readResponse(response), 413, "validation_failed");
    expect(errorLogs()).toEqual([]);
  });

  it("never exposes malformed JSON payloads or parser internals", async () => {
    const { app } = createBoundary();
    app.post("/json", (request) => request.body);
    const response = await app.inject({
      method: "POST",
      url: "/json",
      headers: { "content-type": "application/json" },
      payload: `{"${secret}":`,
    });

    // Safety remains required whether this transport error is normalized as
    // validation or falls through the existing unknown-error boundary.
    expect([400, 500]).toContain(response.statusCode);
    expectSafeResponse(
      response,
      response.statusCode,
      response.statusCode === 400 ? "validation_failed" : "internal_error",
    );
    expect(response.body).not.toContain("JSON");
    expect(response.body).not.toContain("SyntaxError");
  });

  it("returns a safe 500 and logs only request identity and error code", async () => {
    const { app, errorLogs } = createBoundary();
    app.get("/unknown", () => {
      const error = new Error(secret);
      error.stack = `Error: ${secret}\n at internal/storage.ts:99:1`;
      throw error;
    });

    const response = await app.inject("/unknown");
    expectSafeResponse(response, 500, "internal_error");
    expect(response.body).not.toContain("internal/storage");
    expect(errorLogs()).toEqual([
      { level: 50, reqId: requestId, requestId, code: "internal_error", msg: "Request failed" },
    ]);
  });

  it("logs safe dependency failures without including internal exception state", async () => {
    const { app, errorLogs } = createBoundary();
    app.get("/dependency", () => {
      const error = new AppError("dependency_unavailable", 503);
      error.cause = new Error(secret);
      throw error;
    });

    expectSafeResponse(await app.inject("/dependency"), 503, "dependency_unavailable");
    expect(errorLogs()).toEqual([
      { level: 50, reqId: requestId, requestId, code: "dependency_unavailable", msg: "Request failed" },
    ]);
  });
});
