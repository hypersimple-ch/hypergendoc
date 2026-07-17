/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type * as ApiClientModule from "../lib/api-client";

const { current, replace } = vi.hoisted(() => ({
  current: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/documents",
  useRouter: () => ({ replace }),
}));
vi.mock("../lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));
vi.mock("../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return { ...actual, workspaceApi: { current } };
});

import { ApiError } from "../lib/api-client";
import { SessionBoundary } from "./workspace-shell";

afterEach(() => {
  cleanup();
  current.mockReset();
  replace.mockReset();
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
});
