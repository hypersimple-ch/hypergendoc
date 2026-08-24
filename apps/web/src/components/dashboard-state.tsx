"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api-client";
import { Status } from "./primitives";

export function useLoaded<T>(
  load: () => Promise<T>,
  deps: readonly unknown[] = [],
) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const reload = () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(undefined);
    load()
      .then((result) => {
        // A successful load always supersedes a previous failure.
        if (requestId.current === currentRequest) {
          setValue(result);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (requestId.current === currentRequest) setError(safeError(e));
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  };
  useEffect(() => {
    reload();
    return () => {
      requestId.current++;
    };
  }, deps); // callers pass stable primitive dependencies
  return { value, error, loading, reload };
}
/** Codes that mean transport or server trouble, not a workspace permission problem. */
const transientCodes = new Set([
  "network_error",
  "timeout",
  "internal_error",
  "dependency_unavailable",
]);
export function safeError(error: unknown) {
  if (error instanceof ApiError && error.code === "not_found")
    return "This item is unavailable in your workspace.";
  if (error instanceof ApiError && transientCodes.has(error.code))
    return "We could not reach the server. Check your connection and try again.";
  return error instanceof ApiError
    ? error.message
    : "We could not load this page. Please try again.";
}
export function LoadState({
  loading,
  error,
  onRetry,
  reload,
}: {
  loading: boolean;
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
  reload?: (() => void) | undefined;
}) {
  const retry = onRetry ?? reload;
  if (loading) return <Status>Loading secure workspace data…</Status>;
  if (error)
    return (
      <Status kind="error">
        {error}{" "}
        {retry && (
          <button type="button" className="inline-button" onClick={retry}>
            Try again
          </button>
        )}
      </Status>
    );
  return null;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      {children}
    </div>
  );
}
