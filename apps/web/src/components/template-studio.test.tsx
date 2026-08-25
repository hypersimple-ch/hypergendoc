/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { activateTemplate, createTemplateVersion, previewTemplate, template } =
  vi.hoisted(() => ({
    activateTemplate: vi.fn(),
    createTemplateVersion: vi.fn(),
    previewTemplate: vi.fn(),
    template: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: {
    template,
    createTemplateVersion,
    activateTemplate,
    previewTemplate,
  },
}));

import { TemplateStudio, localeTagError } from "./template-studio";

const templateId = "11111111-1111-4111-8111-111111111111";
const styleVersionId = "22222222-2222-4222-8222-222222222222";
const baseDefinition = {
  schemaVersion: 1,
  styleVersionId,
  fields: {
    title: { type: "text", label: "Title", required: true },
  },
  pageMasters: { standard: {} },
  document: [],
};

function mockTemplate(definition: Record<string, unknown>) {
  template.mockResolvedValue({
    template: {
      id: templateId,
      companyId: "33333333-3333-4333-8333-333333333333",
      name: "Proposal",
      activeVersionId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    versions: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        templateId,
        version: 1,
        definition,
        createdByUserId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("localeTagError", () => {
  it("accepts empty and well-formed BCP-47 tags", () => {
    expect(localeTagError("")).toBeUndefined();
    expect(localeTagError("en")).toBeUndefined();
    expect(localeTagError("fr-FR")).toBeUndefined();
    expect(localeTagError("de-CH-1901")).toBeUndefined();
  });

  it("rejects malformed tags", () => {
    expect(localeTagError("not a locale")).toBeDefined();
    expect(localeTagError("en_US")).toBeDefined();
    expect(localeTagError("en--US")).toBeDefined();
  });
});

describe("TemplateStudio locale setting", () => {
  it("shows the stored locale of the latest version", async () => {
    mockTemplate({ ...baseDefinition, locale: "fr-FR" });

    render(<TemplateStudio templateId={templateId} />);

    expect(
      await screen.findByLabelText("Content locale"),
    ).toHaveValue("fr-FR");
  });

  it("shows an inline error for an invalid tag and blocks saving", async () => {
    mockTemplate({ ...baseDefinition });

    render(<TemplateStudio templateId={templateId} />);

    const input = await screen.findByLabelText("Content locale");
    fireEvent.change(input, { target: { value: "not a locale" } });

    expect(screen.getByText(/Use a BCP-47 tag/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Save inactive/ }));

    await waitFor(() =>
      expect(screen.getAllByText(/Use a BCP-47 tag/).length).toBeGreaterThan(
        0,
      ),
    );
    expect(createTemplateVersion).not.toHaveBeenCalled();
  });

  it("includes a valid locale in the saved version payload", async () => {
    mockTemplate({ ...baseDefinition });
    createTemplateVersion.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      templateId,
      version: 2,
      definition: { ...baseDefinition, locale: "de-CH" },
      createdByUserId: "user-1",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    render(<TemplateStudio templateId={templateId} />);

    const input = await screen.findByLabelText("Content locale");
    fireEvent.change(input, { target: { value: "de-CH" } });
    fireEvent.click(screen.getByRole("button", { name: /Save inactive/ }));

    await waitFor(() => expect(createTemplateVersion).toHaveBeenCalled());
    const definitionArg = createTemplateVersion.mock.calls[0]?.[1] as
      | { locale?: string }
      | undefined;
    expect(definitionArg?.locale).toBe("de-CH");
    expect(
      await screen.findByText("New inactive version saved."),
    ).toBeVisible();
  });
});

describe("TemplateStudio post-create state", () => {
  it("surfaces the inactive-version banner after creating from a starter", async () => {
    mockTemplate({ ...baseDefinition });
    sessionStorage.setItem(
      "hypergendoc:template-created-inactive:" + templateId,
      "1",
    );

    render(<TemplateStudio templateId={templateId} />);

    expect(await screen.findByRole("status")).toBeVisible();
    expect(screen.getByText(/Review this template, then activate it/)).toBeVisible();
    expect(
      sessionStorage.getItem(
        "hypergendoc:template-created-inactive:" + templateId,
      ),
    ).toBeNull();
  });
});
