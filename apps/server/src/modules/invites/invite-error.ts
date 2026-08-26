/**
 * Typed invitation failure codes. Kept dependency-free so the platform error
 * handler can map it without pulling in service internals.
 */
export class InviteError extends Error {
  public constructor(
    public readonly code: "not_found" | "gone" | "conflict" | "forbidden",
  ) {
    super(code);
  }
}
