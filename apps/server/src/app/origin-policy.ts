const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function shouldRejectMutationOrigin(input: {
  readonly url: string;
  readonly method: string;
  readonly origin: string | undefined;
  readonly appOrigin: string;
}): boolean {
  return (
    input.url.startsWith("/api/") &&
    !SAFE_METHODS.has(input.method) &&
    !input.url.startsWith("/api/auth/") &&
    input.origin !== input.appOrigin
  );
}
