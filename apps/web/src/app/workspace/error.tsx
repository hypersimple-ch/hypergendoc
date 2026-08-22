"use client";

import { Button } from "../../components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="panel feature-state" role="alert">
      <p className="eyebrow">Workspace error</p>
      <h1>We could not open this workspace page.</h1>
      <p>
        Try the request again. If it keeps failing, share the request time with
        your workspace administrator.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs">Reference: {error.digest}</p>
      ) : null}
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
