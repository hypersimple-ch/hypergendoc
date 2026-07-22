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

  it("confirms archiving and reloads shared state so active selection reconciles", async () => {
    const reload = vi.fn();
    activeCompany.mockReturnValue(
      workspace({ reload, activeCompany: company }),
    );
    api.archiveCompany.mockResolvedValue(undefined);
    render(<CompaniesDashboard />);

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Existing documents remain available.",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Archive company" }));

    await waitFor(() =>
      expect(api.archiveCompany).toHaveBeenCalledWith("company-1"),
    );
    expect(reload).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus(),
    );
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
    const announcement = await screen.findByText("Logo uploaded.");
    expect(announcement).toBeVisible();
    expect(announcement.parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("prevents duplicate create requests while creation is pending", async () => {
    activeCompany.mockReturnValue(workspace());
    let finish!: () => void;
    api.createCompany.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<CompaniesDashboard />);

    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Globex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));
    fireEvent.click(screen.getByRole("button", { name: "Creating…" }));
    expect(api.createCompany).toHaveBeenCalledOnce();

    finish();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add company" })).toBeEnabled(),
    );
  });
});
