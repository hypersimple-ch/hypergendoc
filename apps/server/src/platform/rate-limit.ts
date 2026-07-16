export interface RateLimitInput {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
}
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}
export interface RateLimiter {
  consume(input: RateLimitInput): Promise<RateLimitResult>;
}
export function createInMemoryRateLimiter(
  now: () => number = Date.now,
): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    consume({ key, limit, windowMs }) {
      return new Promise<RateLimitResult>((resolve) => {
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          !Number.isInteger(windowMs) ||
          windowMs < 1
        )
          throw new Error("Rate limit and window must be positive integers");
        const current = buckets.get(key);
        const time = now();
        const bucket =
          current === undefined || current.resetAt <= time
            ? { count: 0, resetAt: time + windowMs }
            : current;
        bucket.count += 1;
        buckets.set(key, bucket);
        resolve({
          allowed: bucket.count <= limit,
          retryAfterMs: bucket.count <= limit ? 0 : bucket.resetAt - time,
        });
      });
    },
  };
}
