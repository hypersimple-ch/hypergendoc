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

const api = vi.hoisted(() => ({
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  archiveCompany: vi.fn(),
  uploadLogo: vi.fn(),
}));
const activeCompany = vi.hoisted(() => vi.fn());

vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));
vi.mock("./active-company", () => ({ useActiveCompany: activeCompany }));

import { CompaniesDashboard } from "./companies-dashboard";

const company = {
  id: "company-1",
  name: "Acme",
  archivedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function workspace(overrides = {}) {
  return {
    companies: [company],
    loading: false,
    error: undefined,
    reload: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("CompaniesDashboard", () => {
  it("reloads the shared company collection after creating and renaming", async () => {
    const reload = vi.fn();
    activeCompany.mockReturnValue(workspace({ reload }));
    api.createCompany.mockResolvedValue(undefined);
    api.updateCompany.mockResolvedValue(undefined);
    render(<CompaniesDashboard />);

    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Globex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));
    await waitFor(() =>
      expect(api.createCompany).toHaveBeenCalledWith({ name: "Globex" }),
    );
    expect(reload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Rename Acme"), {
      target: { value: "Acme renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updateCompany).toHaveBeenCalledWith("company-1", {
        name: "Acme renamed",
      }),
    );
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads shared state when archiving the active company so selection reconciles", async () => {
    const reload = vi.fn();
    activeCompany.mockReturnValue(
      workspace({ reload, activeCompany: company }),
    );
    api.archiveCompany.mockResolvedValue(undefined);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<CompaniesDashboard />);

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(api.archiveCompany).toHaveBeenCalledWith("company-1"),
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it("prevents duplicate uploads and reloads shared state after an uploaded logo", async () => {
    const reload = vi.fn();
    activeCompany.mockReturnValue(workspace({ reload }));
    let finish!: () => void;
    api.uploadLogo.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<CompaniesDashboard />);

    const input = screen.getByLabelText("Upload logo");
    const file = new File(["logo"], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    expect(api.uploadLogo).toHaveBeenCalledOnce();
    expect(input).toBeDisabled();

    finish();
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(await screen.findByText("Logo uploaded.")).toBeVisible();
  });
});
