-- Git history replaces database-held document revisions and render artifacts. Garage
-- bytes are not deleted here; only metadata for discarded non-logo objects is removed.
SET LOCAL hypergendoc.allow_purge = 'on';
--> statement-breakpoint
CREATE TEMP TABLE discarded_document_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE discarded_document_version_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE discarded_render_record_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE discarded_object_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO discarded_document_ids (id) SELECT id FROM documents;
--> statement-breakpoint
INSERT INTO discarded_document_version_ids (id) SELECT id FROM document_versions;
--> statement-breakpoint
INSERT INTO discarded_render_record_ids (id) SELECT id FROM render_records;
--> statement-breakpoint
INSERT INTO discarded_object_ids (id)
SELECT id FROM stored_objects WHERE purpose <> 'logo';
--> statement-breakpoint
DELETE FROM audit_events
WHERE target_id IN (
  SELECT id::text FROM discarded_document_ids
  UNION SELECT id::text FROM discarded_document_version_ids
  UNION SELECT id::text FROM discarded_render_record_ids
  UNION SELECT id::text FROM discarded_object_ids
);
--> statement-breakpoint
DELETE FROM deletion_jobs
WHERE target_id IN (
  SELECT id FROM discarded_document_ids
  UNION SELECT id FROM discarded_document_version_ids
  UNION SELECT id FROM discarded_render_record_ids
  UNION SELECT id FROM discarded_object_ids
);
--> statement-breakpoint
DROP TRIGGER IF EXISTS documents_tenant_lineage ON documents;
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "current_version_id";
--> statement-breakpoint
DELETE FROM render_records WHERE id IN (SELECT id FROM discarded_render_record_ids);
--> statement-breakpoint
DELETE FROM document_versions WHERE id IN (SELECT id FROM discarded_document_version_ids);
--> statement-breakpoint
DELETE FROM documents WHERE id IN (SELECT id FROM discarded_document_ids);
--> statement-breakpoint
DELETE FROM stored_objects WHERE id IN (SELECT id FROM discarded_object_ids);
--> statement-breakpoint
DROP TABLE "document_versions" CASCADE;
--> statement-breakpoint
DROP TABLE "render_records" CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS enforce_document_lineage();
--> statement-breakpoint
DROP FUNCTION IF EXISTS enforce_document_version_actor();
--> statement-breakpoint
DROP FUNCTION IF EXISTS enforce_document_version_artifacts();
--> statement-breakpoint
DROP FUNCTION IF EXISTS enforce_render_evidence();
--> statement-breakpoint
DROP FUNCTION IF EXISTS prevent_document_version_rewrite();
--> statement-breakpoint
DROP FUNCTION IF EXISTS prevent_render_record_rewrite();
--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_object_logo_requires_company";
--> statement-breakpoint
ALTER TABLE "stored_objects" ALTER COLUMN "purpose" SET DATA TYPE text;
--> statement-breakpoint
DROP TYPE "public"."stored_object_purpose";
--> statement-breakpoint
CREATE TYPE "public"."stored_object_purpose" AS ENUM('logo');
--> statement-breakpoint
ALTER TABLE "stored_objects" ALTER COLUMN "purpose" SET DATA TYPE "public"."stored_object_purpose" USING "purpose"::"public"."stored_object_purpose";
--> statement-breakpoint
ALTER TABLE "stored_objects" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint
DROP TYPE "public"."render_status";
--> statement-breakpoint
DROP TYPE "public"."document_format";
