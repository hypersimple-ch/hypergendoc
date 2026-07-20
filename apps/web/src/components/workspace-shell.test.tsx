/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ApiClientModule from "../lib/api-client";

type MockSelectProps = Omit<
  ComponentProps<"select">,
  "children" | "onChange"
> & {
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
};

const { current, replace, signOut, context, companies, navigation } =
  vi.hoisted(() => ({
    current: vi.fn(),
    replace: vi.fn(),
    signOut: vi.fn(),
    context: vi.fn(),
    companies: vi.fn(),
    navigation: { pathname: "/workspace/documents" },
  }));

vi.mock("next/navigation", () => {
  const router = { replace };
  return {
    usePathname: () => navigation.pathname,
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
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: { context, companies },
}));
vi.mock("./primitives", () => ({
  Select: ({ options, onValueChange, ...props }: MockSelectProps) => (
    <select {...props} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option: { value: string; label: string }) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

import { ApiError } from "../lib/api-client";
import { useActiveCompany } from "./active-company";
import { SessionBoundary, WorkspaceShell } from "./workspace-shell";

const workspace = {
  id: "workspace-1",
  name: "Acme Studio",
  userId: "user-1",
  role: "owner" as const,
};
const company = (
  id: string,
  name: string,
  archivedAt: string | null = null,
) => ({
  id,
  name,
  archivedAt,
  workspaceId: workspace.id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function ActiveCompanyChild() {
  const { activeCompany } = useActiveCompany();
  return <p>Route company: {activeCompany?.name ?? "none"}</p>;
}

function mockCompanies(items = [company("company-1", "Northwind")]) {
  context.mockResolvedValue(workspace);
  companies.mockResolvedValue(items);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
  navigation.pathname = "/workspace/documents";
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
  });

  it("preserves ambiguous-membership recovery", async () => {
    current
      .mockRejectedValueOnce(new ApiError("conflict", "Access denied."))
      .mockResolvedValueOnce({ id: "workspace-1" });
    render(<SessionBoundary>Dashboard</SessionBoundary>);
    expect(
      await screen.findByText(
        "Your account has memberships in multiple workspaces.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dashboard")).toBeVisible();
  });
});

describe("WorkspaceShell", () => {
  it("provides the active company to route children and shows workspace identity", async () => {
    mockCompanies([
      company("company-1", "Northwind"),
      company("archived", "Archived", "2026-01-02T00:00:00.000Z"),
    ]);
    render(
      <WorkspaceShell>
        <ActiveCompanyChild />
      </WorkspaceShell>,
    );

    expect(await screen.findByText("Acme Studio")).toBeVisible();
    expect(screen.getByText("Route company: Northwind")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Active company" }),
    ).toHaveTextContent("Northwind");
  });

  it("switches companies globally and keeps the provider mounted across route rerenders", async () => {
    mockCompanies([
      company("company-1", "Northwind"),
      company("company-2", "Contoso"),
    ]);
    const view = render(
      <WorkspaceShell>
        <ActiveCompanyChild />
      </WorkspaceShell>,
    );
    const select = await screen.findByRole("combobox", {
      name: "Active company",
    });

    fireEvent.change(select, { target: { value: "company-2" } });
    expect(screen.getByText("Route company: Contoso")).toBeVisible();

    navigation.pathname = "/workspace/styles";
    view.rerender(
      <WorkspaceShell>
        <ActiveCompanyChild />
      </WorkspaceShell>,
    );
    expect(screen.getByText("Route company: Contoso")).toBeVisible();
    expect(context).toHaveBeenCalledOnce();
  });

  it("guides users while companies load, fail, or have no active choice", async () => {
    let resolveContext: (value: typeof workspace) => void;
    context.mockReturnValue(
      new Promise<typeof workspace>((resolve) => {
        resolveContext = resolve;
      }),
    );
    companies.mockResolvedValue([]);
    const view = render(
      <WorkspaceShell>
        <p>Dashboard</p>
      </WorkspaceShell>,
    );
    expect(screen.getByText("Loading companies…")).toBeVisible();

    resolveContext!(workspace);
    expect(
      await screen.findByText(/No active companies are available/),
    ).toBeVisible();

    view.unmount();
    context
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(workspace);
    companies.mockResolvedValue([company("company-1", "Northwind")]);
    render(
      <WorkspaceShell>
        <p>Dashboard</p>
      </WorkspaceShell>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not load companies.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("combobox", { name: "Active company" }),
    ).toBeVisible();
  });

  it("keeps mobile navigation and sign-out retry behavior", async () => {
    mockCompanies();
    signOut.mockRejectedValueOnce(new Error("offline"));
    render(
      <WorkspaceShell>
        <p>Dashboard</p>
      </WorkspaceShell>,
    );

    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "Documents" }), {
      button: 1,
    });
    expect(menu).toHaveAttribute("aria-expanded", "false");

    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out failed. Please try again.",
    );
    signOut.mockResolvedValueOnce({});
    fireEvent.click(button);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
