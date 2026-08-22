import { sql } from "drizzle-orm";
import type { Database } from "@hypergendoc/db";
import { mailJobs } from "@hypergendoc/db";

export type MailKind = "verification" | "password_reset";
export interface EnqueueMail {
  kind: MailKind;
  recipient: string;
  recipientName: string;
  url: string;
}
export interface ClaimedMail extends EnqueueMail {
  id: string;
  attempts: number;
  leaseToken: string;
}

export interface MailJobRepository {
  enqueue(input: EnqueueMail): Promise<void>;
  recoverExpired(now: Date): Promise<number>;
  claim(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
  }): Promise<ClaimedMail[]>;
  markDelivered(
    id: string,
    leaseToken: string,
    deliveredAt: Date,
  ): Promise<void>;
  markFailed(input: {
    id: string;
    leaseToken: string;
    retryAt: Date;
    failedAt: Date;
    terminal: boolean;
    errorCode: string;
  }): Promise<void>;
}

/** PostgreSQL is the acceptance boundary: enqueue resolves only after INSERT commits. */
export function createMailJobRepository(database: Database): MailJobRepository {
  return {
    async enqueue(input) {
      await database.insert(mailJobs).values({
        kind: input.kind,
        recipient: input.recipient,
        recipientName: input.recipientName,
        singleUseUrl: input.url,
      });
    },
    async recoverExpired(now) {
      const result = await database.execute(sql`
        UPDATE mail_jobs
        SET status = 'pending', lease_expires_at = NULL, lease_token = NULL, updated_at = ${now}
        WHERE status = 'leased' AND lease_expires_at <= ${now}
        RETURNING id
      `);
      return result.rows.length;
    },
    async claim(input) {
      const result = await database.execute(sql<{
        id: string;
        kind: MailKind;
        recipient: string;
        recipient_name: string;
        single_use_url: string;
        attempts: number;
        lease_token: string;
      }>`
        WITH candidates AS (
          SELECT id FROM mail_jobs
          WHERE status = 'pending' AND available_at <= ${input.now}
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE mail_jobs AS jobs
        SET status = 'leased', lease_expires_at = ${input.leaseUntil},
            attempts = jobs.attempts + 1, lease_token = gen_random_uuid(),
            updated_at = ${input.now}
        FROM candidates
        WHERE jobs.id = candidates.id
        RETURNING jobs.id, jobs.kind, jobs.recipient, jobs.recipient_name,
                  jobs.single_use_url, jobs.attempts, jobs.lease_token
      `);
      const rows = result.rows as unknown as Array<{
        id: string;
        kind: MailKind;
        recipient: string;
        recipient_name: string;
        single_use_url: string;
        attempts: number;
        lease_token: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        recipient: row.recipient,
        recipientName: row.recipient_name,
        url: row.single_use_url,
        attempts: row.attempts,
        leaseToken: row.lease_token,
      }));
    },
    async markDelivered(id, leaseToken, deliveredAt) {
      await database.execute(sql`
        UPDATE mail_jobs
        SET status = 'sent', single_use_url = NULL, lease_expires_at = NULL,
            lease_token = NULL,
            sent_at = ${deliveredAt}, updated_at = ${deliveredAt}, last_error_code = NULL
        WHERE id = ${id} AND status = 'leased' AND lease_token = ${leaseToken}
      `);
    },
    async markFailed(input) {
      if (input.terminal) {
        await database.execute(sql`
          UPDATE mail_jobs
          SET status = 'dead', single_use_url = NULL, lease_expires_at = NULL,
              lease_token = NULL,
              dead_at = ${input.failedAt}, updated_at = ${input.failedAt},
              last_error_code = ${input.errorCode}
          WHERE id = ${input.id} AND status = 'leased'
            AND lease_token = ${input.leaseToken}
        `);
      } else {
        await database.execute(sql`
          UPDATE mail_jobs
          SET status = 'pending', available_at = ${input.retryAt},
              lease_expires_at = NULL, lease_token = NULL, updated_at = ${input.failedAt},
              last_error_code = ${input.errorCode}
          WHERE id = ${input.id} AND status = 'leased'
            AND lease_token = ${input.leaseToken}
        `);
      }
    },
  };
}
