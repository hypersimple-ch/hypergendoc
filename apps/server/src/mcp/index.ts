import {
  type Company,
  type CreateDocumentInput,
  type Document,
  type DocumentVersion,
  type Style,
  CreateDocumentToolInputSchema,
  CreateDocumentVersionToolInputSchema,
  GetDocumentToolInputSchema,
  GetDocumentVersionToolInputSchema,
  ListCompaniesToolInputSchema,
  ListDocumentsToolInputSchema,
  ListStylesToolInputSchema,
  type McpAction,
} from "@hypergendoc/contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
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
  ): Promise<Document>;
  getDocumentVersion(
    actor: AgentActor,
    input: z.infer<typeof GetDocumentVersionToolInputSchema>,
  ): Promise<
    Readonly<{ documentVersion: DocumentVersion; downloadUrl?: string }>
  >;
  createDocument(
    actor: AgentActor,
    input: CreateDocumentInput,
  ): Promise<Document>;
  createDocumentVersion(
    actor: AgentActor,
    input: z.infer<typeof CreateDocumentVersionToolInputSchema>,
  ): Promise<DocumentVersion>;
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

function concise(value: unknown): string {
  return JSON.stringify(value);
}

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
  server.registerTool(
    "list_companies",
    {
      description: "List authorized companies.",
      inputSchema: ListCompaniesToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "companies:read");
        return result(await services.listCompanies(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  server.registerTool(
    "list_styles",
    {
      description: "List active styles for an authorized company.",
      inputSchema: ListStylesToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "styles:read");
        return result(await services.listStyles(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  server.registerTool(
    "list_documents",
    {
      description: "List documents for an authorized company.",
      inputSchema: ListDocumentsToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "documents:read");
        return result(await services.listDocuments(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  server.registerTool(
    "get_document",
    {
      description: "Get an authorized document.",
      inputSchema: GetDocumentToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "documents:read");
        return result(await services.getDocument(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  server.registerTool(
    "get_document_version",
    {
      description: "Get an authorized document version and download reference.",
      inputSchema: GetDocumentVersionToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "documents:read");
        return result(await services.getDocumentVersion(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  server.registerTool(
    "create_document",
    {
      description: "Create and render a document using an active style.",
      inputSchema: CreateDocumentToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "documents:write");
        return result(await services.createDocument(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  server.registerTool(
    "create_document_version",
    {
      description: "Create and render an immutable document version.",
      inputSchema: CreateDocumentVersionToolInputSchema.shape,
    },
    async (input) => {
      try {
        assertAction(actor, "documents:write");
        return result(await services.createDocumentVersion(actor, input));
      } catch (error) {
        return toolError(error, actor.requestId);
      }
    },
  );
  return server;
}

function unauthorized(requestId: string) {
  return {
    error: {
      code: "unauthenticated" as const,
      message: "Authentication required",
      requestId,
    },
  };
}

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
        // Credential failures must remain indistinguishable to clients.
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

    app.route({
      method: "POST",
      url: "/mcp",
      bodyLimit: MAX_BODY_BYTES,
      handler: async (request, reply) => {
        const actor = await authenticate(request);
        if (actor === null) return rejectUnauthenticated(request, reply);
        const rate = await rateLimit(actor);
        if (!rate.allowed) {
          reply.header(
            "Retry-After",
            String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
          );
          return reply
            .code(429)
            .send(
              toSafeError(new AppError("rate_limited", 429), request.id).body,
            );
        }
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
        // The SDK's declaration is not exact-optional-property compatible, but
        // the v1 stateless transport API explicitly uses an undefined generator.
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
          const rate = await rateLimit(actor);
          if (!rate.allowed) {
            reply.header(
              "Retry-After",
              String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
            );
            return reply
              .code(429)
              .send(
                toSafeError(new AppError("rate_limited", 429), request.id).body,
              );
          }
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
