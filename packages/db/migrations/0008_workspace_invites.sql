ALTER TYPE "mail_job_kind" ADD VALUE 'workspace_invite';
--> statement-breakpoint
CREATE TABLE "workspace_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" "workspace_role" DEFAULT 'member' NOT NULL,
  "token_hash" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  CONSTRAINT "workspace_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_invite_token_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "workspace_invite_email_lowercase" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_pending_email_unique" ON "workspace_invites" USING btree ("workspace_id","email") WHERE "accepted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_token_hash_unique" ON "workspace_invites" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "workspace_invite_workspace_idx" ON "workspace_invites" USING btree ("workspace_id");
