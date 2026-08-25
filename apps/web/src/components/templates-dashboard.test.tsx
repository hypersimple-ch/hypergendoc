/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  activeCompany,
  styles,
  templates,
  createTemplate,
  starterTemplates,
  createTemplateFromStarter,
  duplicateTemplate,
  push,
} = vi.hoisted(() => ({
  activeCompany: vi.fn(),
  styles: vi.fn(),
  templates: vi.fn(),
  createTemplate: vi.fn(),
  starterTemplates: vi.fn(),
  createTemplateFromStarter: vi.fn(),
  duplicateTemplate: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: {
    styles,
    templates,
    createTemplate,
    starterTemplates,
    createTemplateFromStarter,
    duplicateTemplate,
  },
}));
vi.mock("./active-company", () => ({ useActiveCompany: activeCompany }));

import { TemplatesDashboard } from "./templates-dashboard";

const company = {
  id: "company-1",
  workspaceId: "workspace-1",
  name: "Acme Studio",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function useCompany() {
  activeCompany.mockReturnValue({
    activeCompany: company,
    companies: [company],
    loading: false,
    error: undefined,
    noActiveCompany: false,
    reload: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const style = {
  id: "style-1",
  companyId: company.id,
  name: "Primary",
  activeVersionId: "version-1",
  archivedAt: null,
  createdAt: company.createdAt,
  updatedAt: company.updatedAt,
};
const starterCatalog = [
  {
    id: "one-page-proposal",
    name: "One-page proposal",
    description: "A single-page client proposal.",
    fieldCount: 7,
    fieldKinds: ["date", "list", "money", "object", "richText", "text"],
    definition: {},
    sampleData: {},
  },
];

function mockLoadedDashboard() {
  templates.mockResolvedValue([]);
  styles.mockResolvedValue([style]);
  starterTemplates.mockResolvedValue(starterCatalog);
}

describe("TemplatesDashboard", () => {
  it("explains the style prerequisite instead of pointing to a hidden form", async () => {
    useCompany();
    templates.mockResolvedValue([]);
    styles.mockResolvedValue([]);
    starterTemplates.mockResolvedValue([]);

    render(<TemplatesDashboard />);

    expect(
      await screen.findByText("An active style is required"),
    ).toBeVisible();
    expect(
      screen.getByText(/Create and activate a style before creating/),
    ).toBeVisible();
    expect(
      screen.queryByText(/Create a template above/),
    ).not.toBeInTheDocument();
  });

  it("shows the creation instruction when an active style exists", async () => {
    useCompany();
    mockLoadedDashboard();

    render(<TemplatesDashboard />);

    expect(await screen.findByLabelText("Template name")).toBeVisible();
    expect(screen.getByText(/Create a template above/)).toBeVisible();
  });

  it("renders one recoverable error boundary for the shared load", async () => {
    useCompany();
    templates.mockRejectedValue(new Error("offline"));
    styles.mockResolvedValue([]);
    starterTemplates.mockResolvedValue([]);

    render(<TemplatesDashboard />);

    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(
      1,
    );
  });

  it("lists starters and creates an inactive template from one", async () => {
    useCompany();
    mockLoadedDashboard();
    const created = { id: "template-9", name: "One-page proposal" };
    createTemplateFromStarter.mockResolvedValue(created);

    render(<TemplatesDashboard />);

    expect(await screen.findByText("Start from a template starter")).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Use starter" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByLabelText("Company"),
    ).toHaveValue(company.id);
    fireEvent.change(within(dialog).getByLabelText("Active style"), {
      target: { value: "version-1" },
    });
    expect(within(dialog).getByLabelText("Template name")).toHaveValue(
      "One-page proposal",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create template" }),
    );

    await waitFor(() =>
      expect(createTemplateFromStarter).toHaveBeenCalledWith({
        companyId: company.id,
        starterId: "one-page-proposal",
        name: "One-page proposal",
        styleVersionId: "version-1",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workspace/templates/template-9"));
    expect(sessionStorage.getItem("hypergendoc:template-created-inactive:template-9")).toBe("1");
    sessionStorage.clear();
  });

  it("duplicates a template and confirms the inactive copy", async () => {
    useCompany();
    mockLoadedDashboard();
    templates.mockResolvedValue([
      {
        id: "template-1",
        companyId: company.id,
        name: "Proposal",
        activeVersionId: null,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    ]);
    duplicateTemplate.mockResolvedValue({
      id: "template-2",
      name: "Proposal (copy)",
    });

    render(<TemplatesDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "Duplicate" }));

    expect(await screen.findByText("Template duplicated as inactive copy")).toBeVisible();
    expect(duplicateTemplate).toHaveBeenCalledWith("template-1");
    await waitFor(() => expect(templates.mock.calls.length).toBeGreaterThan(1));
  });
});
