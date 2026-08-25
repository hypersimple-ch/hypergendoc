"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import { ApiError, api } from "../lib/api-client";
import { Button, FormField, Input, Status } from "./primitives";

export type InvitePublicView = {
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
};

type LoadState =
  | { phase: "loading" }
  | { phase: "invalid"; reason: string }
  | { phase: "ready"; invite: InvitePublicView };

const expiredMessage =
  "This invitation link has expired or was already used. Ask a workspace owner for a new one.";
const missingMessage =
  "This invitation link is invalid. Double-check the link or request a new invitation.";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    api<InvitePublicView>(`/api/invites/${encodeURIComponent(token)}`)
      .then((invite) => {
        if (active) setState({ phase: "ready", invite });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const code =
          cause instanceof ApiError ? cause.code : "internal_error";
        setState({
          phase: "invalid",
          reason:
            code === "gone"
              ? expiredMessage
              : code === "rate_limited"
                ? "Too many attempts. Wait a minute and try again."
                : missingMessage,
        });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await api(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: { name, password },
      });
      router.replace("/login?invited=true");
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "conflict"
          ? "An account with this email already exists. Sign in instead."
          : safeFailure(cause),
      );
      setPending(false);
    } finally {
      pendingRef.current = false;
    }
  }

  if (state.phase === "loading")
    return <Status kind="neutral">Checking your invitation…</Status>;
  if (state.phase === "invalid")
    return <Status kind="error">{state.reason}</Status>;

  return (
    <section className="auth-form" aria-label="Accept invitation">
      <p className="text-sm text-muted-foreground" data-testid="invite-summary">
        Invited as{" "}
        <strong className="text-foreground">{state.invite.role}</strong> on{" "}
        <strong className="text-foreground">{state.invite.workspaceName}</strong>{" "}
        ({state.invite.email}). Expires{" "}
        {new Date(state.invite.expiresAt).toLocaleDateString()}.
      </p>
      <form onSubmit={(event) => void accept(event)} aria-busy={pending}>
        <FormField label="Your name">
          <Input
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
          />
        </FormField>
        <FormField label="Password" hint="At least 12 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
        </FormField>
        {error && <Status kind="error">{error}</Status>}
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </section>
  );
}

function safeFailure(cause: unknown): string {
  if (cause instanceof ApiError && cause.message) return cause.message;
  return "The invitation could not be accepted. Try again shortly.";
}
