import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TemplateDefinition } from "@hypergendoc/contracts";
import { registerSafeErrorHandler } from "../../platform/errors.js";
import type { HumanActor } from "../auth/actors.js";
import { createTemplateRoutes } from "./routes.js";

const actor: HumanActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "member",
  requestId: "request-1",
};
const styleVersionId = "44444444-4444-4444-8444-444444444444";
const definition: TemplateDefinition = {
  schemaVersion: 1,
  styleVersionId,
  fields: { title: { type: "text", label: "Title", required: true } },
  pageMasters: { standard: {} },
  document: [
    {
      type: "page",
      master: "standard",
      children: [
        {
          type: "heading",
          content: [{ type: "binding", path: "title" }],
        },
      ],
    },
  ],
};
const list = vi.fn();
const create = vi.fn();
const get = vi.fn();
const history = vi.fn();
const createVersion = vi.fn();
const activate = vi.fn();
const preview = vi.fn();

function appFor() {
  const app = Fastify();
  registerSafeErrorHandler(app);
  void app.register(
    createTemplateRoutes({
      actorFor: () => actor,
      service: {
        list,
        create,
        get,
        history,
        createVersion,
        activate,
        preview,
      },
    }),
  );
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("template routes", () => {
  it("validates and creates a safe immutable template definition", async () => {
    create.mockResolvedValue({
      template: { id: "template" },
      version: { id: "version" },
    });
    const app = appFor();
    const response = await app.inject({
      method: "POST",
      url: "/api/companies/55555555-5555-4555-8555-555555555555/templates",
      payload: { name: "Reusable", definition },
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(actor, {
      companyId: "55555555-5555-4555-8555-555555555555",
      name: "Reusable",
      definition,
    });
    await app.close();
  });

  it("rejects CSS-shaped masters and invalid node semantics before service access", async () => {
    const app = appFor();
    const response = await app.inject({
      method: "POST",
      url: "/api/companies/55555555-5555-4555-8555-555555555555/templates",
      payload: {
        name: "Unsafe",
        definition: {
          ...definition,
          pageMasters: { "standard}body{display:none": {} },
          document: [{ type: "repeat", children: [] }],
        },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
    await app.close();
  });

  it("delegates version activation and validated previews", async () => {
    activate.mockResolvedValue(undefined);
    preview.mockResolvedValue({ url: "data:application/pdf;base64,AA==" });
    const app = appFor();
    const activated = await app.inject({
      method: "POST",
      url: "/api/templates/55555555-5555-4555-8555-555555555555/activate",
      payload: { versionId: "66666666-6666-4666-8666-666666666666" },
    });
    expect(activated.statusCode).toBe(204);
    expect(activate).toHaveBeenCalledWith(
      actor,
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    );
    const rendered = await app.inject({
      method: "POST",
      url: "/api/templates/55555555-5555-4555-8555-555555555555/preview",
      payload: { definition, data: { title: "Preview" } },
    });
    expect(rendered.statusCode).toBe(200);
    expect(preview).toHaveBeenCalledWith(
      actor,
      "55555555-5555-4555-8555-555555555555",
      { definition, data: { title: "Preview" } },
    );
    await app.close();
  });
});
