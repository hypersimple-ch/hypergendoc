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
const { forgotPassword, resetPassword, acceptInvitation, searchParam } =
  vi.hoisted(() => ({
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    acceptInvitation: vi.fn(),
    searchParam: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: searchParam }),
}));
vi.mock("../lib/auth-client", () => ({
  authClient: { forgotPassword, resetPassword, acceptInvitation },
}));

import { EmailActionForm, InvitationForm, ResetForm } from "./auth-forms";

afterEach(() => {
  cleanup();
  forgotPassword.mockReset();
  resetPassword.mockReset();
  acceptInvitation.mockReset();
  searchParam.mockReset();
});

describe("EmailActionForm", () => {
  it("communicates pending and successful reset-link submission states", async () => {
    let resolveRequest: () => void;
    forgotPassword.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<EmailActionForm kind="forgot" />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email reset link" }));

    expect(
      screen.getByRole("form", { name: "Request password reset" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "Sending reset link…" }),
    ).toBeDisabled();
    expect(forgotPassword).toHaveBeenCalledWith("owner@example.test");
    fireEvent.submit(
      screen.getByRole("form", { name: "Request password reset" }),
    );
    expect(forgotPassword).toHaveBeenCalledOnce();

    resolveRequest!();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Check your email for the next step.",
      );
    });
    expect(
      screen.getByRole("form", { name: "Request password reset" }),
    ).toHaveAttribute("aria-busy", "false");
  });

  it("renders API failures as an alert", async () => {
    forgotPassword.mockRejectedValue(new Error("network failure"));
    render(<EmailActionForm kind="forgot" />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Request password reset" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong.",
    );
  });

  it("replaces token-dependent forms with safe recovery states", () => {
    searchParam.mockReturnValue(null);
    const { rerender } = render(<ResetForm />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "password-reset link is missing or incomplete",
    );
    expect(
      screen.queryByRole("button", { name: "Set new password" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password");

    rerender(<InvitationForm />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "invitation link is missing or incomplete",
    );
    expect(
      screen.queryByRole("button", { name: "Accept invitation" }),
    ).not.toBeInTheDocument();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });
});
