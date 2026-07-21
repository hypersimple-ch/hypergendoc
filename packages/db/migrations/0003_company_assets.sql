ALTER TYPE "public"."stored_object_purpose" ADD VALUE 'font';--> statement-breakpoint
CREATE TABLE "company_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_color_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "company_color_company_value_unique" UNIQUE("company_id","color"),
	CONSTRAINT "company_color_lower_hex" CHECK ("company_colors"."color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "company_fonts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"stored_object_id" uuid,
	"built_in_family" text,
	"family_name" text NOT NULL,
	"subfamily_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_font_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "company_font_company_built_in_unique" UNIQUE("company_id","built_in_family"),
	CONSTRAINT "company_font_stored_object_unique" UNIQUE("stored_object_id"),
	CONSTRAINT "company_font_source_xor" CHECK (("company_fonts"."stored_object_id" IS NULL) <> ("company_fonts"."built_in_family" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "stored_objects" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_object_workspace_company_id_unique" UNIQUE("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "company_colors" ADD CONSTRAINT "company_colors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_colors" ADD CONSTRAINT "company_colors_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fonts" ADD CONSTRAINT "company_fonts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fonts" ADD CONSTRAINT "company_fonts_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fonts" ADD CONSTRAINT "company_fonts_stored_object_owner_fk" FOREIGN KEY ("workspace_id","company_id","stored_object_id") REFERENCES "public"."stored_objects"("workspace_id","company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_color_workspace_company_idx" ON "company_colors" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "company_font_workspace_company_idx" ON "company_fonts" USING btree ("workspace_id","company_id");