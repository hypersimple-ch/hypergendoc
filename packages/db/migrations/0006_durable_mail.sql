CREATE TYPE "mail_job_kind" AS ENUM ('verification', 'password_reset');
--> statement-breakpoint
CREATE TYPE "mail_job_status" AS ENUM ('pending', 'leased', 'sent', 'dead');
--> statement-breakpoint
CREATE TABLE "mail_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "mail_job_kind" NOT NULL,
  "status" "mail_job_status" DEFAULT 'pending' NOT NULL,
  "recipient" text NOT NULL,
  "recipient_name" text NOT NULL,
  "single_use_url" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "lease_token" uuid,
  "last_error_code" text,
  "sent_at" timestamp with time zone,
  "dead_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_job_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "mail_job_url_lifecycle" CHECK (("status" IN ('pending', 'leased') AND "single_use_url" IS NOT NULL) OR ("status" IN ('sent', 'dead') AND "single_use_url" IS NULL)),
  CONSTRAINT "mail_job_lease_lifecycle" CHECK (("status" = 'leased' AND "lease_expires_at" IS NOT NULL AND "lease_token" IS NOT NULL) OR ("status" <> 'leased' AND "lease_expires_at" IS NULL AND "lease_token" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "mail_job_dispatch_idx" ON "mail_jobs" USING btree ("status", "available_at");
--> statement-breakpoint
CREATE INDEX "mail_job_lease_idx" ON "mail_jobs" USING btree ("status", "lease_expires_at");
