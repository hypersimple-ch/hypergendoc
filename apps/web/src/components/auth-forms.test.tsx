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
const { forgotPassword, resetPassword, searchParam, policyApi } = vi.hoisted(
  () => ({
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    searchParam: vi.fn(),
    policyApi: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: searchParam }),
}));
vi.mock("../lib/auth-client", () => ({
  authClient: { forgotPassword, resetPassword },
}));
vi.mock("../lib/api-client", () => ({
  api: policyApi,
  ApiError: class ApiError extends Error {},
}));

import {
  EmailActionForm,
  ResetForm,
  SignupPolicyHint,
} from "./auth-forms";

afterEach(() => {
  cleanup();
  forgotPassword.mockReset();
  resetPassword.mockReset();
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
        "If an account exists, check your inbox shortly. Delivery may be delayed.",
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
    render(<ResetForm />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "password-reset link is missing or incomplete",
    );
    expect(
      screen.queryByRole("button", { name: "Set new password" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});

describe("SignupPolicyHint", () => {
  it("stays hidden on open deployments", async () => {
    policyApi.mockResolvedValue({ mode: "open" });
    render(<SignupPolicyHint />);
    await waitFor(() => expect(policyApi).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains invitation-only registration for invite deployments", async () => {
    policyApi.mockResolvedValue({ mode: "invite" });
    render(<SignupPolicyHint />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      /by invitation/i,
    );
  });

  it("stays quiet when the policy cannot be fetched", async () => {
    policyApi.mockRejectedValue(new Error("offline"));
    render(<SignupPolicyHint />);
    await waitFor(() => expect(policyApi).toHaveBeenCalled());
    // No status appears; the form simply behaves as before.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
