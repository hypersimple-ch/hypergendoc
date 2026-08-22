import type { ClaimedMail, MailJobRepository } from "./mail-queue.js";

export interface MailTransport {
  deliver(job: ClaimedMail): Promise<void>;
}
export interface MailDispatcherLogger {
  info(fields: Readonly<Record<string, unknown>>, message: string): void;
  warn(fields: Readonly<Record<string, unknown>>, message: string): void;
  error(fields: Readonly<Record<string, unknown>>, message: string): void;
}
export interface MailDispatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  runOnce(): Promise<number>;
}

export function createMailDispatcher(options: {
  repository: MailJobRepository;
  transport: MailTransport;
  logger: MailDispatcherLogger;
  batchSize?: number;
  intervalMs?: number;
  leaseMs?: number;
  maxAttempts?: number;
  now?: () => Date;
}): MailDispatcher {
  const batchSize = options.batchSize ?? 10;
  const intervalMs = options.intervalMs ?? 2_000;
  const leaseMs = options.leaseMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 8;
  const now = options.now ?? (() => new Date());
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<number> | undefined;
  let stopped = true;

  const deliver = async (job: ClaimedMail) => {
    try {
      await options.transport.deliver(job);
    } catch {
      const failedAt = now();
      const terminal = job.attempts >= maxAttempts;
      const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** (job.attempts - 1));
      await options.repository.markFailed({
        id: job.id,
        leaseToken: job.leaseToken,
        retryAt: new Date(failedAt.getTime() + delayMs),
        failedAt,
        terminal,
        errorCode: "transport_failed",
      });
      const fields = {
        event: terminal ? "mail.dead_lettered" : "mail.retry_scheduled",
        jobId: job.id,
        kind: job.kind,
        attempt: job.attempts,
        ...(terminal ? {} : { retryDelayMs: delayMs }),
      };
      if (terminal) options.logger.error(fields, "Mail moved to dead letter");
      else options.logger.warn(fields, "Mail delivery will be retried");
      return;
    }
    await options.repository.markDelivered(job.id, job.leaseToken, now());
    options.logger.info(
      {
        event: "mail.delivered",
        jobId: job.id,
        kind: job.kind,
        attempt: job.attempts,
      },
      "Mail delivered",
    );
  };

  const runOnce = async () => {
    if (active) return active;
    active = (async () => {
      const claimedAt = now();
      const jobs = await options.repository.claim({
        now: claimedAt,
        leaseUntil: new Date(claimedAt.getTime() + leaseMs),
        limit: batchSize,
      });
      await Promise.all(jobs.map(deliver));
      return jobs.length;
    })();
    try {
      return await active;
    } finally {
      active = undefined;
    }
  };

  return {
    async start() {
      if (!stopped) return;
      stopped = false;
      const recovered = await options.repository.recoverExpired(now());
      if (recovered)
        options.logger.warn(
          { event: "mail.leases_recovered", count: recovered },
          "Recovered expired mail leases",
        );
      await runOnce();
      if (!stopped)
        timer = setInterval(() => {
          void runOnce().catch(() =>
            options.logger.error(
              { event: "mail.dispatch_failed" },
              "Mail dispatcher iteration failed",
            ),
          );
        }, intervalMs);
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await active;
    },
    runOnce,
  };
}
