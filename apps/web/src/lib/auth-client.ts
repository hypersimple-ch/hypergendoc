"use client";

import { api, ApiError } from "./api-client";

type AuthReply = {
  redirect?: boolean;
  message?: string;
  error?: { message?: string };
};

const verificationCallbackURL = "/login?verified=true";

async function auth(path: string, body: Record<string, string>) {
  try {
    const result = await fetch(`/api/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
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
  acceptInvitation: (invitationId: string) =>
    auth("organization/accept-invitation", { invitationId }),
  signOut: () => auth("sign-out", {}),
  createWorkspace: (name: string) =>
    api<unknown>("/api/workspaces", { method: "POST", body: { name } }),
};
