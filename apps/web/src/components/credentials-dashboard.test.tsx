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
  credentials: vi.fn(),
  createCredential: vi.fn(),
  revokeCredential: vi.fn(),
}));
const activeCompany = vi.hoisted(() => vi.fn());
vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));
vi.mock("./active-company", () => ({ useActiveCompany: activeCompany }));

import { CredentialsDashboard } from "./credentials-dashboard";

const companies = [
  { id: "company-a", name: "Acme", archivedAt: null },
  { id: "company-b", name: "Globex", archivedAt: null },
];

function workspace(role: "owner" | "member") {
  return {
    context: { role, userId: "user-1" },
    companies,
    loading: false,
    error: undefined,
    reload: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("CredentialsDashboard", () => {
  it("keeps company authorization scopes explicit and independent of active selection", async () => {
    activeCompany.mockReturnValue({
      ...workspace("owner"),
      activeCompany: companies[0],
    });
    api.credentials.mockResolvedValue([]);
    api.createCredential.mockResolvedValue({ token: "secret" });
    render(<CredentialsDashboard />);

    expect(screen.getByLabelText("Acme")).not.toBeChecked();
    expect(screen.getByLabelText("Globex")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Acme"));
    fireEvent.click(screen.getByLabelText("Globex"));
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create credential" }));

    await waitFor(() =>
      expect(api.createCredential).toHaveBeenCalledWith({
        name: "Agent",
        companyIds: ["company-a", "company-b"],
        actions: ["documents:read"],
      }),
    );
  });

  it("keeps credentials owner-only", async () => {
    activeCompany.mockReturnValue(workspace("member"));
    api.credentials.mockResolvedValue([]);
    render(<CredentialsDashboard />);

    expect(await screen.findByText("Owner access required.")).toBeVisible();
    expect(screen.queryByLabelText("Credential name")).not.toBeInTheDocument();
  });
});
