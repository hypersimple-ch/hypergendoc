"use client";
import { useRef, useState } from "react";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import { dashboardApi, type Member } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Status,
  Table,
} from "./primitives";

type Notice = { kind: "success" | "error"; text: string };

export function MembersDashboard() {
  const {
    context,
    loading: contextLoading,
    error: contextError,
    reload,
  } = useActiveCompany();
  const members = useLoaded(dashboardApi.members);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [notice, setNotice] = useState<Notice>();
  const [inviting, setInviting] = useState(false);
  const invitingRef = useRef(false);
  const owner = context?.role === "owner";
  const ownerCount =
    members.value?.filter((member) => member.role === "owner").length ?? 0;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (invitingRef.current) return;
    invitingRef.current = true;
    setInviting(true);
    setNotice(undefined);
    try {
      await dashboardApi.invite(email, role);
      setEmail("");
      setNotice({ kind: "success", text: "Member added." });
      members.reload();
    } catch (error) {
      setNotice({ kind: "error", text: safeError(error) });
    } finally {
      invitingRef.current = false;
      setInviting(false);
    }
  }

  return (
    <>
      <section className="page-heading members-dashboard">
        <div>
          <p className="eyebrow">Members</p>
          <h1>People and permissions.</h1>
          <p>
            Roles are workspace-scoped and checked by the server on every
            request. This MVP supports one workspace per person.
          </p>
        </div>
      </section>
      <LoadState
        loading={contextLoading}
        error={contextError}
        reload={reload}
      />
      {context && !owner && (
        <Status kind="warning">
          You can view members, but only workspace owners can send invitations
          or change roles.
        </Status>
      )}
      {owner && (
        <section className="panel dashboard-panel members-dashboard__invite">
          <form
            className="inline-form members-dashboard__invite-form"
            onSubmit={(event) => void invite(event)}
          >
            <p className="subtle">
              Add an already registered, verified user. Email invitation links
              are not available in this MVP.
            </p>
            <FormField label="Verified account email">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={inviting}
              />
            </FormField>
            <FormField label="Role">
              <select
                className="input"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as WorkspaceRole)
                }
                disabled={inviting}
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </FormField>
            <Button type="submit" disabled={inviting}>
              {inviting ? "Adding…" : "Add verified member"}
            </Button>
          </form>
        </section>
      )}
      {notice && (
        <div className="members-dashboard__announcement" aria-live="polite">
          <Status kind={notice.kind}>{notice.text}</Status>
        </div>
      )}
      <section className="panel dashboard-panel members-dashboard__list">
        <LoadState {...members} />
        {members.value &&
          (members.value.length ? (
            <Table
              caption="Workspace members"
              columns={[
                "Member",
                "Role",
                "Joined",
                ...(owner ? ["Actions"] : []),
              ]}
            >
              {members.value.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  owner={owner}
                  lastOwner={member.role === "owner" && ownerCount === 1}
                  currentUserId={context?.userId}
                  onChange={members.reload}
                  onNotice={setNotice}
                />
              ))}
            </Table>
          ) : (
            <Empty>
              <strong>No members found</strong>
              <p>Invite collaborators when you are ready.</p>
            </Empty>
          ))}
      </section>
    </>
  );
}

function MemberRow({
  member,
  owner,
  lastOwner,
  currentUserId,
  onChange,
  onNotice,
}: {
  member: Member;
  owner: boolean;
  lastOwner: boolean;
  currentUserId: string | undefined;
  onChange: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [pending, setPending] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const pendingRef = useRef(false);

  async function changeRole(role: WorkspaceRole) {
    if (pendingRef.current || role === member.role) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await dashboardApi.changeMemberRole(member.userId, role);
      onNotice({ kind: "success", text: "Member role updated." });
      onChange();
    } catch (error) {
      onNotice({ kind: "error", text: safeError(error) });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function remove() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await dashboardApi.removeMember(member.userId);
      onNotice({ kind: "success", text: "Member removed." });
      onChange();
    } catch (error) {
      onNotice({ kind: "error", text: safeError(error) });
    } finally {
      pendingRef.current = false;
      setPending(false);
      setRemoveOpen(false);
    }
  }

  return (
    <>
      <tr className="members-dashboard__member">
        <td data-label="Member">
          <strong>{member.name || member.email}</strong>
          {member.name && <small className="subtle">{member.email}</small>}
          {member.userId === currentUserId && (
            <small className="subtle">Current account</small>
          )}
        </td>
        <td data-label="Role">
          {owner ? (
            <select
              className="input"
              aria-label={`Role for ${member.name || member.email}`}
              value={member.role}
              disabled={pending || lastOwner}
              title={
                lastOwner
                  ? "Add another owner before changing this role."
                  : undefined
              }
              onChange={(event) =>
                void changeRole(event.target.value as WorkspaceRole)
              }
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          ) : (
            <span
              className={`badge ${member.role === "owner" ? "" : "badge--muted"}`}
            >
              {member.role}
            </span>
          )}
        </td>
        <td data-label="Joined">
          {new Date(member.createdAt).toLocaleDateString()}
        </td>
        {owner && (
          <td data-label="Actions" className="members-dashboard__actions">
            <Button
              tone="danger"
              disabled={pending || lastOwner}
              title={
                lastOwner
                  ? "Add another owner before removing this account."
                  : undefined
              }
              onClick={() => setRemoveOpen(true)}
            >
              Remove
            </Button>
            {lastOwner ? (
              <small className="subtle">At least one owner is required.</small>
            ) : null}
          </td>
        )}
      </tr>
      <ConfirmDialog
        open={removeOpen}
        title="Remove member?"
        description={`Remove ${member.name || member.email} from this workspace? They will lose access immediately.`}
        confirmLabel="Remove member"
        pending={pending}
        tone="danger"
        onConfirm={() => void remove()}
        onClose={() => {
          if (!pending) setRemoveOpen(false);
        }}
      />
    </>
  );
}
