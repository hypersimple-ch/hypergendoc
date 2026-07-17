"use client";
import { useState } from "react";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import { dashboardApi, type Member } from "../lib/dashboard-api";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";

type Notice = { kind: "success" | "error"; text: string };

export function MembersDashboard() {
  const context = useLoaded(dashboardApi.context);
  const members = useLoaded(dashboardApi.members);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [notice, setNotice] = useState<Notice>();
  const [inviting, setInviting] = useState(false);
  const owner = context.value?.role === "owner";

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (inviting) return;
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
      setInviting(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Members</p>
          <h1>People and permissions.</h1>
          <p>
            Roles are workspace-scoped and checked by the server on every
            request. This MVP supports one workspace per person.
          </p>
        </div>
      </section>
      <LoadState {...context} />
      {context.value && !owner && (
        <Status kind="warning">
          You can view members, but only workspace owners can send invitations
          or change roles.
        </Status>
      )}
      {owner && (
        <section className="panel dashboard-panel">
          <form
            className="inline-form"
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
      {notice && <Status kind={notice.kind}>{notice.text}</Status>}
      <section className="panel dashboard-panel">
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
                  currentUserId={context.value?.userId}
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
  currentUserId,
  onChange,
  onNotice,
}: {
  member: Member;
  owner: boolean;
  currentUserId: string | undefined;
  onChange: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [pending, setPending] = useState(false);

  async function changeRole(role: WorkspaceRole) {
    if (pending || role === member.role) return;
    setPending(true);
    try {
      await dashboardApi.changeMemberRole(member.userId, role);
      onNotice({ kind: "success", text: "Member role updated." });
      onChange();
    } catch (error) {
      onNotice({ kind: "error", text: safeError(error) });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (
      pending ||
      !confirm(`Remove ${member.name || member.email} from this workspace?`)
    )
      return;
    setPending(true);
    try {
      await dashboardApi.removeMember(member.userId);
      onNotice({ kind: "success", text: "Member removed." });
      onChange();
    } catch (error) {
      onNotice({ kind: "error", text: safeError(error) });
      setPending(false);
    }
  }

  return (
    <tr>
      <td>
        <strong>{member.name || member.email}</strong>
        {member.name && <small className="subtle">{member.email}</small>}
        {member.userId === currentUserId && (
          <small className="subtle">Current account</small>
        )}
      </td>
      <td>
        {owner ? (
          <select
            className="input"
            aria-label={`Role for ${member.name || member.email}`}
            value={member.role}
            disabled={pending}
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
      <td>{new Date(member.createdAt).toLocaleDateString()}</td>
      {owner && (
        <td>
          <Button
            tone="danger"
            disabled={pending}
            onClick={() => void remove()}
          >
            {pending ? "Updating…" : "Remove"}
          </Button>
        </td>
      )}
    </tr>
  );
}
