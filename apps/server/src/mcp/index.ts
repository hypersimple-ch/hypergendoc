import {
  type Company,
  type Document,
  type DocumentCommit,
  type DocumentCurrentSource,
  type DocumentDetail,
  type Style,
  CreateDocumentToolInputSchema,
  GetDocumentToolInputSchema,
  ListCompaniesToolInputSchema,
  ListDocumentCommitsToolInputSchema,
  ListDocumentsToolInputSchema,
  ListStylesToolInputSchema,
  ReadDocumentCommitToolInputSchema,
  RevertDocumentToolInputSchema,
  UpdateDocumentToolInputSchema,
  type McpAction,
} from "@hypergendoc/contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { AgentActor } from "../modules/auth/actors.js";
import { AppError, toSafeError } from "../platform/errors.js";
import type { RateLimiter } from "../platform/rate-limit.js";

const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;

type Page<T> = Readonly<{ items: readonly T[]; nextCursor?: string }>;

/** The MCP adapter's deliberately small view of the authoritative domain. */
export interface DomainServices {
  listCompanies(
    actor: AgentActor,
    input: z.infer<typeof ListCompaniesToolInputSchema>,
  ): Promise<Page<Company>>;
  listStyles(
    actor: AgentActor,
    input: z.infer<typeof ListStylesToolInputSchema>,
  ): Promise<Page<Style>>;
  listDocuments(
    actor: AgentActor,
    input: z.infer<typeof ListDocumentsToolInputSchema>,
  ): Promise<Page<Document>>;
  getDocument(
    actor: AgentActor,
    input: z.infer<typeof GetDocumentToolInputSchema>,
  ): Promise<DocumentDetail>;
  createDocument(
    actor: AgentActor,
    input: z.infer<typeof CreateDocumentToolInputSchema>,
  ): Promise<{ document: Document; current: DocumentCurrentSource }>;
  updateDocument(
    actor: AgentActor,
    input: z.infer<typeof UpdateDocumentToolInputSchema>,
  ): Promise<DocumentCurrentSource>;
  listDocumentCommits(
    actor: AgentActor,
    input: z.infer<typeof ListDocumentCommitsToolInputSchema>,
  ): Promise<Page<DocumentCommit>>;
  readDocumentCommit(
    actor: AgentActor,
    input: z.infer<typeof ReadDocumentCommitToolInputSchema>,
  ): Promise<DocumentCurrentSource>;
  revertDocument(
    actor: AgentActor,
    input: z.infer<typeof RevertDocumentToolInputSchema>,
  ): Promise<DocumentCurrentSource>;
}

export interface McpCredentialVerifier {
  verify(token: string, requestId: string): Promise<AgentActor | null>;
}

export interface McpPluginOptions {
  readonly services: DomainServices;
  readonly credentialVerifier: McpCredentialVerifier;
  readonly rateLimiter: RateLimiter;
  readonly rateLimit?: number;
  readonly rateWindowMs?: number;
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

function assertAction(actor: AgentActor, action: McpAction): void {
  if (!actor.actions.includes(action)) throw new AppError("forbidden", 403);
}

const concise = (value: unknown): string => JSON.stringify(value);

function toolError(error: unknown, requestId: string) {
  const safe = toSafeError(error, requestId).body.error;
  return {
    content: [
      {
        type: "text" as const,
        text: `${safe.code}: ${safe.message} (request ${safe.requestId})`,
      },
    ],
    isError: true,
  };
}

function createServer(actor: AgentActor, services: DomainServices): McpServer {
  const server = new McpServer({ name: "hypergendoc", version: "0.0.0" });
  const result = <T extends object>(structuredContent: T) => ({
    content: [{ type: "text" as const, text: concise(structuredContent) }],
    structuredContent: structuredContent as Record<string, unknown>,
  });
  const execute = async (
    action: McpAction,
    operation: () => Promise<object>,
  ) => {
    try {
      assertAction(actor, action);
      return result(await operation());
    } catch (error) {
      return toolError(error, actor.requestId);
    }
  };

  server.registerTool(
    "list_companies",
    {
      description: "List authorized companies.",
      inputSchema: ListCompaniesToolInputSchema.shape,
    },
    (input) =>
      execute("companies:read", () => services.listCompanies(actor, input)),
  );
  server.registerTool(
    "list_styles",
    {
      description: "List active styles for an authorized company.",
      inputSchema: ListStylesToolInputSchema.shape,
    },
    (input) => execute("styles:read", () => services.listStyles(actor, input)),
  );
  server.registerTool(
    "list_documents",
    {
      description: "List documents for an authorized company.",
      inputSchema: ListDocumentsToolInputSchema.shape,
    },
    (input) =>
      execute("documents:read", () => services.listDocuments(actor, input)),
  );
  server.registerTool(
    "get_document",
    {
      description: "Get current source and commit history for a document.",
      inputSchema: GetDocumentToolInputSchema.shape,
    },
    (input) =>
      execute("documents:read", () => services.getDocument(actor, input)),
  );
  server.registerTool(
    "create_document",
    {
      description: "Create a document and its initial Git commit.",
      inputSchema: CreateDocumentToolInputSchema.shape,
    },
    (input) =>
      execute("documents:write", () => services.createDocument(actor, input)),
  );
  server.registerTool(
    "update_document",
    {
      description: "Replace document source and create a Git commit.",
      inputSchema: UpdateDocumentToolInputSchema.shape,
    },
    (input) =>
      execute("documents:write", () => services.updateDocument(actor, input)),
  );
  server.registerTool(
    "list_document_commits",
    {
      description: "List Git commits for an authorized document.",
      inputSchema: ListDocumentCommitsToolInputSchema.shape,
    },
    (input) =>
      execute("documents:read", () =>
        services.listDocumentCommits(actor, input),
      ),
  );
  server.registerTool(
    "read_document_commit",
    {
      description: "Read source and pinned style metadata at a commit.",
      inputSchema: ReadDocumentCommitToolInputSchema.shape,
    },
    (input) =>
      execute("documents:read", () =>
        services.readDocumentCommit(actor, input),
      ),
  );
  server.registerTool(
    "revert_document",
    {
      description: "Restore an old state as a new Git commit.",
      inputSchema: RevertDocumentToolInputSchema.shape,
    },
    (input) =>
      execute("documents:write", () => services.revertDocument(actor, input)),
  );
  return server;
}

const unauthorized = (requestId: string) => ({
  error: {
    code: "unauthenticated" as const,
    message: "Authentication required",
    requestId,
  },
});

export function createMcpPlugin(options: McpPluginOptions): FastifyPluginAsync {
  return (app) => {
    const authenticate = async (
      request: FastifyRequest,
    ): Promise<AgentActor | null> => {
      const token = bearerToken(request);
      if (token === null) return null;
      try {
        return await options.credentialVerifier.verify(token, request.id);
      } catch {
        return null;
      }
    };
    const rateLimit = (actor: AgentActor) =>
      options.rateLimiter.consume({
        key: `mcp:${actor.credentialId}`,
        limit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
        windowMs: options.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS,
      });
    const rejectUnauthenticated = (
      request: FastifyRequest,
      reply: {
        header: (name: string, value: string) => unknown;
        code: (statusCode: number) => { send: (payload: unknown) => unknown };
      },
    ) => {
      reply.header("WWW-Authenticate", 'Bearer realm="mcp"');
      return reply.code(401).send(unauthorized(request.id));
    };
    const rejectRateLimited = async (
      actor: AgentActor,
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<boolean> => {
      const rate = await rateLimit(actor);
      if (rate.allowed) return false;
      reply.header(
        "Retry-After",
        String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
      );
      void reply
        .code(429)
        .send(toSafeError(new AppError("rate_limited", 429), request.id).body);
      return true;
    };

    app.route({
      method: "POST",
      url: "/mcp",
      bodyLimit: MAX_BODY_BYTES,
      handler: async (request, reply) => {
        const actor = await authenticate(request);
        if (actor === null) return rejectUnauthenticated(request, reply);
        if (await rejectRateLimited(actor, request, reply)) return;
        if (
          Buffer.byteLength(JSON.stringify(request.body ?? null), "utf8") >
          MAX_BODY_BYTES
        )
          return reply
            .code(413)
            .send(
              toSafeError(new AppError("validation_failed", 413), request.id)
                .body,
            );
        const server = createServer(actor, options.services);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        } as unknown as ConstructorParameters<
          typeof StreamableHTTPServerTransport
        >[0]);
        try {
          await server.connect(transport as never);
          reply.hijack();
          await transport.handleRequest(request.raw, reply.raw, request.body);
        } catch {
          if (!reply.raw.headersSent) {
            reply.raw.statusCode = 500;
            reply.raw.setHeader("content-type", "application/json");
            reply.raw.end(
              JSON.stringify(
                toSafeError(new AppError("internal_error", 500), request.id)
                  .body,
              ),
            );
          }
        } finally {
          await transport.close();
          await server.close();
        }
      },
    });

    for (const method of ["GET", "DELETE"] as const) {
      app.route({
        method,
        url: "/mcp",
        handler: async (request, reply) => {
          const actor = await authenticate(request);
          if (actor === null) return rejectUnauthenticated(request, reply);
          if (await rejectRateLimited(actor, request, reply)) return;
          return reply.code(405).send({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed." },
            id: null,
          });
        },
      });
    }
    return Promise.resolve();
  };
}
