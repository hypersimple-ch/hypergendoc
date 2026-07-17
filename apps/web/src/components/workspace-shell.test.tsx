/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type * as ApiClientModule from "../lib/api-client";

const { current, replace, signOut } = vi.hoisted(() => ({
  current: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const router = { replace };
  return {
    usePathname: () => "/workspace/documents",
    useRouter: () => router,
  };
});
vi.mock("../lib/auth-client", () => ({
  authClient: { signOut },
}));
vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return { ...actual, workspaceApi: { current } };
});

import { ApiError } from "../lib/api-client";
import { SessionBoundary, WorkspaceShell } from "./workspace-shell";

afterEach(() => {
  cleanup();
  current.mockReset();
  replace.mockReset();
  signOut.mockReset();
});

describe("SessionBoundary", () => {
  it("renders dashboard content after server-resolved workspace access", async () => {
    current.mockResolvedValue({ id: "workspace-1" });

    render(
      <SessionBoundary>
        <p>Dashboard</p>
      </SessionBoundary>,
    );

    expect(await screen.findByText("Dashboard")).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends unauthenticated visitors to login with their destination", async () => {
    current.mockRejectedValue(
      new ApiError("unauthenticated", "Sign in required."),
    );

    render(<SessionBoundary>Dashboard</SessionBoundary>);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/login?next=%2Fworkspace%2Fdocuments",
      ),
    );
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("sends users without a workspace membership to setup", async () => {
    current.mockRejectedValue(new ApiError("forbidden", "Access denied."));

    render(<SessionBoundary>Dashboard</SessionBoundary>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/setup"));
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("explains how to recover from ambiguous workspace memberships", async () => {
    current
      .mockRejectedValueOnce(new ApiError("conflict", "Access denied."))
      .mockResolvedValueOnce({ id: "workspace-1" });

    render(<SessionBoundary>Dashboard</SessionBoundary>);

    expect(
      await screen.findByText(
        "Your account has memberships in multiple workspaces.",
      ),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Dashboard")).toBeVisible();
  });
});

describe("WorkspaceShell", () => {
  it("keeps sign-out visible and retryable when the request fails", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));

    render(
      <WorkspaceShell>
        <p>Dashboard</p>
      </WorkspaceShell>,
    );

    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out failed. Please try again.",
    );
    expect(button).toBeEnabled();

    signOut.mockResolvedValueOnce({});
    fireEvent.click(button);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
