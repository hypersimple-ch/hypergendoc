import { isAbsolute, resolve } from "node:path";
import { limits } from "@hypergendoc/config";

export interface ServerEnvironment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly appOrigin: string;
  readonly betterAuthSecret: string;
  readonly credentialPepper: string;
  readonly rendererSocket: string;
  readonly documentGitRoot: string;
  readonly databaseUrl: string;
  readonly s3: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  readonly smtp?: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  readonly mailFrom?: string;
  readonly limits: typeof limits;
}

type Values = Record<string, string | undefined>;

function required(values: Values, name: string): string {
  const value = values[name]?.trim();
  if (value === undefined || value === "")
    throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function port(value: string | undefined): number {
  const parsed = Number(value ?? "4000");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535)
    throw new Error("PORT must be an integer between 1 and 65535");
  return parsed;
}

function smtpPort(value: string | undefined): number {
  const parsed = Number(value?.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535)
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  return parsed;
}

/** Validates runtime configuration before any network client is created. */
export function loadServerEnvironment(
  values: Values = process.env,
): ServerEnvironment {
  const nodeEnv = values.NODE_ENV ?? "development";
  if (
    nodeEnv !== "development" &&
    nodeEnv !== "test" &&
    nodeEnv !== "production"
  )
    throw new Error("NODE_ENV must be development, test, or production");
  const endpoint = values.S3_ENDPOINT?.trim();
  let objectStoreUrl: URL | undefined;
  if (endpoint !== undefined && endpoint !== "") {
    try {
      objectStoreUrl = new URL(endpoint);
    } catch {
      throw new Error("S3_ENDPOINT must be a URL");
    }
    if (!["http:", "https:"].includes(objectStoreUrl.protocol))
      throw new Error("S3_ENDPOINT must use HTTP or HTTPS");
  }
  const smtpConfigured = [
    values.SMTP_HOST,
    values.SMTP_PORT,
    values.SMTP_USER,
    values.SMTP_PASSWORD,
  ].some((value) => value !== undefined && value !== "");
  const smtp = smtpConfigured
    ? {
        host: required(values, "SMTP_HOST"),
        port: smtpPort(values.SMTP_PORT),
        user: required(values, "SMTP_USER"),
        password: (() => {
          const value = values.SMTP_PASSWORD;
          if (value === undefined || value === "")
            throw new Error(
              "Missing required environment variable: SMTP_PASSWORD",
            );
          return value;
        })(),
      }
    : undefined;
  const mailFrom = values.MAIL_FROM?.trim();
  const documentGitRoot = required(values, "DOCUMENT_GIT_ROOT");
  if (!isAbsolute(documentGitRoot))
    throw new Error("DOCUMENT_GIT_ROOT must be an absolute path");
  if (
    nodeEnv === "production" &&
    objectStoreUrl?.protocol === "http:" &&
    objectStoreUrl.hostname !== "object-store"
  )
    throw new Error(
      "Production S3_ENDPOINT must use HTTPS unless it is the private Compose object-store service",
    );
  if (nodeEnv === "production" && (!smtp || !mailFrom))
    throw new Error(
      "Production requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM",
    );
  if (mailFrom?.includes("\n") || mailFrom?.includes("\r"))
    throw new Error("MAIL_FROM must not contain line breaks");
  return {
    nodeEnv,
    host: values.HOST?.trim() || "0.0.0.0",
    port: port(values.PORT),
    appOrigin: required(values, "APP_ORIGIN"),
    betterAuthSecret: required(values, "BETTER_AUTH_SECRET"),
    credentialPepper: required(values, "CREDENTIAL_PEPPER"),
    rendererSocket:
      values.RENDERER_SOCKET?.trim() || "/run/hypergendoc/renderer.sock",
    documentGitRoot: resolve(documentGitRoot),
    databaseUrl: required(values, "DATABASE_URL"),
    s3: {
      ...(endpoint === undefined || endpoint === "" ? {} : { endpoint }),
      region: required(values, "S3_REGION"),
      bucket: required(values, "S3_BUCKET"),
      accessKeyId: required(
        { S3_ACCESS_KEY_ID: values.S3_ACCESS_KEY_ID ?? values.S3_ACCESS_KEY },
        "S3_ACCESS_KEY_ID",
      ),
      secretAccessKey: required(
        {
          S3_SECRET_ACCESS_KEY:
            values.S3_SECRET_ACCESS_KEY ?? values.S3_SECRET_KEY,
        },
        "S3_SECRET_ACCESS_KEY",
      ),
    },
    ...(smtp === undefined ? {} : { smtp }),
    ...(mailFrom === undefined || mailFrom === "" ? {} : { mailFrom }),
    limits,
  };
}
