import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createConnection } from "node:net";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createDatabase, memberships } from "@hypergendoc/db";
import { fromNodeHeaders } from "better-auth/node";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import nodemailer from "nodemailer";
import { z, ZodError } from "zod";
import { createAuth } from "../modules/auth/better-auth.js";
import type { HumanActor } from "../modules/auth/actors.js";
import {
  createCompanyLogoRoutes,
  createCompanyLogoService,
  createCompanyRepository,
  createCompanyRoutes,
  createLogoOwnershipRepository,
  createCompanyService,
} from "../modules/companies/index.js";
import {
  createCredentialRepository,
  createCredentialRoutes,
  createCredentialService,
} from "../modules/credentials/index.js";
import {
  createDocumentRenderer,
  createDocumentRepository,
  createDocumentService,
  createLatexDocumentSourceBuilder,
  registerDocumentRoutes,
} from "../modules/documents/index.js";
import {
  createAuditEventRepository,
  createMembershipRepository,
} from "../modules/memberships/repository.js";
import { createMembershipRoutes } from "../modules/memberships/routes.js";
import {
  AuthorizationError,
  createInitialWorkspace,
} from "../modules/memberships/service.js";
import {
  createStyleRepository,
  createStyleRoutes,
  createStyleService,
} from "../modules/styles/index.js";
import {
  createWorkspaceReadRepository,
  createWorkspaceRepository,
} from "../modules/memberships/repository.js";
import {
  createWorkspaceReadRoutes,
  createWorkspaceReadService,
} from "../modules/workspaces/index.js";
import { createMcpPlugin, type DomainServices } from "../mcp/index.js";
import { createAuditWriter } from "../platform/audit.js";
import type { ActorContext } from "../platform/context.js";
import {
  loadServerEnvironment,
  type ServerEnvironment,
} from "../platform/env.js";
import { AppError, toSafeError } from "../platform/errors.js";
import {
  createHealthChecker,
  registerHealthRoutes,
} from "../platform/health.js";
import {
  createPrivateObjectStore,
  createAwsS3ObjectClient,
} from "../platform/object-store.js";
import { createInMemoryRateLimiter } from "../platform/rate-limit.js";
import { registerMcpArtifactRoute } from "./mcp-artifact-route.js";

export interface Application extends FastifyInstance {
  closeDependencies(): Promise<void>;
}

const page = <T>(items: readonly T[], cursor?: string, limit = 50) => {
  const start = cursor
    ? Math.max(
        0,
        items.findIndex((item) => (item as { id: string }).id === cursor) + 1,
      )
    : 0;
  const selected = items.slice(start, start + limit);
  const last = selected.at(-1) as { id: string } | undefined;
  return {
    items: selected,
    ...(last && start + limit < items.length ? { nextCursor: last.id } : {}),
  };
};

function actorContext(actor: HumanActor): ActorContext {
  return { type: "human", ...actor };
}

function checkUnixSocket(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("renderer socket check timed out"));
    }, 1_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}

/** Builds the production composition root; tests may call this without listening. */
export async function createApplication(
  environment: ServerEnvironment = loadServerEnvironment(),
): Promise<Application> {
  const { db, pool } = createDatabase({
    connectionString: environment.databaseUrl,
  });
  const app = Fastify({
    logger: {
      level: environment.nodeEnv === "production" ? "info" : "warn",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-api-key",
        "res.headers.set-cookie",
      ],
    },
  }) as unknown as Application;
  const s3 = new S3Client({
    region: environment.s3.region,
    ...(environment.s3.endpoint
      ? { endpoint: environment.s3.endpoint, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: environment.s3.accessKeyId,
      secretAccessKey: environment.s3.secretAccessKey,
    },
  });
  const objects = createPrivateObjectStore(
    createAwsS3ObjectClient(s3),
    environment.s3.bucket,
  );
  const audit = createAuditWriter(createAuditEventRepository(db));
  const companies = createCompanyService({
    repository: createCompanyRepository(db),
    audit,
  });
  const renderer = createDocumentRenderer({
    socketPath: environment.rendererSocket,
  });
  const styles = createStyleService({
    repository: createStyleRepository(db),
    audit,
    renderer: {
      async renderPreview(input) {
        const result = await renderer.render({
          body: "Preview",
          style: input.definition,
        });
        if (!result.ok || !result.pdfHash)
          throw new AppError(
            result.error ?? "render_failed",
            result.error === "dependency_unavailable" ? 503 : 422,
          );
        if (
          !result.pdf ||
          result.pdf.byteLength > environment.limits.renderedArtifactBytes
        )
          throw new AppError("render_failed", 422);
        // This ephemeral data URL is not persisted and is safe for a sandboxed,
        // read-only dashboard iframe. The renderer accepts structured styles only.
        return {
          url: `data:application/pdf;base64,${Buffer.from(result.pdf).toString("base64")}`,
        };
      },
    },
  });
  const documents = createDocumentService({
    repository: createDocumentRepository(db),
    renderer,
    sourceBuilder: createLatexDocumentSourceBuilder(),
    objects,
    audit,
  });
  const smtp = environment.smtp
    ? nodemailer.createTransport({
        host: environment.smtp.host,
        port: environment.smtp.port,
        secure: environment.smtp.port === 465,
        auth: { user: environment.smtp.user, pass: environment.smtp.password },
      })
    : undefined;
  const mail = {
    async sendVerificationEmail(input: {
      email: string;
      name: string;
      url: string;
    }) {
      if (smtp)
        await smtp.sendMail({
          to: input.email,
          from: environment.mailFrom ?? "HyperGenDoc <noreply@localhost>",
          subject: "Verify your email",
          text: `Verify your email: ${input.url}`,
        });
    },
    async sendPasswordResetEmail(input: {
      email: string;
      name: string;
      url: string;
    }) {
      if (smtp)
        await smtp.sendMail({
          to: input.email,
          from: environment.mailFrom ?? "HyperGenDoc <noreply@localhost>",
          subject: "Reset your password",
          text: `Reset your password: ${input.url}`,
        });
    },
  };
  const auth = createAuth({
    database: db,
    mail,
    baseUrl: environment.appOrigin,
    secret: environment.betterAuthSecret,
    production: environment.nodeEnv === "production",
    reportMailError: () => {
      // Do not serialize SMTP errors: they may contain addresses or verification URLs.
      app.log.error({ event: "mail.delivery_failed" }, "Mail delivery failed");
    },
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: environment.appOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(multipart, {
    limits: { fileSize: environment.limits.logoBytes, files: 1 },
  });
  app.addHook("onRequest", (request) => {
    if (
      request.url.startsWith("/api/") &&
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      request.method !== "OPTIONS" &&
      !request.url.startsWith("/api/auth/") &&
      request.headers.origin !== environment.appOrigin
    )
      throw new AppError("forbidden", 403);
    return Promise.resolve();
  });
  app.setErrorHandler((error, request, reply) => {
    const mapped =
      error instanceof AuthorizationError
        ? new AppError(
            error.code,
            error.code === "forbidden"
              ? 403
              : error.code === "conflict"
                ? 409
                : 404,
          )
        : error instanceof ZodError
          ? new AppError("validation_failed", 400)
          : (error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE"
            ? new AppError("validation_failed", 413)
            : error;
    const safe = toSafeError(mapped, request.id);
    if (safe.statusCode >= 500)
      request.log.error(
        { requestId: request.id, code: safe.body.error.code },
        "Request failed",
      );
    void reply.status(safe.statusCode).send(safe.body);
  });

  const authenticate = async (request: {
    id: string;
    headers?: FastifyRequest["headers"];
  }): Promise<HumanActor> => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers ?? {}),
    });
    if (!session) throw new AppError("unauthenticated", 401);
    const userId = session.user.id;
    const userMemberships = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(2);
    if (userMemberships.length !== 1) {
      // Never guess an agency from membership order. Legacy ambiguous accounts
      // must wait for an explicit workspace-selection feature.
      throw new AppError(
        userMemberships.length ? "conflict" : "forbidden",
        userMemberships.length ? 409 : 403,
      );
    }
    const membership = userMemberships[0]!;
    return {
      userId,
      workspaceId: membership.workspaceId,
      membershipId: membership.id,
      role: membership.role,
      requestId: request.id,
    };
  };
  const actorFor = (request: FastifyRequest) =>
    (request as FastifyRequest & { actor?: ActorContext }).actor;
  app.addHook("preHandler", async (request) => {
    if (
      !request.url.startsWith("/api/") ||
      request.url.startsWith("/api/auth/") ||
      request.url === "/api/workspaces"
    )
      return;
    (request as FastifyRequest & { actor?: ActorContext }).actor = actorContext(
      await authenticate(request),
    );
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const response = await auth.handler(
        new Request(new URL(request.url, environment.appOrigin), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body === undefined
            ? {}
            : { body: JSON.stringify(request.body) }),
        }),
      );
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      return reply
        .status(response.status)
        .send(response.body ? await response.text() : undefined);
    },
  });

  app.post("/api/workspaces", async (request, reply) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new AppError("unauthenticated", 401);
    const input = z
      .object({ name: z.string().trim().min(1).max(120) })
      .strict()
      .parse(request.body);
    const workspace = await createInitialWorkspace(
      { workspaces: createWorkspaceRepository(db) },
      {
        userId: session.user.id,
        verified: session.user.emailVerified,
        name: input.name,
      },
    );
    return reply.code(201).send(workspace);
  });
  await app.register(
    createMembershipRoutes({
      authenticate,
      memberships: createMembershipRepository(db),
    }),
  );
  await app.register(createCompanyRoutes({ authenticate, service: companies }));
  await app.register(
    createCompanyLogoRoutes({
      authenticate,
      service: createCompanyLogoService({
        companies,
        store: objects,
        ownership: createLogoOwnershipRepository(db),
        audit,
      }),
    }),
  );
  await app.register(createStyleRoutes({ authenticate, service: styles }));
  const credentials = createCredentialService({
    repository: createCredentialRepository(db),
    audit,
    pepper: environment.credentialPepper,
  });
  await app.register(
    createCredentialRoutes({ authenticate, service: credentials }),
  );
  await app.register(
    createWorkspaceReadRoutes({
      authenticate,
      service: createWorkspaceReadService(createWorkspaceReadRepository(db)),
    }),
  );
  registerDocumentRoutes(app, { service: documents, actorFor });
  registerMcpArtifactRoute(app, { credentials, documents });

  const services: DomainServices = {
    listCompanies: async (actor, input) =>
      page(await companies.list(actor), input.cursor, input.limit),
    listStyles: async (actor, input) =>
      page(
        await styles.list(actor, input.companyId),
        input.cursor,
        input.limit,
      ),
    listDocuments: async (actor, input) =>
      page(
        await documents.list({ type: "agent", ...actor }, input.companyId),
        input.cursor,
        input.limit,
      ),
    getDocument: (actor, input) =>
      documents.get({ type: "agent", ...actor }, input.documentId),
    async getDocumentVersion(actor, input) {
      const context = { type: "agent" as const, ...actor };
      const documentVersion = await documents.getVersion(
        context,
        input.documentId,
        input.version,
      );
      return {
        documentVersion,
        downloadUrl: new URL(
          `/mcp-artifacts/${input.documentId}/${input.version}/pdf`,
          environment.appOrigin,
        ).toString(),
      };
    },
    async createDocument(actor, input) {
      return (await documents.create({ type: "agent", ...actor }, input))
        .document;
    },
    createDocumentVersion: (actor, input) =>
      documents.createVersion(
        { type: "agent", ...actor },
        input.documentId,
        input.styleVersionId
          ? { body: input.body, styleVersionId: input.styleVersionId }
          : { body: input.body },
      ),
  };
  await app.register(
    createMcpPlugin({
      services,
      credentialVerifier: {
        async verify(token, requestId) {
          try {
            return await credentials.verify(token, requestId);
          } catch {
            return null;
          }
        },
      },
      rateLimiter: createInMemoryRateLimiter(),
    }),
  );

  app.get("/health/live", () => ({ status: "ok" }));
  registerHealthRoutes(
    app,
    createHealthChecker([
      {
        name: "postgres",
        check: async () => {
          await db.execute("select 1");
        },
      },
      {
        name: "objectStore",
        check: async () => {
          await s3.send(
            new HeadBucketCommand({ Bucket: environment.s3.bucket }),
          );
        },
      },
      {
        name: "rendererSocket",
        check: () => checkUnixSocket(environment.rendererSocket),
      },
    ]),
  );
  app.closeDependencies = async () => {
    await app.close();
    await pool.end();
    s3.destroy();
  };
  return app;
}
