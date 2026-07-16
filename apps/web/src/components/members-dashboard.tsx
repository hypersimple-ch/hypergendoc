"use client";
import { useState } from "react";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";
export function MembersDashboard() {
  const context = useLoaded(dashboardApi.context);
  const members = useLoaded(dashboardApi.members);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [message, setMessage] = useState<string>();
  const owner = context.value?.role === "owner";
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await dashboardApi.invite(email, role);
      setEmail("");
      setMessage("Member added.");
      members.reload();
    } catch (e) {
      setMessage(safeError(e));
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
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Role">
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as WorkspaceRole)}
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </FormField>
            <Button>Add verified member</Button>
          </form>
          {message && (
            <Status kind={message.includes("added") ? "success" : "error"}>
              {message}
            </Status>
          )}
        </section>
      )}
      <section className="panel dashboard-panel">
        <LoadState {...members} />
        {members.value &&
          (members.value.length ? (
            <Table
              caption="Workspace members"
              columns={["Member", "Role", "Joined"]}
            >
              {members.value.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name || member.email}</strong>
                    {member.name && (
                      <small className="subtle">{member.email}</small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${member.role === "owner" ? "" : "badge--muted"}`}
                    >
                      {member.role}
                    </span>
                  </td>
                  <td>{new Date(member.createdAt).toLocaleDateString()}</td>
                </tr>
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
