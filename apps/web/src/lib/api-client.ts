import type { ErrorEnvelope } from "@hypergendoc/contracts";

type ContractErrorCode = ErrorEnvelope["error"]["code"];
const errorCodes = new Set<ContractErrorCode>([
  "unauthenticated",
  "forbidden",
  "not_found",
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

/** Cookie-session API client. Never accepts a workspace id: the server resolves it. */
export async function api<T>(
  path: `/api/${string}`,
  options: ApiOptions = {},
): Promise<T> {
  const { body, timeoutMs = 12_000, headers, ...init } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const request: RequestInit = {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
    };
    if (body !== undefined) request.body = JSON.stringify(body);
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
