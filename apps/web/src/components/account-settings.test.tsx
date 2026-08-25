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

const authClient = vi.hoisted(() => ({
  sessionOverview: vi.fn(),
  changePassword: vi.fn(),
  updateName: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));
vi.mock("../lib/auth-client", () => ({ authClient }));

import { AccountSettings } from "./account-settings";

const overview = {
  user: { name: "Pilot", email: "pilot@example.test" },
  sessions: [
    {
      id: "session-current",
      createdAt: "2026-08-25T10:00:00.000Z",
      expiresAt: "2026-09-01T10:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0 Chrome",
      current: true,
    },
    {
      id: "session-other",
      createdAt: "2026-08-20T09:00:00.000Z",
      expiresAt: "2026-08-27T09:00:00.000Z",
      ipAddress: "10.0.0.8",
      userAgent: "Mozilla/5.0 Firefox",
      current: false,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountSettings", () => {
  it("updates the display name", async () => {
    authClient.sessionOverview.mockResolvedValue(overview);
    authClient.updateName.mockResolvedValue({});

    render(<AccountSettings />);

    await screen.findByLabelText("Display name");
    const name = await screen.findByDisplayValue("Pilot");
    fireEvent.change(name, { target: { value: "Pilot Two" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(authClient.updateName).toHaveBeenCalledWith("Pilot Two"),
    );
    expect(await screen.findByText("Profile updated.")).toBeVisible();
  });

  it("changes the password and rejects mismatched confirmation", async () => {
    authClient.sessionOverview.mockResolvedValue(overview);
    authClient.changePassword.mockResolvedValue({});

    render(<AccountSettings />);

    await screen.findByLabelText("Display name");
    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Repeat new password"), {
      target: { value: "different" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("The new passwords do not match."),
    ).toBeVisible();
    expect(authClient.changePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Repeat new password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() =>
      expect(authClient.changePassword).toHaveBeenCalledWith(
        "old-password",
        "new-password-1",
        false,
      ),
    );
    expect(await screen.findByText("Password changed.")).toBeVisible();
  });

  it("revokes another session and flags the current one", async () => {
    authClient.sessionOverview.mockResolvedValue(overview);
    authClient.revokeSession.mockResolvedValue({});

    render(<AccountSettings />);

    expect(await screen.findByText("This device")).toBeVisible();
    expect(screen.getByText("Other device")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(authClient.revokeSession).toHaveBeenCalledWith("session-other"),
    );
    expect(await screen.findByText("Session signed out.")).toBeVisible();
  });

  it("signs out all other devices in one action", async () => {
    authClient.sessionOverview.mockResolvedValue(overview);
    authClient.revokeOtherSessions.mockResolvedValue({});

    render(<AccountSettings />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Sign out all other devices",
      }),
    );

    await waitFor(() =>
      expect(authClient.revokeOtherSessions).toHaveBeenCalled(),
    );
    expect(
      await screen.findByText("All other sessions signed out."),
    ).toBeVisible();
  });
});
