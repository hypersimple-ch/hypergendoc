"use client";

import { api, ApiError } from "./api-client";

type AuthReply = {
  redirect?: boolean;
  message?: string;
  error?: { message?: string };
};

export type AuthUser = { name?: string; email?: string };
export type AuthSessionRecord = {
  id: string;
  createdAt?: string;
  expiresAt?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};
export type AuthSessionOverview = {
  user: AuthUser;
  sessions: Array<AuthSessionRecord & { current: boolean }>;
};

const verificationCallbackURL = "/login?verified=true";

async function authRequest(
  path: string,
  method: "POST" | "GET",
  body?: Record<string, unknown>,
) {
  try {
    const result = await fetch(`/api/auth/${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await result.json().catch(() => ({}))) as AuthReply;
    if (!result.ok)
      throw new ApiError(
        "network_error",
        data.error?.message ??
          data.message ??
          "We could not complete that request.",
      );
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "network_error",
      "We could not reach HyperGenDoc. Check your connection and try again.",
    );
  }
}

async function auth(path: string, body: Record<string, unknown>) {
  return authRequest(path, "POST", body);
}

/** Thin adapter for Better Auth's standard email endpoints; it never stores credentials. */
export const authClient = {
  register: (name: string, email: string, password: string) =>
    auth("sign-up/email", {
      name,
      email,
      password,
      callbackURL: verificationCallbackURL,
    }),
  login: (email: string, password: string) =>
    auth("sign-in/email", { email, password }),
  forgotPassword: (email: string) =>
    auth("request-password-reset", { email, redirectTo: "/reset-password" }),
  resetPassword: (newPassword: string, token: string) =>
    auth("reset-password", { newPassword, token }),
  sendVerification: (email: string) =>
    auth("send-verification-email", {
      email,
      callbackURL: verificationCallbackURL,
    }),
  signOut: () => auth("sign-out", {}),
  createWorkspace: (name: string) =>
    api<unknown>("/api/workspaces", { method: "POST", body: { name } }),
  /** Current user plus all sessions, with the active session flagged. */
  sessionOverview: async (): Promise<AuthSessionOverview> => {
    const current = (await authRequest("get-session", "GET")) as {
      user?: AuthUser;
      session?: { token?: string; id?: string };
    } | null;
    const rows = (await authRequest("list-sessions", "GET")) as Array<
      AuthSessionRecord & { token?: string }
    >;
    const currentToken = current?.session?.token;
    const sessions = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      ...(typeof row.createdAt === "string" ? { createdAt: row.createdAt } : {}),
      ...(typeof row.expiresAt === "string"
        ? { expiresAt: row.expiresAt }
        : {}),
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      current: currentToken ? row.token === currentToken : false,
    }));
    return { user: current?.user ?? {}, sessions };
  },
  changePassword: (
    currentPassword: string,
    newPassword: string,
    revokeOtherSessions: boolean,
  ) =>
    auth("change-password", {
      currentPassword,
      newPassword,
      revokeOtherSessions,
    }),
  updateName: (name: string) => auth("update-user", { name }),
  revokeSession: (id: string) => auth("revoke-session", { id }),
  revokeOtherSessions: () => auth("revoke-other-sessions", {}),
};
