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

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const api = vi.hoisted(() => vi.fn());
const apiClient = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../lib/api-client", () => ({ api, ...apiClient }));

import { InviteAcceptForm } from "./invite-accept";

const inviteView = {
  workspaceName: "Acme",
  email: "new@example.test",
  role: "member",
  expiresAt: "2026-01-08T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InviteAcceptForm", () => {
  it("shows the invitation details and accepts with name and password", async () => {
    api
      .mockResolvedValueOnce(inviteView)
      .mockResolvedValueOnce({ workspaceName: "Acme" });

    render(<InviteAcceptForm token="raw-token" />);

    expect(await screen.findByTestId("invite-summary")).toHaveTextContent(
      /Invited as member on Acme/,
    );
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "New Person" },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/), {
      target: { value: "long-enough-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/invites/raw-token/accept", {
        method: "POST",
        body: { name: "New Person", password: "long-enough-password" },
      }),
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/login?invited=true"),
    );
  });

  it("rejects weak passwords before submitting", async () => {
    api.mockResolvedValueOnce(inviteView);
    render(<InviteAcceptForm token="raw-token" />);
    await screen.findByTestId("invite-summary");

    const password = screen.getByLabelText(/^Password$/);
    expect(password).toHaveAttribute("minLength", "12");
    expect(api).toHaveBeenCalledTimes(1); // inspect only
  });

  it("explains used or expired invitations", async () => {
    api.mockRejectedValueOnce(new apiClient.ApiError("gone", "Gone"));
    render(<InviteAcceptForm token="used-token" />);

    expect(
      await screen.findByText(/expired or was already used/),
    ).toBeVisible();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("explains unknown invitation tokens", async () => {
    api.mockRejectedValueOnce(new apiClient.ApiError("not_found", "Not found"));
    render(<InviteAcceptForm token="missing-token" />);

    expect(
      await screen.findByText(/link is invalid/),
    ).toBeVisible();
  });

  it("reports conflicts when an account already exists", async () => {
    api
      .mockResolvedValueOnce(inviteView)
      .mockRejectedValueOnce(new apiClient.ApiError("conflict", "Conflict"));
    render(<InviteAcceptForm token="raw-token" />);
    await screen.findByTestId("invite-summary");

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "New Person" },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/), {
      target: { value: "long-enough-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(/account with this email already exists/),
    ).toBeVisible();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
