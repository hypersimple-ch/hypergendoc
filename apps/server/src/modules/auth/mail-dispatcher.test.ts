/* eslint-disable @typescript-eslint/unbound-method -- repository methods are Vitest mocks */
import { describe, expect, it, vi } from "vitest";
import { createMailDispatcher } from "./mail-dispatcher.js";
import type { ClaimedMail, MailJobRepository } from "./mail-queue.js";

function repository(job: ClaimedMail): MailJobRepository {
  return {
    enqueue: vi.fn(),
    recoverExpired: vi.fn().mockResolvedValue(1),
    claim: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
    markDelivered: vi.fn(),
    markFailed: vi.fn(),
  };
}
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const job: ClaimedMail = {
  id: "job-1",
  kind: "verification",
  recipient: "person@example.test",
  recipientName: "Person",
  url: "https://example.test/secret-token",
  attempts: 1,
  leaseToken: "lease-1",
};

describe("mail dispatcher", () => {
  it("recovers leases on startup and marks SMTP acceptance delivered", async () => {
    const repo = repository(job);
    const transport = { deliver: vi.fn().mockResolvedValue(undefined) };
    const log = logger();
    const dispatcher = createMailDispatcher({
      repository: repo,
      transport,
      logger: log,
      intervalMs: 60_000,
    });
    await dispatcher.start();
    await dispatcher.stop();
    expect(repo.recoverExpired).toHaveBeenCalledOnce();
    expect(transport.deliver).toHaveBeenCalledWith(job);
    expect(repo.markDelivered).toHaveBeenCalledWith(
      job.id,
      job.leaseToken,
      expect.any(Date),
    );
    expect(log.warn).toHaveBeenCalledWith(
      { event: "mail.leases_recovered", count: 1 },
      expect.any(String),
    );
  });

  it("backs off transient failures without logging recipient data", async () => {
    const repo = repository(job);
    const log = logger();
    const now = new Date("2026-01-01T00:00:00Z");
    const dispatcher = createMailDispatcher({
      repository: repo,
      transport: {
        deliver: vi.fn().mockRejectedValue(new Error("secret URL")),
      },
      logger: log,
      now: () => now,
    });
    await dispatcher.runOnce();
    expect(repo.markFailed).toHaveBeenCalledWith({
      id: job.id,
      leaseToken: job.leaseToken,
      failedAt: now,
      retryAt: new Date("2026-01-01T00:00:30Z"),
      terminal: false,
      errorCode: "transport_failed",
    });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(job.recipient);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(job.url);
  });

  it("dead-letters the final attempt", async () => {
    const finalJob = { ...job, attempts: 8 };
    const repo = repository(finalJob);
    const dispatcher = createMailDispatcher({
      repository: repo,
      transport: { deliver: vi.fn().mockRejectedValue(new Error("offline")) },
      logger: logger(),
    });
    await dispatcher.runOnce();
    expect(repo.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id, terminal: true }),
    );
  });
});
