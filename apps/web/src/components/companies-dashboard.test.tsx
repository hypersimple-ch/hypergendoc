/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { companies, createCompany, updateCompany, archiveCompany, uploadLogo } =
  vi.hoisted(() => ({
    companies: vi.fn(),
    createCompany: vi.fn(),
    updateCompany: vi.fn(),
    archiveCompany: vi.fn(),
    uploadLogo: vi.fn(),
  }));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: {
    companies,
    createCompany,
    updateCompany,
    archiveCompany,
    uploadLogo,
  },
}));

import { CompaniesDashboard } from "./companies-dashboard";

const company = {
  id: "company-1",
  name: "Acme",
  archivedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => vi.resetAllMocks());

describe("CompaniesDashboard", () => {
  it("prevents duplicate uploads and reloads the company after an uploaded logo", async () => {
    let finish!: () => void;
    uploadLogo.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    companies.mockResolvedValue([company]);
    render(<CompaniesDashboard />);
    await screen.findByText("Acme");

    const input = screen.getByLabelText("Upload logo");
    const file = new File(["logo"], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    expect(uploadLogo).toHaveBeenCalledOnce();
    expect(input).toBeDisabled();

    finish();
    await waitFor(() => expect(companies).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Logo uploaded.")).toBeVisible();
  });
});
