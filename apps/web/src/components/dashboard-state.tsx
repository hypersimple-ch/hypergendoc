"use client";
import { useEffect, useState } from "react";
import { ApiError } from "../lib/api-client";
import { Status } from "./primitives";

export function useLoaded<T>(
  load: () => Promise<T>,
  deps: readonly unknown[] = [],
) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const reload = () => {
    setLoading(true);
    setError(undefined);
    load()
      .then(setValue)
      .catch((e: unknown) => setError(safeError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    reload();
  }, deps); // callers pass stable primitive dependencies
  return { value, error, loading, reload };
}
export function safeError(error: unknown) {
  if (error instanceof ApiError && error.code === "not_found")
    return "This item is unavailable in your workspace.";
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
          <button className="inline-button" onClick={retry}>
            Try again
          </button>
        )}
      </Status>
    );
  return null;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
