import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
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
import { createMailDispatcher } from "../modules/auth/mail-dispatcher.js";
import { createMailJobRepository } from "../modules/auth/mail-queue.js";
import { normalizePasswordResetResponse } from "../modules/auth/reset-response.js";
import type { HumanActor } from "../modules/auth/actors.js";
import {
  preauthenticatedActor,
  registerHumanActorPreHandler,
} from "../modules/auth/request-actor.js";
import {
  createCompanyAssetRepository,
  createCompanyAssetRoutes,
  createCompanyAssetService,
  createCompanyLogoRoutes,
  createCompanyRepository,
  createCompanyRoutes,
  createCompanyService,
  createCompanyStyleAssetResolver,
  createCompanyTemplateAssetResolver,
  createLogoOwnershipRepository,
} from "../modules/companies/index.js";
import {
  createCredentialRepository,
  createCredentialRoutes,
  createCredentialService,
} from "../modules/credentials/index.js";
import {
  CompanyDocumentGitStore,
  createDocumentRenderer,
  createDocumentRepository,
  createDocumentService,
  createHtmlDocumentSourceBuilder,
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
import { STYLE_PREVIEW_DOCUMENT } from "../modules/styles/preview-document.js";
import {
  createTemplateRepository,
  createTemplateRoutes,
  createTemplateService,
} from "../modules/templates/index.js";
import { DocumentInputError, templateImageIds } from "@hypergendoc/document";

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
import {
  AppError,
  normalizeTransportError,
  toSafeError,
} from "../platform/errors.js";
import {
  createHealthChecker,
  registerHealthRoutes,
} from "../platform/health.js";
import {
  createPrivateObjectStore,
  createAwsS3ObjectClient,
} from "../platform/object-store.js";
import { createInMemoryRateLimiter } from "../platform/rate-limit.js";
import { checkUnixSocket } from "./dependency-health.js";
import { shouldRejectMutationOrigin } from "./origin-policy.js";
import { page } from "./page.js";

export interface Application extends FastifyInstance {
  closeDependencies(): Promise<void>;
}

function actorContext(actor: HumanActor): ActorContext {
  return { type: "human", ...actor };
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
      level: environment.logLevel,
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
  const companyAssetRepository = createCompanyAssetRepository(db);
  const companyAssets = createCompanyAssetService({
    companies,
    repository: companyAssetRepository,
    store: objects,
    logoOwnership: createLogoOwnershipRepository(db),
    audit,
  });
  const styleAssetResolver = createCompanyStyleAssetResolver(
    companyAssetRepository,
    objects,
  );
  const templateAssetResolver = createCompanyTemplateAssetResolver(
    companyAssetRepository,
    objects,
  );
  const renderer = createDocumentRenderer({
    socketPath: environment.rendererSocket,
    // The worker owns the render deadline; the client allows bounded IPC cleanup.
    timeoutMs: environment.renderTimeoutMs + 5_000,
  });
  const styles = createStyleService({
    repository: createStyleRepository(db),
    audit,
    renderer: {
      async renderPreview(input) {
        const assets = await styleAssetResolver.resolve(
          input.workspaceId,
          input.companyId,
          input.definition,
        );
        const result = await renderer.render({
          ...STYLE_PREVIEW_DOCUMENT,
          style: input.definition,
          assets,
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
        // This ephemeral response is decoded to a Blob by the dashboard and is
        // never persisted. The renderer accepts structured styles only.
        return {
          url: `data:application/pdf;base64,${Buffer.from(result.pdf).toString("base64")}`,
        };
      },
    },
  });
  const documentRepository = createDocumentRepository(db);
  const templateRepository = createTemplateRepository(db);
  const templates = createTemplateService({
    repository: templateRepository,
    audit,
    renderer: {
      async renderPreview(input) {
        const style = await documentRepository.findStyleVersion(
          input.workspaceId,
          input.companyId,
          input.definition.styleVersionId,
        );
        if (!style) throw new AppError("not_found", 404);
        const [assets, templateAssets] = await Promise.all([
          styleAssetResolver.resolve(
            input.workspaceId,
            input.companyId,
            style.definition,
          ),
          templateAssetResolver.resolve(
            input.workspaceId,
            input.companyId,
            templateImageIds(input.definition, input.data),
          ),
        ]);
        const result = await renderer.render({
          format: "template",
          template: input.definition,
          data: input.data,
          style: style.definition,
          assets,
          templateAssets,
        });
        if (!result.ok || !result.pdf)
          throw new AppError(
            result.error ?? "render_failed",
            result.error === "dependency_unavailable" ? 503 : 422,
          );
        return {
          url: `data:application/pdf;base64,${Buffer.from(result.pdf).toString("base64")}`,
        };
      },
    },
  });
  const documents = createDocumentService({
    repository: documentRepository,
    git: new CompanyDocumentGitStore({ rootDir: environment.documentGitRoot }),
    renderer,
    sourceBuilder: createHtmlDocumentSourceBuilder(),
    styleAssetResolver,
    templateAssetResolver,
    audit,
  });
  const smtp = environment.smtp
    ? nodemailer.createTransport({
        host: environment.smtp.host,
        port: environment.smtp.port,
        secure: environment.smtp.port === 465,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        auth: { user: environment.smtp.user, pass: environment.smtp.password },
      })
    : undefined;
  const mailRepository = createMailJobRepository(db);
  const mail = {
    sendVerificationEmail(input: { email: string; name: string; url: string }) {
      return mailRepository.enqueue({
        kind: "verification",
        recipient: input.email,
        recipientName: input.name,
        url: input.url,
      });
    },
    sendPasswordResetEmail(input: {
      email: string;
      name: string;
      url: string;
    }) {
      return mailRepository.enqueue({
        kind: "password_reset",
        recipient: input.email,
        recipientName: input.name,
        url: input.url,
      });
    },
  };
  const mailDispatcher = smtp
    ? createMailDispatcher({
        repository: mailRepository,
        logger: app.log,
        transport: {
          async deliver(job) {
            await smtp.sendMail({
              to: job.recipient,
              from: environment.mailFrom ?? "HyperGenDoc <noreply@localhost>",
              subject:
                job.kind === "verification"
                  ? "Verify your email"
                  : "Reset your password",
              text:
                job.kind === "verification"
                  ? `Verify your email: ${job.url}`
                  : `Reset your password: ${job.url}`,
            });
          },
        },
      })
    : undefined;
  if (mailDispatcher) await mailDispatcher.start();
  else
    app.log.warn(
      { event: "mail.dispatcher_unavailable" },
      "SMTP is not configured; accepted mail remains queued",
    );
  const auth = createAuth({
    database: db,
    mail,
    baseUrl: environment.appOrigin,
    secret: environment.betterAuthSecret,
    production: environment.nodeEnv === "production",
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
      shouldRejectMutationOrigin({
        url: request.url,
        method: request.method,
        origin: request.headers.origin,
        appOrigin: environment.appOrigin,
      })
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
        : error instanceof ZodError || error instanceof DocumentInputError
          ? new AppError("validation_failed", 400)
          : normalizeTransportError(error);
    const safe = toSafeError(mapped, request.id);
    if (safe.statusCode >= 500)
      request.log.error(
        { requestId: request.id, code: safe.body.error.code },
        "Request failed",
      );
    void reply.status(safe.statusCode).send(safe.body);
  });

  const resolveHumanActor = async (request: {
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
    actorContext(preauthenticatedActor(request));
  registerHumanActorPreHandler(app, resolveHumanActor);

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const authResponse = await auth.handler(
        new Request(new URL(request.url, environment.appOrigin), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body === undefined
            ? {}
            : { body: JSON.stringify(request.body) }),
        }),
      );
      const normalized = normalizePasswordResetResponse(
        request.url,
        authResponse,
      );
      if (normalized.suppressedFailure)
        request.log.error(
          { event: "mail.enqueue_failed", kind: "password_reset" },
          "Password reset could not be accepted",
        );
      const response = normalized.response;
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
      actorFor: preauthenticatedActor,
      memberships: createMembershipRepository(db),
      audit,
    }),
  );
  await app.register(
    createCompanyRoutes({
      actorFor: preauthenticatedActor,
      service: companies,
    }),
  );
  await app.register(
    createCompanyLogoRoutes({
      actorFor: preauthenticatedActor,
      service: {
        upload: (actor, companyId, bytes) =>
          companyAssets.uploadLogo(actor, companyId, bytes),
      },
    }),
  );
  await app.register(
    createCompanyAssetRoutes({
      actorFor: preauthenticatedActor,
      service: companyAssets,
    }),
  );
  await app.register(
    createStyleRoutes({ actorFor: preauthenticatedActor, service: styles }),
  );
  await app.register(
    createTemplateRoutes({
      actorFor: preauthenticatedActor,
      service: templates,
    }),
  );
  const credentials = createCredentialService({
    repository: createCredentialRepository(db),
    audit,
    pepper: environment.credentialPepper,
  });
  await app.register(
    createCredentialRoutes({
      actorFor: preauthenticatedActor,
      service: credentials,
    }),
  );
  await app.register(
    createWorkspaceReadRoutes({
      actorFor: preauthenticatedActor,
      service: createWorkspaceReadService(createWorkspaceReadRepository(db)),
    }),
  );
  registerDocumentRoutes(app, { service: documents, actorFor });

  const services: DomainServices = {
    listCompanies: async (actor, input) =>
      page(await companies.list(actor), input.cursor, input.limit),
    listStyles: async (actor, input) =>
      page(
        await styles.list(actor, input.companyId),
        input.cursor,
        input.limit,
      ),
    listTemplates: async (actor, input) =>
      page(
        await templates.list(actor, input.companyId),
        input.cursor,
        input.limit,
      ),
    getTemplate: async (actor, input) => {
      const template = await templates.get(actor, input.templateId);
      const versions = await templates.history(actor, input.templateId);
      const version = versions.find(
        (candidate) =>
          candidate.id === (input.versionId ?? template.activeVersionId),
      );
      if (!version) throw new AuthorizationError("not_found");
      return { template, version };
    },
    listDocuments: async (actor, input) =>
      page(
        await documents.list({ type: "agent", ...actor }, input.companyId),
        input.cursor,
        input.limit,
      ),
    getDocument: (actor, input) =>
      documents.detail({ type: "agent", ...actor }, input.documentId),
    createDocument: (actor, input) =>
      documents.create({ type: "agent", ...actor }, input),
    updateDocument: (actor, input) =>
      documents.update(
        { type: "agent", ...actor },
        input.documentId,
        input.styleVersionId
          ? {
              format: input.format,
              body: input.body,
              styleVersionId: input.styleVersionId,
            }
          : { format: input.format, body: input.body },
      ),
    createTemplateDocument: (actor, input) =>
      documents.createFromTemplate({ type: "agent", ...actor }, input),
    updateTemplateDocument: (actor, input) =>
      documents.updateFromTemplate(
        { type: "agent", ...actor },
        input.documentId,
        input.templateVersionId
          ? { data: input.data, templateVersionId: input.templateVersionId }
          : { data: input.data },
      ),
    listDocumentCommits: async (actor, input) =>
      page(
        await documents.history({ type: "agent", ...actor }, input.documentId),
        input.cursor,
        input.limit,
        (commit) => commit.commitSha,
      ),
    readDocumentCommit: (actor, input) =>
      documents.readCommit(
        { type: "agent", ...actor },
        input.documentId,
        input.commitSha,
      ),
    revertDocument: (actor, input) =>
      documents.revert({ type: "agent", ...actor }, input.documentId, {
        commitSha: input.commitSha,
      }),
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
    await mailDispatcher?.stop();
    await app.close();
    await pool.end();
    s3.destroy();
  };
  return app;
}
