"use client";

import { useRef, useState } from "react";
import { KeyRound, MonitorSmartphone, UserRound } from "lucide-react";
import {
  authClient,
  type AuthSessionRecord,
} from "../lib/auth-client";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import {
  Button,
  FormField,
  Input,
  PageHeader,
  Status,
  Table,
} from "./primitives";

type Notice = { kind: "success" | "error"; text: string };

function formatDate(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown" : parsed.toLocaleString();
}

function describeAgent(userAgent?: string | null) {
  if (!userAgent) return "Unknown device";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Other device";
}

function sortedSessions(
  sessions: Array<AuthSessionRecord & { current: boolean }>,
) {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

export function AccountSettings() {
  const overview = useLoaded(authClient.sessionOverview);
  const [profileNotice, setProfileNotice] = useState<Notice>();
  const [passwordNotice, setPasswordNotice] = useState<Notice>();
  const [sessionsNotice, setSessionsNotice] = useState<Notice>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const savingProfileRef = useRef(false);
  const savingPasswordRef = useRef(false);
  const revokingRef = useRef<string | null>(null);
  const revokingOthersRef = useRef(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfileRef.current) return;
    const form = event.currentTarget;
    const name = new FormData(form).get("name");
    if (typeof name !== "string" || !name.trim()) return;
    savingProfileRef.current = true;
    setSavingProfile(true);
    setProfileNotice(undefined);
    try {
      await authClient.updateName(name.trim());
      setProfileNotice({ kind: "success", text: "Profile updated." });
      overview.reload();
    } catch (error) {
      setProfileNotice({ kind: "error", text: safeError(error) });
    } finally {
      savingProfileRef.current = false;
      setSavingProfile(false);
    }
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPasswordRef.current) return;
    const form = event.currentTarget;
    const currentPassword = new FormData(form).get("currentPassword");
    const newPassword = new FormData(form).get("newPassword");
    const confirmPassword = new FormData(form).get("confirmPassword");
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string"
    )
      return;
    if (newPassword !== confirmPassword) {
      setPasswordNotice({
        kind: "error",
        text: "The new passwords do not match.",
      });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordNotice({
        kind: "error",
        text: "Choose a password different from the current one.",
      });
      return;
    }
    savingPasswordRef.current = true;
    setSavingPassword(true);
    setPasswordNotice(undefined);
    try {
      await authClient.changePassword(currentPassword, newPassword, false);
      form.reset();
      setPasswordNotice({ kind: "success", text: "Password changed." });
    } catch (error) {
      setPasswordNotice({ kind: "error", text: safeError(error) });
    } finally {
      savingPasswordRef.current = false;
      setSavingPassword(false);
    }
  }

  async function revoke(id: string) {
    if (revokingRef.current) return;
    revokingRef.current = id;
    setRevoking(id);
    setSessionsNotice(undefined);
    try {
      await authClient.revokeSession(id);
      setSessionsNotice({ kind: "success", text: "Session signed out." });
      overview.reload();
    } catch (error) {
      setSessionsNotice({ kind: "error", text: safeError(error) });
    } finally {
      revokingRef.current = null;
      setRevoking(null);
    }
  }

  async function revokeOthers() {
    if (revokingOthersRef.current) return;
    revokingOthersRef.current = true;
    setRevokingOthers(true);
    setSessionsNotice(undefined);
    try {
      await authClient.revokeOtherSessions();
      setSessionsNotice({
        kind: "success",
        text: "All other sessions signed out.",
      });
      overview.reload();
    } catch (error) {
      setSessionsNotice({ kind: "error", text: safeError(error) });
    } finally {
      revokingOthersRef.current = false;
      setRevokingOthers(false);
    }
  }

  const user = overview.value?.user;

  return (
    <div className="dashboard-stack">
      <PageHeader
        eyebrow="Administration"
        title="Account settings"
        description="Manage your personal credentials and signed-in devices."
      />

      <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="shrink-0 self-start rounded-md bg-accent p-2 text-accent-foreground">
            <UserRound className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Profile</p>
            <h2 className="text-base font-semibold">Display name</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.email ? (
                <>
                  Signed in as <strong>{user.email}</strong>. Workspace email
                  addresses cannot be changed here.
                </>
              ) : (
                "The name shown to other workspace members."
              )}
            </p>
          </div>
        </div>
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          onSubmit={(event) => void saveProfile(event)}
        >
          <FormField label="Display name">
            <Input
              name="name"
              type="text"
              maxLength={64}
              defaultValue={user?.name ?? ""}
              key={user?.name ?? "loading"}
              required
              disabled={savingProfile || overview.loading}
            />
          </FormField>
          <Button type="submit" disabled={savingProfile || overview.loading}>
            {savingProfile ? "Saving…" : "Save name"}
          </Button>
        </form>
        {profileNotice && (
          <div className="mutation-feedback" aria-live="polite" aria-atomic="true">
            <Status kind={profileNotice.kind}>{profileNotice.text}</Status>
          </div>
        )}
      </section>

      <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="shrink-0 self-start rounded-md bg-accent p-2 text-accent-foreground">
            <KeyRound className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Security</p>
            <h2 className="text-base font-semibold">Change password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Other signed-in devices stay signed in. Sign them out below if
              needed.
            </p>
          </div>
        </div>
        <form
          className="grid gap-4 md:grid-cols-3 md:items-end"
          onSubmit={(event) => void savePassword(event)}
        >
          <FormField label="Current password">
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              disabled={savingPassword}
            />
          </FormField>
          <FormField label="New password">
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={savingPassword}
            />
          </FormField>
          <FormField label="Repeat new password">
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={savingPassword}
            />
          </FormField>
          <Button
            type="submit"
            disabled={savingPassword}
            className="md:col-span-3 md:justify-self-start"
          >
            {savingPassword ? "Changing…" : "Change password"}
          </Button>
        </form>
        {passwordNotice && (
          <div className="mutation-feedback" aria-live="polite" aria-atomic="true">
            <Status kind={passwordNotice.kind}>{passwordNotice.text}</Status>
          </div>
        )}
      </section>

      <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="shrink-0 self-start rounded-md bg-accent p-2 text-accent-foreground">
            <MonitorSmartphone className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Devices</p>
            <h2 className="text-base font-semibold">Signed-in sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign out any device you no longer recognize.
            </p>
          </div>
        </div>
        <LoadState {...overview} />
        {overview.value && (
          <>
            {sortedSessions(overview.value.sessions).length > 1 && (
                <div className="mb-3">
                  <Button
                    tone="quiet"
                    disabled={revokingOthers}
                    onClick={() => void revokeOthers()}
                  >
                    {revokingOthers
                      ? "Signing out…"
                      : "Sign out all other devices"}
                  </Button>
                </div>
              )}
              <Table
                caption="Signed-in sessions"
                columns={["Device", "Signed in", "Expires", "Status", "Actions"]}
              >
                {sortedSessions(overview.value.sessions).map((session) => (
                  <tr key={session.id}>
                    <td>
                      <strong>{describeAgent(session.userAgent)}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {session.ipAddress ?? "Unknown address"}
                      </span>
                    </td>
                    <td>{formatDate(session.createdAt)}</td>
                    <td>{formatDate(session.expiresAt)}</td>
                    <td>
                      {session.current ? (
                        <Status kind="success">This device</Status>
                      ) : (
                        <Status kind="neutral">Other device</Status>
                      )}
                    </td>
                    <td>
                      {session.current ? (
                        <span className="text-sm text-muted-foreground">
                          —
                        </span>
                      ) : (
                        <Button
                          tone="quiet"
                          disabled={revoking !== null}
                          onClick={() => void revoke(session.id)}
                        >
                          {revoking === session.id ? "Signing out…" : "Sign out"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
          </>
        )}
        {overview.value && !overview.value.sessions.length && (
          <Empty>No active sessions found.</Empty>
        )}
        {sessionsNotice && (
          <div className="mutation-feedback" aria-live="polite" aria-atomic="true">
            <Status kind={sessionsNotice.kind}>{sessionsNotice.text}</Status>
          </div>
        )}
      </section>
    </div>
  );
}
