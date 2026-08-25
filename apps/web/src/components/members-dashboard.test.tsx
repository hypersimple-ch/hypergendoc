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
  createInvite: vi.fn(),
  invites: vi.fn(),
  revokeInvite: vi.fn(),
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
    api.invites.mockResolvedValue([]);
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
    api.invites.mockResolvedValue([]);

    render(<MembersDashboard />);

    const role = await screen.findByLabelText("Role for Owner");
    const remove = screen.getByRole("button", { name: "Remove" });

    expect(role).toBeDisabled();
    expect(role).toHaveAttribute(
      "title",
      "Add another owner before changing this role.",
    );
    expect(role).toHaveClass(
      "disabled:cursor-not-allowed",
      "disabled:bg-muted",
      "disabled:text-muted-foreground",
    );
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute(
      "title",
      "Add another owner before removing this account.",
    );
    expect(remove).toHaveClass(
      "disabled:cursor-not-allowed",
      "disabled:bg-muted",
      "disabled:text-muted-foreground",
    );
    expect(screen.getByText("At least one owner is required.")).toBeVisible();
  });

  it("creates an email invitation and shows its one-time link once", async () => {
    activeCompany.mockReturnValue({
      context: { role: "owner", userId: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);
    api.invites.mockResolvedValue([]);
    const creation = {
      invite: {
        id: "invite-1",
        email: "new@example.test",
        role: "member",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-08T00:00:00.000Z",
      },
      link: "https://app.test/invite/one-time-token",
    };
    api.createInvite.mockResolvedValue(creation);

    render(<MembersDashboard />);

    fireEvent.change(await screen.findByLabelText("Invite email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(
      await screen.findByText(/invitation email for new@example.test was queued/),
    ).toBeVisible();
    expect(api.createInvite).toHaveBeenCalledWith("new@example.test", "member");
    const link = await screen.findByLabelText("One-time invite link");
    expect(link).toHaveValue(creation.link);
    expect(screen.getByText(/appears only once/)).toBeVisible();
    expect(api.invites).toHaveBeenCalled();

    // A second submission clears the previous link instead of re-showing it.
    api.createInvite.mockResolvedValue({
        ...creation,
        invite: { ...creation.invite, email: "other@example.test" },
      });
    fireEvent.change(screen.getByLabelText("Invite email"), {
      target: { value: "other@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await screen.findByText(/invitation email for other@example.test was queued/);
  });

  it("prevents duplicate member invitations while one is pending", async () => {
    let resolveInvite: () => void;
    activeCompany.mockReturnValue({
      context: { role: "owner", userId: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);
    api.invites.mockResolvedValue([]);
    api.createInvite.mockImplementation(() => {
      resolveInvite = () => {};
      return new Promise<void>(() => {});
    });
    render(<MembersDashboard />);

    fireEvent.change(await screen.findByLabelText("Invite email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Send invite" }).closest("form")!,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Sending…" }).closest("form")!,
    );
    expect(api.createInvite).toHaveBeenCalledTimes(1);
    resolveInvite!();
  });

  it("lists open invitations and lets owners revoke them", async () => {
    activeCompany.mockReturnValue({
      context: { role: "owner", userId: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);
    api.invites.mockResolvedValue([
      {
        id: "invite-1",
        email: "pending@example.test",
        role: "member",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-08T00:00:00.000Z",
      },
    ]);
    api.revokeInvite.mockResolvedValue(undefined);

    render(<MembersDashboard />);

    expect(
      await screen.findByText("pending@example.test"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(api.revokeInvite).toHaveBeenCalledWith("invite-1"),
    );
    expect(
      await screen.findByText("Invitation revoked."),
    ).toBeVisible();
  });

  it("hides the invitation flows from non-owner members", async () => {
    activeCompany.mockReturnValue({
      context: { role: "member", userId: "member" },
      loading: false,
      reload: vi.fn(),
    });
    api.members.mockResolvedValue([member]);

    render(<MembersDashboard />);

    await screen.findByText(/only workspace owners can send invitations/);
    expect(screen.queryByLabelText("Invite email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
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
