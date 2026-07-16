"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
import { ApiError } from "../lib/api-client";
import { Button, FormField, Input, Status } from "./primitives";

function useSubmit(action: () => Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitAction();
  }
  async function submitAction() {
    setPending(true);
    setError(undefined);
    try {
      await action();
      setMessage("Check your email for the next step.");
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  }
  return { pending, message, error, submit };
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const state = useSubmit(async () => {
    await authClient.login(email, password);
    window.location.assign("/workspace");
  });
  return (
    <form onSubmit={state.submit} className="auth-form">
      <FormField label="Email">
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Password">
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      {state.error && <Status kind="error">{state.error}</Status>}
      <Button type="submit" disabled={state.pending}>
        {state.pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link href="/forgot-password">Forgot password?</Link>
    </form>
  );
}
export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const state = useSubmit(() => authClient.register(name, email, password));
  return (
    <form onSubmit={state.submit} className="auth-form">
      <FormField label="Name">
        <Input
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="Work email">
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Password" hint="At least 12 characters.">
        <Input
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      {state.error && <Status kind="error">{state.error}</Status>}
      {state.message && <Status kind="success">{state.message}</Status>}
      <Button type="submit" disabled={state.pending}>
        {state.pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
export function EmailActionForm({ kind }: { kind: "forgot" | "verify" }) {
  const [email, setEmail] = useState("");
  const state = useSubmit(() =>
    kind === "forgot"
      ? authClient.forgotPassword(email)
      : authClient.sendVerification(email),
  );
  return (
    <form onSubmit={state.submit} className="auth-form">
      <FormField label="Email">
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      {state.error && <Status kind="error">{state.error}</Status>}
      {state.message && <Status kind="success">{state.message}</Status>}
      <Button type="submit" disabled={state.pending}>
        {kind === "forgot" ? "Email reset link" : "Resend verification"}
      </Button>
    </form>
  );
}
export function ResetForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const state = useSubmit(() =>
    authClient.resetPassword(password, params.get("token") ?? ""),
  );
  return (
    <form onSubmit={state.submit} className="auth-form">
      <FormField label="New password">
        <Input
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      {state.error && <Status kind="error">{state.error}</Status>}
      {state.message && (
        <Status kind="success">Password changed. You can now sign in.</Status>
      )}
      <Button type="submit" disabled={state.pending}>
        Set new password
      </Button>
    </form>
  );
}
export function WorkspaceForm() {
  const [name, setName] = useState("");
  const state = useSubmit(async () => {
    await authClient.createWorkspace(name);
    window.location.assign("/workspace");
  });
  return (
    <form onSubmit={state.submit} className="auth-form">
      <FormField label="Workspace name">
        <Input
          autoComplete="organization"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      {state.error && <Status kind="error">{state.error}</Status>}
      <Button type="submit" disabled={state.pending}>
        Create workspace
      </Button>
    </form>
  );
}
export function InvitationForm() {
  const params = useSearchParams();
  const state = useSubmit(() =>
    authClient.acceptInvitation(params.get("invitationId") ?? ""),
  );
  return (
    <form onSubmit={state.submit} className="auth-form">
      <p>
        Accepting an invitation joins the workspace named in your secure
        invitation.
      </p>
      {state.error && <Status kind="error">{state.error}</Status>}
      {state.message && (
        <Status kind="success">
          Invitation accepted. You can open your workspace.
        </Status>
      )}
      <Button type="submit" disabled={state.pending}>
        Accept invitation
      </Button>
    </form>
  );
}
