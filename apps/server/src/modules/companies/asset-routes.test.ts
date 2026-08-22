import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerSafeErrorHandler,
  uploadValidationError,
} from "../../platform/errors.js";
import type { HumanActor } from "../auth/actors.js";
import { createCompanyAssetRoutes } from "./asset-routes.js";
import { createCompanyLogoRoutes } from "./logo-routes.js";

const actor: HumanActor = {
  userId: "user",
  workspaceId: "workspace",
  membershipId: "membership",
  role: "member",
  requestId: "request-123",
};
const uploadFont = vi.fn();
const uploadImage = vi.fn();
const uploadLogo = vi.fn();

function multipartBody(field: string, bytes: string): Buffer {
  return Buffer.from(
    `--upload-boundary\r\nContent-Disposition: form-data; name="${field}"; filename="asset.bin"\r\nContent-Type: application/octet-stream\r\n\r\n${bytes}\r\n--upload-boundary--\r\n`,
  );
}

async function appFor(fileSize = 1024) {
  const app = Fastify({ genReqId: () => "request-123" });
  await app.register(multipart, { limits: { fileSize, files: 1 } });
  registerSafeErrorHandler(app);
  await app.register(
    createCompanyAssetRoutes({
      authenticate: () => Promise.resolve(actor),
      service: {
        list: vi.fn(),
        uploadFont,
        uploadImage,
        content: vi.fn(),
      } as never,
    }),
  );
  await app.register(
    createCompanyLogoRoutes({
      authenticate: () => Promise.resolve(actor),
      service: { upload: uploadLogo },
    }),
  );
  return app;
}

function expectEnvelope(
  response: {
    statusCode: number;
    json(): unknown;
  },
  statusCode: number,
  message: string,
) {
  expect(response.statusCode).toBe(statusCode);
  expect(response.json()).toEqual({
    error: {
      code: "validation_failed",
      message,
      requestId: "request-123",
    },
  });
}

afterEach(() => vi.clearAllMocks());

describe("company multipart upload routes", () => {
  it("returns an ErrorEnvelope when a font upload has no file", async () => {
    const app = await appFor();
    const response = await app.inject({
      method: "POST",
      url: "/api/companies/company/assets/fonts",
      headers: { "content-type": "multipart/form-data; boundary=empty" },
      payload: Buffer.from("--empty--\r\n"),
    });

    expectEnvelope(response, 400, "Choose one file to upload.");
    expect(uploadFont).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns an actionable ErrorEnvelope for an unsupported logo", async () => {
    uploadLogo.mockRejectedValueOnce(
      uploadValidationError("Choose a PNG, JPEG, or WebP image."),
    );
    const app = await appFor();
    const response = await app.inject({
      method: "POST",
      url: "/api/companies/company/logo",
      headers: {
        "content-type": "multipart/form-data; boundary=upload-boundary",
      },
      payload: multipartBody("logo", "not-an-image"),
    });

    expectEnvelope(response, 400, "Choose a PNG, JPEG, or WebP image.");
    await app.close();
  });

  it("normalizes multipart file-size failures as a 413 ErrorEnvelope", async () => {
    const app = await appFor(4);
    const response = await app.inject({
      method: "POST",
      url: "/api/companies/company/assets/images",
      headers: {
        "content-type": "multipart/form-data; boundary=upload-boundary",
      },
      payload: multipartBody("image", "too-large"),
    });

    expectEnvelope(response, 413, "Choose a file smaller than 10 MiB.");
    expect(uploadImage).not.toHaveBeenCalled();
    await app.close();
  });
});
