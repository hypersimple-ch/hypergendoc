import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardApi } from "./dashboard-api";

afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });

describe("dashboard contract adapters", () => {
  it("recognizes the server-resolved owner role without accepting a workspace id", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        id: "workspace-1",
        name: "Studio",
        membership: { role: "owner", userId: "owner" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(dashboardApi.context()).resolves.toEqual({
      id: "workspace-1",
      name: "Studio",
      userId: "owner",
      role: "owner",
    });
  });
  it.each([
    ["logo", 400, "Choose a PNG, JPEG, or WebP image."],
    ["font", 400, "Choose a valid TTF, OTF, or WOFF2 font."],
    ["image", 413, "Choose a file smaller than 10 MiB."],
  ] as const)(
    "parses structured %s upload validation instead of reporting a network failure",
    async (kind, status, message) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "validation_failed",
              message,
              requestId: "request-upload-123",
            },
          }),
          { status, headers: { "content-type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetcher);
      const file = new File(["invalid"], "asset.bin", {
        type: "application/octet-stream",
      });

      const upload =
        kind === "logo"
          ? dashboardApi.uploadLogo("company", file)
          : kind === "font"
            ? dashboardApi.uploadFont("company", file)
            : dashboardApi.uploadImage("company", file);

      await expect(upload).rejects.toMatchObject({
        code: "validation_failed",
        message,
        requestId: "request-upload-123",
      });
      const init = fetcher.mock.calls[0]?.[1] as RequestInit;
      expect(init.body).toBeInstanceOf(FormData);
      expect(new Headers(init.headers).has("content-type")).toBe(false);
    },
  );
});
