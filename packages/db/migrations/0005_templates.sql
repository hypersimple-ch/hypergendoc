ALTER TYPE "stored_object_purpose" ADD VALUE IF NOT EXISTS 'image';
--> statement-breakpoint
CREATE TABLE "templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "active_version_id" uuid,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "template_workspace_id_unique" UNIQUE("workspace_id", "id"),
  CONSTRAINT "template_workspace_company_id_unique" UNIQUE("workspace_id", "company_id", "id"),
  CONSTRAINT "template_company_name_unique" UNIQUE("company_id", "name"),
  CONSTRAINT "templates_workspace_company_fk" FOREIGN KEY ("workspace_id", "company_id") REFERENCES "companies"("workspace_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "style_version_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "template_version_unique" UNIQUE("template_id", "version"),
  CONSTRAINT "template_version_workspace_id_unique" UNIQUE("workspace_id", "id"),
  CONSTRAINT "template_version_workspace_company_id_unique" UNIQUE("workspace_id", "company_id", "id"),
  CONSTRAINT "template_version_positive" CHECK ("version" > 0),
  CONSTRAINT "template_versions_workspace_company_template_fk" FOREIGN KEY ("workspace_id", "company_id", "template_id") REFERENCES "templates"("workspace_id", "company_id", "id") ON DELETE CASCADE,
  CONSTRAINT "template_versions_workspace_style_fk" FOREIGN KEY ("workspace_id", "style_version_id") REFERENCES "style_versions"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "template_versions_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_active_version_fk" FOREIGN KEY ("workspace_id", "company_id", "active_version_id") REFERENCES "template_versions"("workspace_id", "company_id", "id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "template_id" uuid;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_company_template_fk" FOREIGN KEY ("workspace_id", "company_id", "template_id") REFERENCES "templates"("workspace_id", "company_id", "id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "template_workspace_company_idx" ON "templates" USING btree ("workspace_id", "company_id");
--> statement-breakpoint
CREATE INDEX "template_version_template_idx" ON "template_versions" USING btree ("template_id");
--> statement-breakpoint
CREATE INDEX "template_version_style_idx" ON "template_versions" USING btree ("style_version_id");
--> statement-breakpoint
CREATE INDEX "document_template_idx" ON "documents" USING btree ("template_id");
