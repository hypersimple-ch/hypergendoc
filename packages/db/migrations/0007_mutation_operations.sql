CREATE TYPE "public"."mutation_operation_status" AS ENUM('pending', 'external_applied', 'completed', 'reconcile_required');--> statement-breakpoint
CREATE TABLE "mutation_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"external_reference" text,
	"status" "mutation_operation_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"safe_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "mutation_operation_attempts_nonnegative" CHECK ("mutation_operations"."attempts" >= 0),
	CONSTRAINT "mutation_operation_safe_error_code" CHECK ("mutation_operations"."safe_error_code" is null or "mutation_operations"."safe_error_code" ~ '^[a-z0-9_]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "mutation_operations" ADD CONSTRAINT "mutation_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mutation_operation_idempotency_unique" ON "mutation_operations" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "mutation_operation_reconcile_idx" ON "mutation_operations" USING btree ("status","updated_at");--> statement-breakpoint
