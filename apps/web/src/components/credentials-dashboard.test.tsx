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
  updateCredential: vi.fn(),
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

  it("shows a token once and requires acknowledgement before dismissing it", async () => {
    activeCompany.mockReturnValue(workspace("owner"));
    api.credentials.mockResolvedValue([]);
    api.createCredential.mockResolvedValue({ token: "one-time-secret" });
    render(<CredentialsDashboard />);

    fireEvent.click(await screen.findByLabelText("Acme"));
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create credential" }));

    expect(await screen.findByText("one-time-secret")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Copy this secret now" }),
    ).toHaveAccessibleDescription(
      "This is the only time the full token will be shown. Save it in a secret manager before continuing.",
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(
        "I have saved this one-time token in a secret manager.",
      ),
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("one-time-secret")).not.toBeInTheDocument();
  });

  it("copies the one-time token and confirms safe storage", async () => {
    activeCompany.mockReturnValue(workspace("owner"));
    api.credentials.mockResolvedValue([]);
    api.createCredential.mockResolvedValue({ token: "one-time-secret" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CredentialsDashboard />);

    fireEvent.click(await screen.findByLabelText("Acme"));
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create credential" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy token" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("one-time-secret"),
    );
    expect(
      screen.getByText(
        "Token copied. Store it in your agent's secret manager.",
      ),
    ).toBeVisible();
  });

  it("confirms credential revocation before submitting", async () => {
    activeCompany.mockReturnValue(workspace("owner"));
    api.credentials.mockResolvedValue([
      {
        id: "credential-1",
        name: "Agent",
        prefix: "mcp_abc",
        companyIds: ["company-a"],
        actions: ["documents:read"],
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
    api.revokeCredential.mockResolvedValue(undefined);
    render(<CredentialsDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(api.revokeCredential).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Revoke credential" }));
    await waitFor(() =>
      expect(api.revokeCredential).toHaveBeenCalledWith("credential-1"),
    );
  });

  it("keeps credentials owner-only", async () => {
    activeCompany.mockReturnValue(workspace("member"));
    api.credentials.mockResolvedValue([]);
    render(<CredentialsDashboard />);

    expect(await screen.findByText("Owner access required.")).toBeVisible();
    expect(screen.queryByLabelText("Credential name")).not.toBeInTheDocument();
    expect(api.credentials).not.toHaveBeenCalled();
  });
  it("creates expiring credentials and marks expired credentials as expired, not active", async () => {
    activeCompany.mockReturnValue(workspace("owner"));
    api.credentials.mockResolvedValue([
      {
        id: "expired-credential",
        name: "Old agent",
        prefix: "hgd_old",
        companyIds: ["company-a"],
        actions: ["documents:read"],
        expiresAt: "2020-01-01T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
    api.createCredential.mockResolvedValue({ token: "secret" });
    render(<CredentialsDashboard />);

    expect(await screen.findByText("Expired")).toBeVisible();
    expect(screen.getByText("Expired").closest("td")).not.toHaveTextContent(
      "Active",
    );

    fireEvent.click(screen.getByLabelText("Acme"));
    fireEvent.change(screen.getByLabelText("Credential name"), {
      target: { value: "Timed agent" },
    });
    fireEvent.change(screen.getByLabelText("Expires (optional)"), {
      target: { value: "2030-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create credential" }));

    await waitFor(() =>
      expect(api.createCredential).toHaveBeenCalledWith({
        name: "Timed agent",
        companyIds: ["company-a"],
        actions: ["documents:read"],
        expiresAt: new Date("2030-01-02T03:04").toISOString(),
      }),
    );
  });

  it("edits an existing credential's scopes, actions, and expiry", async () => {
    activeCompany.mockReturnValue(workspace("owner"));
    api.credentials.mockResolvedValue([
      {
        id: "credential-1",
        name: "Agent",
        prefix: "hgd_agent",
        companyIds: ["company-a"],
        actions: ["documents:read"],
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
    api.updateCredential.mockResolvedValue({});
    render(<CredentialsDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const globex = screen.getAllByLabelText("Globex").at(-1)!;
    fireEvent.click(globex);
    fireEvent.change(screen.getByLabelText("Expires"), {
      target: { value: "2030-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateCredential).toHaveBeenCalledWith("credential-1", {
        companyIds: ["company-a", "company-b"],
        actions: ["documents:read"],
        expiresAt: new Date("2030-01-02T03:04").toISOString(),
      }),
    );
  });
});
