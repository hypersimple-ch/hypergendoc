CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."deletion_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."render_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stored_object_purpose" AS ENUM('logo', 'source', 'pdf', 'other');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"request_id" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "company_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" "deletion_status" DEFAULT 'pending' NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"requested_by_user_id" text,
	"completed_at" timestamp with time zone,
	"safe_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"style_version_id" uuid NOT NULL,
	"normalized_body" text NOT NULL,
	"normalized_input_hash" text NOT NULL,
	"source_hash" text,
	"output_hash" text,
	"source_object_id" uuid,
	"pdf_object_id" uuid,
	"renderer_version" text,
	"status" "render_status" DEFAULT 'pending' NOT NULL,
	"safe_diagnostics" jsonb,
	"created_by_actor_type" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_unique" UNIQUE("document_id","version"),
	CONSTRAINT "document_version_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "document_version_workspace_document_id_unique" UNIQUE("workspace_id","document_id","id"),
	CONSTRAINT "document_version_positive" CHECK ("document_versions"."version" > 0),
	CONSTRAINT "document_version_hash_hex" CHECK ("document_versions"."normalized_input_hash" ~ '^[0-9a-f]{64}$' AND ("document_versions"."source_hash" IS NULL OR "document_versions"."source_hash" ~ '^[0-9a-f]{64}$') AND ("document_versions"."output_hash" IS NULL OR "document_versions"."output_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "document_version_lifecycle_fields" CHECK (("document_versions"."status" = 'pending' AND "document_versions"."source_hash" IS NULL AND "document_versions"."output_hash" IS NULL AND "document_versions"."source_object_id" IS NULL AND "document_versions"."pdf_object_id" IS NULL AND "document_versions"."renderer_version" IS NULL AND "document_versions"."safe_diagnostics" IS NULL) OR ("document_versions"."status" = 'ready' AND "document_versions"."source_hash" IS NOT NULL AND "document_versions"."output_hash" IS NOT NULL AND "document_versions"."source_object_id" IS NOT NULL AND "document_versions"."pdf_object_id" IS NOT NULL AND "document_versions"."renderer_version" IS NOT NULL AND "document_versions"."renderer_version" <> '' AND "document_versions"."safe_diagnostics" IS NULL) OR ("document_versions"."status" = 'failed' AND "document_versions"."source_hash" IS NULL AND "document_versions"."output_hash" IS NULL AND "document_versions"."source_object_id" IS NULL AND "document_versions"."pdf_object_id" IS NULL AND "document_versions"."renderer_version" IS NOT NULL AND "document_versions"."renderer_version" <> '' AND "document_versions"."safe_diagnostics" IS NOT NULL)),
	CONSTRAINT "document_version_creator_actor" CHECK ("document_versions"."created_by_actor_type" IN ('user', 'credential') AND "document_versions"."created_by_actor_id" <> '')
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"current_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "mcp_company_scopes" (
	"credential_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_company_scopes_credential_id_company_id_pk" PRIMARY KEY("credential_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lookup_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"actions" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_credential_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "mcp_credential_actions_nonempty" CHECK (cardinality("mcp_credentials"."actions") > 0)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_workspace_user_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "render_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"status" "render_status" DEFAULT 'pending' NOT NULL,
	"renderer_version" text,
	"normalized_input_hash" text NOT NULL,
	"source_hash" text,
	"output_hash" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"safe_diagnostics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "render_record_version_unique" UNIQUE("document_version_id"),
	CONSTRAINT "render_record_hash_hex" CHECK ("render_records"."normalized_input_hash" ~ '^[0-9a-f]{64}$' AND ("render_records"."source_hash" IS NULL OR "render_records"."source_hash" ~ '^[0-9a-f]{64}$') AND ("render_records"."output_hash" IS NULL OR "render_records"."output_hash" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "render_record_lifecycle_fields" CHECK (("render_records"."status" = 'pending' AND "render_records"."source_hash" IS NULL AND "render_records"."output_hash" IS NULL AND "render_records"."renderer_version" IS NULL AND "render_records"."safe_diagnostics" IS NULL) OR ("render_records"."status" = 'ready' AND "render_records"."source_hash" IS NOT NULL AND "render_records"."output_hash" IS NOT NULL AND "render_records"."renderer_version" IS NOT NULL AND "render_records"."renderer_version" <> '' AND "render_records"."safe_diagnostics" IS NULL) OR ("render_records"."status" = 'failed' AND "render_records"."source_hash" IS NULL AND "render_records"."output_hash" IS NULL AND "render_records"."renderer_version" IS NOT NULL AND "render_records"."renderer_version" <> '' AND "render_records"."safe_diagnostics" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid,
	"purpose" "stored_object_purpose" NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "stored_object_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "stored_object_logo_requires_company" CHECK ("stored_objects"."purpose" <> 'logo' OR "stored_objects"."company_id" IS NOT NULL),
	CONSTRAINT "stored_object_size_positive" CHECK ("stored_objects"."byte_size" > 0),
	CONSTRAINT "stored_object_sha256_hex" CHECK ("stored_objects"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "style_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"style_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "style_version_unique" UNIQUE("style_id","version"),
	CONSTRAINT "style_version_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "style_version_positive" CHECK ("style_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "styles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "style_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "style_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_jobs" ADD CONSTRAINT "deletion_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_jobs" ADD CONSTRAINT "deletion_jobs_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_style_version_id_style_versions_id_fk" FOREIGN KEY ("style_version_id") REFERENCES "public"."style_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_source_object_id_stored_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."stored_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_pdf_object_id_stored_objects_id_fk" FOREIGN KEY ("pdf_object_id") REFERENCES "public"."stored_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."documents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_style_version_fk" FOREIGN KEY ("workspace_id","style_version_id") REFERENCES "public"."style_versions"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_source_object_fk" FOREIGN KEY ("workspace_id","source_object_id") REFERENCES "public"."stored_objects"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_workspace_pdf_object_fk" FOREIGN KEY ("workspace_id","pdf_object_id") REFERENCES "public"."stored_objects"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_company_scopes" ADD CONSTRAINT "mcp_company_scopes_credential_id_mcp_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."mcp_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_company_scopes" ADD CONSTRAINT "mcp_company_scopes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_company_scopes" ADD CONSTRAINT "mcp_company_scopes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_company_scopes" ADD CONSTRAINT "mcp_company_scopes_workspace_credential_fk" FOREIGN KEY ("workspace_id","credential_id") REFERENCES "public"."mcp_credentials"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_company_scopes" ADD CONSTRAINT "mcp_company_scopes_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_records" ADD CONSTRAINT "render_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_records" ADD CONSTRAINT "render_records_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_records" ADD CONSTRAINT "render_records_workspace_document_version_fk" FOREIGN KEY ("workspace_id","document_version_id") REFERENCES "public"."document_versions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_versions" ADD CONSTRAINT "style_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_versions" ADD CONSTRAINT "style_versions_style_id_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_versions" ADD CONSTRAINT "style_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_versions" ADD CONSTRAINT "style_versions_workspace_style_fk" FOREIGN KEY ("workspace_id","style_id") REFERENCES "public"."styles"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styles" ADD CONSTRAINT "styles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styles" ADD CONSTRAINT "styles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styles" ADD CONSTRAINT "styles_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_event_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_request_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "company_workspace_idx" ON "companies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "deletion_job_workspace_status_idx" ON "deletion_jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "document_version_document_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_workspace_company_idx" ON "documents" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "document_current_version_idx" ON "documents" USING btree ("current_version_id");--> statement-breakpoint
CREATE INDEX "mcp_company_scope_workspace_company_idx" ON "mcp_company_scopes" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_credential_prefix_unique" ON "mcp_credentials" USING btree ("lookup_prefix");--> statement-breakpoint
CREATE INDEX "mcp_credential_workspace_idx" ON "mcp_credentials" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "membership_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "membership_workspace_role_idx" ON "memberships" USING btree ("workspace_id","role");--> statement-breakpoint
CREATE INDEX "render_record_workspace_idx" ON "render_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_object_key_unique" ON "stored_objects" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "stored_object_workspace_idx" ON "stored_objects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "stored_object_workspace_company_idx" ON "stored_objects" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "style_version_style_idx" ON "style_versions" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX "style_workspace_company_idx" ON "styles" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint

-- Circular current-version pointers are added only after both sides exist.
ALTER TABLE "styles" ADD CONSTRAINT "styles_active_version_same_workspace_fk" FOREIGN KEY ("workspace_id", "active_version_id") REFERENCES "style_versions" ("workspace_id", "id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_same_document_fk" FOREIGN KEY ("workspace_id", "id", "current_version_id") REFERENCES "document_versions" ("workspace_id", "document_id", "id") ON DELETE RESTRICT;--> statement-breakpoint

CREATE FUNCTION enforce_style_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM style_versions v WHERE v.id = NEW.active_version_id AND v.style_id = NEW.id AND v.workspace_id = NEW.workspace_id) THEN RAISE EXCEPTION 'style lineage mismatch'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE FUNCTION enforce_document_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.id = NEW.current_version_id AND v.document_id = NEW.id AND v.workspace_id = NEW.workspace_id) THEN RAISE EXCEPTION 'document lineage mismatch'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE FUNCTION enforce_document_version_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.created_by_actor_type = 'user' AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.created_by_actor_id)) OR (NEW.created_by_actor_type = 'credential' AND NOT EXISTS (SELECT 1 FROM mcp_credentials c WHERE c.workspace_id = NEW.workspace_id AND c.id::text = NEW.created_by_actor_id)) THEN RAISE EXCEPTION 'document version creator is not attributable to this workspace'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE FUNCTION enforce_document_version_artifacts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ready' AND NOT EXISTS (
    SELECT 1
    FROM documents d
    JOIN stored_objects source ON source.id = NEW.source_object_id
    JOIN stored_objects pdf ON pdf.id = NEW.pdf_object_id
    WHERE d.id = NEW.document_id
      AND d.workspace_id = NEW.workspace_id
      AND source.workspace_id = NEW.workspace_id
      AND source.company_id = d.company_id
      AND source.purpose = 'source'
      AND source.sha256 = NEW.source_hash
      AND pdf.workspace_id = NEW.workspace_id
      AND pdf.company_id = d.company_id
      AND pdf.purpose = 'pdf'
      AND pdf.sha256 = NEW.output_hash
  ) THEN RAISE EXCEPTION 'document version artifacts lack required private lineage'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE FUNCTION enforce_render_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM document_versions d WHERE d.id = NEW.document_version_id AND d.workspace_id = NEW.workspace_id AND d.status = NEW.status AND d.renderer_version IS NOT DISTINCT FROM NEW.renderer_version AND d.normalized_input_hash = NEW.normalized_input_hash AND d.source_hash IS NOT DISTINCT FROM NEW.source_hash AND d.output_hash IS NOT DISTINCT FROM NEW.output_hash AND d.safe_diagnostics IS NOT DISTINCT FROM NEW.safe_diagnostics) THEN RAISE EXCEPTION 'render record evidence mismatch'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER styles_tenant_lineage BEFORE INSERT OR UPDATE ON styles FOR EACH ROW EXECUTE FUNCTION enforce_style_lineage();--> statement-breakpoint
CREATE TRIGGER documents_tenant_lineage BEFORE INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION enforce_document_lineage();--> statement-breakpoint
CREATE TRIGGER document_versions_tenant_lineage BEFORE INSERT OR UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION enforce_document_version_actor();--> statement-breakpoint
CREATE TRIGGER document_versions_artifact_lineage BEFORE INSERT OR UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION enforce_document_version_artifacts();--> statement-breakpoint
CREATE TRIGGER render_records_tenant_lineage BEFORE INSERT OR UPDATE ON render_records FOR EACH ROW EXECUTE FUNCTION enforce_render_evidence();--> statement-breakpoint

-- Version and render evidence may transition once from pending, but never be rewritten or removed.
CREATE FUNCTION prevent_style_version_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hypergendoc.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'style versions are immutable';
END $$;--> statement-breakpoint
CREATE FUNCTION prevent_document_version_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hypergendoc.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.style_version_id IS DISTINCT FROM OLD.style_version_id OR NEW.normalized_body IS DISTINCT FROM OLD.normalized_body OR NEW.normalized_input_hash IS DISTINCT FROM OLD.normalized_input_hash OR NEW.created_by_actor_type IS DISTINCT FROM OLD.created_by_actor_type OR NEW.created_by_actor_id IS DISTINCT FROM OLD.created_by_actor_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status <> 'pending' OR NEW.status NOT IN ('ready', 'failed') THEN RAISE EXCEPTION 'document version is immutable'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE FUNCTION prevent_render_record_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hypergendoc.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.document_version_id IS DISTINCT FROM OLD.document_version_id OR NEW.normalized_input_hash IS DISTINCT FROM OLD.normalized_input_hash OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status <> 'pending' OR NEW.status NOT IN ('ready', 'failed') THEN RAISE EXCEPTION 'render record evidence is immutable'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE FUNCTION prevent_audit_event_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hypergendoc.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'audit events are append-only';
END $$;--> statement-breakpoint
CREATE TRIGGER style_versions_immutable BEFORE UPDATE OR DELETE ON style_versions FOR EACH ROW EXECUTE FUNCTION prevent_style_version_rewrite();--> statement-breakpoint
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION prevent_document_version_rewrite();--> statement-breakpoint
CREATE TRIGGER render_records_immutable BEFORE UPDATE OR DELETE ON render_records FOR EACH ROW EXECUTE FUNCTION prevent_render_record_rewrite();--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_rewrite();