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

export interface CreateAuthOptions {
  database: Database;
  mail: AuthMail;
  /** Receives mail-dispatch failures only; callers must not log email URLs. */
  reportMailError?: (error: unknown) => void;
  baseUrl: string;
  secret: string;
  /** Set by trusted deployment configuration; never infer this from a request. */
  production: boolean;
}

/**
 * The mail implementation receives a single-use Better Auth URL. It must not log
 * it or retain it. The adapter uses the `user`, `session`, `account`, and
 * `verification` mappings exported by @hypergendoc/db.
 */
export function createAuth(options: CreateAuthOptions) {
  const dispatchMail = (send: () => Promise<void>) => {
    void send().catch((error: unknown) => {
      try {
        options.reportMailError?.(error);
      } catch {
        // Reporting must never turn a background mail failure into an unhandled rejection.
      }
    });
  };

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
      sendResetPassword: ({ user, url }) => {
        dispatchMail(() =>
          options.mail.sendPasswordResetEmail({
            email: user.email,
            name: user.name,
            url,
          }),
        );
        return Promise.resolve();
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) => {
        dispatchMail(() =>
          options.mail.sendVerificationEmail({
            email: user.email,
            name: user.name,
            url,
          }),
        );
        return Promise.resolve();
      },
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
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/forget-password": { window: 60, max: 5 },
      },
      storage: "memory",
    },
    advanced: { useSecureCookies: options.production },
  });
}
