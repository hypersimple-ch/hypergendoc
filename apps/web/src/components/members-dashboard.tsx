"use client";

import { useRef, useState } from "react";
import { ShieldCheck, UserPlus, Users } from "lucide-react";
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
      <section className="members-dashboard page-heading flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">Governance / members</p>
          <h1 className="mt-1">Members & permissions</h1>
          <p>
            Manage workspace access with server-enforced roles. Changes apply to
            every request immediately.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Workspace roles
        </div>
      </section>

      <LoadState
        loading={contextLoading}
        error={contextError}
        reload={reload}
      />

      {context && (
        <section
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Member access summary"
        >
          <SummaryCard
            icon={<Users className="size-4" />}
            label="People"
            value={members.value?.length ?? "—"}
          />
          <SummaryCard
            icon={<ShieldCheck className="size-4" />}
            label="Workspace owners"
            value={members.value ? ownerCount : "—"}
          />
          <SummaryCard
            icon={<ShieldCheck className="size-4" />}
            label="Your access"
            value={owner ? "Owner" : "Member"}
          />
        </section>
      )}

      {context && !owner && (
        <section
          className="rounded-lg border border-border bg-card p-4"
          aria-label="Member permissions"
        >
          <div className="flex gap-3">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Read-only member directory
              </h2>
              <Status kind="warning">
                You can view members, but only workspace owners can send
                invitations or change roles.
              </Status>
            </div>
          </div>
        </section>
      )}

      {owner && (
        <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-md bg-accent p-2 text-accent-foreground">
              <UserPlus className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">Access control</p>
              <h2 className="text-base font-semibold">Add a verified member</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add an already registered, verified user. Email invitation links
                are not available in this MVP.
              </p>
            </div>
          </div>
          <form
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end"
            onSubmit={(event) => void invite(event)}
          >
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
        <div
          className="mutation-feedback"
          aria-live="polite"
          aria-atomic="true"
        >
          <Status kind={notice.kind}>{notice.text}</Status>
        </div>
      )}

      <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Directory</p>
            <h2 className="text-base font-semibold">Workspace members</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Owner changes are recorded in the audit log.
          </p>
        </div>
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

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
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
          <div className="flex flex-col gap-0.5">
            <strong>{member.name || member.email}</strong>
            {member.name && (
              <small className="text-muted-foreground">{member.email}</small>
            )}
            {member.userId === currentUserId && (
              <small className="text-muted-foreground">Current account</small>
            )}
          </div>
        </td>
        <td data-label="Role">
          {owner ? (
            <select
              className="input max-w-32"
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
          <td data-label="Actions">
            <div className="flex flex-col items-start gap-1">
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
                <small className="text-muted-foreground">
                  At least one owner is required.
                </small>
              ) : null}
            </div>
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
