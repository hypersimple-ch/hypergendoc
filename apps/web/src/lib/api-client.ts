import type { ErrorEnvelope } from "@hypergendoc/contracts";

type ContractErrorCode = ErrorEnvelope["error"]["code"];
const errorCodes = new Set<ContractErrorCode>([
  "unauthenticated",
  "forbidden",
  "not_found",
  "gone",
  "conflict",
  "validation_failed",
  "rate_limited",
  "render_rejected",
  "render_failed",
  "dependency_unavailable",
  "internal_error",
]);

function parseError(
  payload: unknown,
): { code: ContractErrorCode; message: string; requestId: string } | undefined {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("error" in payload) ||
    !payload.error ||
    typeof payload.error !== "object"
  )
    return undefined;
  const error = payload.error as Record<string, unknown>;
  if (
    typeof error.code !== "string" ||
    !errorCodes.has(error.code as ContractErrorCode) ||
    typeof error.message !== "string" ||
    typeof error.requestId !== "string"
  )
    return undefined;
  return {
    code: error.code as ContractErrorCode,
    message: error.message,
    requestId: error.requestId,
  };
}

export class ApiError extends Error {
  constructor(
    public readonly code: ContractErrorCode | "network_error" | "timeout",
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
};

/**
 * Small request-level cache for GETs: identical in-flight requests share one
 * promise and settled responses are reused briefly, so a single page mount
 * does not refetch the same resource several times. Any non-GET request
 * clears the cache so mutations are never served stale data.
 */
const GET_CACHE_TTL_MS = 10_000;
const getCache = new Map<
  string,
  { promise: Promise<unknown>; expiresAt: number }
>();

export function clearApiCache() {
  getCache.clear();
}

/** Cookie-session API client. Never accepts a workspace id: the server resolves it. */
export async function api<T>(
  path: `/api/${string}`,
  options: ApiOptions = {},
): Promise<T> {
  if ((options.method ?? "GET").toUpperCase() !== "GET") {
    getCache.clear();
    return performRequest<T>(path, options);
  }
  const cached = getCache.get(path);
  if (cached && cached.expiresAt > Date.now())
    return cached.promise as Promise<T>;
  const promise = performRequest<T>(path, {
    ...options,
    method: "GET",
  }).catch((error: unknown) => {
    // Never serve a failed response from the cache.
    getCache.delete(path);
    throw error;
  });
  getCache.set(path, { promise, expiresAt: Date.now() + GET_CACHE_TTL_MS });
  return promise;
}

async function performRequest<T>(
  path: `/api/${string}`,
  { body, timeoutMs = 12_000, headers, ...init }: ApiOptions,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const multipart = body instanceof FormData;
    const request: RequestInit = {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body === undefined || multipart
          ? {}
          : { "Content-Type": "application/json" }),
        ...headers,
      },
    };
    if (body !== undefined)
      request.body = multipart ? body : JSON.stringify(body);
    const response = await fetch(path, request);
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = parseError(payload);
      if (parsed)
        throw new ApiError(parsed.code, parsed.message, parsed.requestId);
      throw new ApiError(
        "network_error",
        "We could not complete that request. Please try again.",
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiError(
        "timeout",
        "The request took too long. Please try again.",
      );
    throw new ApiError(
      "network_error",
      "We could not reach HyperGenDoc. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const workspaceApi = {
  current: () => api<unknown>("/api/workspaces/current"),
  create: (name: string) =>
    api<unknown>("/api/workspaces", { method: "POST", body: { name } }),
};
