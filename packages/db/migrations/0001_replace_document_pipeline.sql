-- Legacy document input and derived artifacts are intentionally discarded. Garage bytes
-- are not deleted here; only their database metadata is removed.
SET LOCAL hypergendoc.allow_purge = 'on';
--> statement-breakpoint
CREATE TEMP TABLE legacy_document_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE legacy_document_version_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE legacy_render_record_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
CREATE TEMP TABLE legacy_document_object_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO legacy_document_ids (id) SELECT id FROM documents;
--> statement-breakpoint
INSERT INTO legacy_document_version_ids (id)
SELECT id FROM document_versions WHERE document_id IN (SELECT id FROM legacy_document_ids);
--> statement-breakpoint
INSERT INTO legacy_render_record_ids (id)
SELECT id FROM render_records WHERE document_version_id IN (SELECT id FROM legacy_document_version_ids);
--> statement-breakpoint
INSERT INTO legacy_document_object_ids (id)
SELECT id FROM stored_objects WHERE purpose IN ('source', 'pdf');
--> statement-breakpoint
DELETE FROM audit_events
WHERE target_id IN (
  SELECT id::text FROM legacy_document_ids
  UNION SELECT id::text FROM legacy_document_version_ids
  UNION SELECT id::text FROM legacy_render_record_ids
  UNION SELECT id::text FROM legacy_document_object_ids
);
--> statement-breakpoint
DELETE FROM deletion_jobs
WHERE target_id IN (
  SELECT id FROM legacy_document_ids
  UNION SELECT id FROM legacy_document_version_ids
  UNION SELECT id FROM legacy_render_record_ids
  UNION SELECT id FROM legacy_document_object_ids
);
--> statement-breakpoint
DELETE FROM render_records WHERE id IN (SELECT id FROM legacy_render_record_ids);
--> statement-breakpoint
DELETE FROM document_versions WHERE id IN (SELECT id FROM legacy_document_version_ids);
--> statement-breakpoint
DELETE FROM documents WHERE id IN (SELECT id FROM legacy_document_ids);
--> statement-breakpoint
DELETE FROM stored_objects
WHERE id IN (SELECT id FROM legacy_document_object_ids)
  AND purpose IN ('source', 'pdf');
--> statement-breakpoint
CREATE TYPE "public"."document_format" AS ENUM('markdown', 'html');
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "format" "document_format" NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_versions" RENAME COLUMN "normalized_body" TO "body";
--> statement-breakpoint
ALTER TABLE "document_versions" RENAME COLUMN "normalized_input_hash" TO "input_hash";
--> statement-breakpoint
ALTER TABLE "render_records" RENAME COLUMN "normalized_input_hash" TO "input_hash";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_render_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM document_versions d WHERE d.id = NEW.document_version_id AND d.workspace_id = NEW.workspace_id AND d.status = NEW.status AND d.renderer_version IS NOT DISTINCT FROM NEW.renderer_version AND d.input_hash = NEW.input_hash AND d.source_hash IS NOT DISTINCT FROM NEW.source_hash AND d.output_hash IS NOT DISTINCT FROM NEW.output_hash AND d.safe_diagnostics IS NOT DISTINCT FROM NEW.safe_diagnostics) THEN RAISE EXCEPTION 'render record evidence mismatch'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_document_version_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hypergendoc.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.style_version_id IS DISTINCT FROM OLD.style_version_id OR NEW.format IS DISTINCT FROM OLD.format OR NEW.body IS DISTINCT FROM OLD.body OR NEW.input_hash IS DISTINCT FROM OLD.input_hash OR NEW.created_by_actor_type IS DISTINCT FROM OLD.created_by_actor_type OR NEW.created_by_actor_id IS DISTINCT FROM OLD.created_by_actor_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status <> 'pending' OR NEW.status NOT IN ('ready', 'failed') THEN RAISE EXCEPTION 'document version is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_render_record_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hypergendoc.allow_purge', true) = 'on' THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.document_version_id IS DISTINCT FROM OLD.document_version_id OR NEW.input_hash IS DISTINCT FROM OLD.input_hash OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.created_at IS DISTINCT FROM OLD.created_at OR OLD.status <> 'pending' OR NEW.status NOT IN ('ready', 'failed') THEN RAISE EXCEPTION 'render record evidence is immutable'; END IF;
  RETURN NEW;
END $$;
