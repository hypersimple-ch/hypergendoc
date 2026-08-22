/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { activeCompany, styles, templates, createTemplate, push } = vi.hoisted(
  () => ({
    activeCompany: vi.fn(),
    styles: vi.fn(),
    templates: vi.fn(),
    createTemplate: vi.fn(),
    push: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: { styles, templates, createTemplate },
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

describe("TemplatesDashboard", () => {
  it("explains the style prerequisite instead of pointing to a hidden form", async () => {
    useCompany();
    templates.mockResolvedValue([]);
    styles.mockResolvedValue([]);

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
    templates.mockResolvedValue([]);
    styles.mockResolvedValue([
      {
        id: "style-1",
        companyId: company.id,
        name: "Primary",
        activeVersionId: "version-1",
        archivedAt: null,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    ]);

    render(<TemplatesDashboard />);

    expect(await screen.findByLabelText("Template name")).toBeVisible();
    expect(screen.getByText(/Create a template above/)).toBeVisible();
  });

  it("renders one recoverable error boundary for the shared load", async () => {
    useCompany();
    templates.mockRejectedValue(new Error("offline"));
    styles.mockResolvedValue([]);

    render(<TemplatesDashboard />);

    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(
      1,
    );
  });
});
