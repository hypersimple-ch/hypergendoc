import { hash, verify, type Options } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@hypergendoc/db";
import { betterAuthSchema } from "@hypergendoc/db";

export interface AuthMail {
  sendVerificationEmail(
    input: Readonly<{ email: string; name: string; url: string }>,
  ): Promise<void>;
  sendPasswordResetEmail(
    input: Readonly<{ email: string; name: string; url: string }>,
  ): Promise<void>;
}

const argon2id: Options = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};

export const authRateLimitRules = {
  "/sign-in/email": { window: 60, max: 10 },
  "/request-password-reset": { window: 60, max: 5 },
} as const;

export interface CreateAuthOptions {
  database: Database;
  mail: AuthMail;
  baseUrl: string;
  secret: string;
  /** Set by trusted deployment configuration; never infer this from a request. */
  production: boolean;
}

/**
 * The durable mail implementation receives a single-use Better Auth URL. It may
 * retain it only in the protected queue until delivery or dead-lettering and must
 * never log it. The adapter uses the `user`, `session`, `account`, and
 * `verification` mappings exported by @hypergendoc/db.
 */
export function createAuthMailCallbacks(mail: AuthMail) {
  return {
    sendResetPassword: ({
      user,
      url,
    }: Readonly<{
      user: { email: string; name: string };
      url: string;
    }>) =>
      mail.sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
      }),
    sendVerificationEmail: ({
      user,
      url,
    }: Readonly<{
      user: { email: string; name: string };
      url: string;
    }>) =>
      mail.sendVerificationEmail({
        email: user.email,
        name: user.name,
        url,
      }),
  };
}

export function createAuth(options: CreateAuthOptions) {
  const mailCallbacks = createAuthMailCallbacks(options.mail);
  return betterAuth({
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: betterAuthSchema,
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    trustedOrigins: [options.baseUrl],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hash(password, argon2id),
        verify: ({ hash: encoded, password }) =>
          verify(encoded, password, argon2id),
      },
      sendResetPassword: mailCallbacks.sendResetPassword,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: mailCallbacks.sendVerificationEmail,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      customRules: authRateLimitRules,
      storage: "memory",
    },
    advanced: { useSecureCookies: options.production },
  });
}
