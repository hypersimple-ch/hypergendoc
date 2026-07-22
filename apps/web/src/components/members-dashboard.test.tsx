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
  members: vi.fn(),
  invite: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));
const activeCompany = vi.hoisted(() => vi.fn());
vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));
vi.mock("./active-company", () => ({ useActiveCompany: activeCompany }));

import { MembersDashboard } from "./members-dashboard";

const member = {
  id: "membership-member",
  userId: "member",
  email: "member@example.test",
  name: "Member",
  role: "member",
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MembersDashboard", () => {
  it("lets owners change roles and remove members", async () => {
    activeCompany.mockReturnValue({
      context: { role: "owner", userId: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);
    api.changeMemberRole.mockResolvedValue({ ...member, role: "owner" });
    api.removeMember.mockResolvedValue(undefined);

    render(<MembersDashboard />);

    const role = await screen.findByLabelText("Role for Member");
    fireEvent.change(role, { target: { value: "owner" } });
    await waitFor(() =>
      expect(api.changeMemberRole).toHaveBeenCalledWith("member", "owner"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Remove Member from this workspace?");
    expect(api.removeMember).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() =>
      expect(api.removeMember).toHaveBeenCalledWith("member"),
    );
  });

  it("prevents the final owner from demoting or removing themselves", async () => {
    const owner = {
      ...member,
      id: "membership-owner",
      userId: "owner",
      email: "owner@example.test",
      name: "Owner",
      role: "owner",
    };
    activeCompany.mockReturnValue({
      context: { role: "owner", userId: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([owner]);

    render(<MembersDashboard />);

    expect(await screen.findByLabelText("Role for Owner")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByText("At least one owner is required.")).toBeVisible();
  });

  it("prevents duplicate member invitations while one is pending", async () => {
    let resolveInvite: () => void;
    activeCompany.mockReturnValue({
      context: { role: "owner", userId: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);
    api.invite.mockImplementation(
      () => new Promise<void>((resolve) => (resolveInvite = resolve)),
    );
    render(<MembersDashboard />);

    fireEvent.change(await screen.findByLabelText("Verified account email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Add verified member" })
        .closest("form")!,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Adding…" }).closest("form")!,
    );
    expect(api.invite).toHaveBeenCalledTimes(1);
    resolveInvite!();
  });

  it("keeps member management controls owner-only", async () => {
    activeCompany.mockReturnValue({
      context: { role: "member", userId: "member" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);

    render(<MembersDashboard />);

    expect(
      await screen.findByText(/only workspace owners can send invitations/),
    ).toBeVisible();
    expect(screen.queryByLabelText("Role for Member")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
  });
});
