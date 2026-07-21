import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  accounts,
  companies,
  createdAt,
  deletionStatus,
  id,
  sessions,
  users,
  verifications,
  workspaces,
} from "./core-schema.js";

export * from "./core-schema.js";

export const storedObjectPurpose = pgEnum("stored_object_purpose", [
  "logo",
  "font",
]);

export const storedObjects = pgTable(
  "stored_objects",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").notNull(),
    purpose: storedObjectPurpose("purpose").notNull(),
    displayName: text("display_name"),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("stored_object_workspace_id_unique").on(table.workspaceId, table.id),
    unique("stored_object_workspace_company_id_unique").on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex("stored_object_key_unique").on(table.objectKey),
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: "stored_objects_workspace_company_fk",
    }).onDelete("restrict"),
    index("stored_object_workspace_idx").on(table.workspaceId),
    index("stored_object_workspace_company_idx").on(
      table.workspaceId,
      table.companyId,
    ),
    check("stored_object_size_positive", sql`${table.byteSize} > 0`),
    check("stored_object_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const companyFonts = pgTable(
  "company_fonts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").notNull(),
    storedObjectId: uuid("stored_object_id"),
    builtInFamily: text("built_in_family"),
    familyName: text("family_name").notNull(),
    subfamilyName: text("subfamily_name"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("company_font_workspace_id_unique").on(table.workspaceId, table.id),
    unique("company_font_company_built_in_unique").on(
      table.companyId,
      table.builtInFamily,
    ),
    unique("company_font_stored_object_unique").on(table.storedObjectId),
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: "company_fonts_workspace_company_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.companyId, table.storedObjectId],
      foreignColumns: [
        storedObjects.workspaceId,
        storedObjects.companyId,
        storedObjects.id,
      ],
      name: "company_fonts_stored_object_owner_fk",
    }).onDelete("restrict"),
    index("company_font_workspace_company_idx").on(
      table.workspaceId,
      table.companyId,
    ),
    check(
      "company_font_source_xor",
      sql`(${table.storedObjectId} IS NULL) <> (${table.builtInFamily} IS NULL)`,
    ),
  ],
);

export const companyColors = pgTable(
  "company_colors",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").notNull(),
    color: text("color").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("company_color_workspace_id_unique").on(table.workspaceId, table.id),
    unique("company_color_company_value_unique").on(
      table.companyId,
      table.color,
    ),
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: "company_colors_workspace_company_fk",
    }).onDelete("cascade"),
    index("company_color_workspace_company_idx").on(
      table.workspaceId,
      table.companyId,
    ),
    check("company_color_lower_hex", sql`${table.color} ~ '^#[0-9a-f]{6}$'`),
  ],
);

export const styles = pgTable(
  "styles",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    activeVersionId: uuid("active_version_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("style_workspace_id_unique").on(table.workspaceId, table.id),
    unique("style_company_name_unique").on(table.companyId, table.name),
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: "styles_workspace_company_fk",
    }).onDelete("cascade"),
    index("style_workspace_company_idx").on(table.workspaceId, table.companyId),
  ],
);
export const styleVersions = pgTable(
  "style_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    styleId: uuid("style_id")
      .notNull()
      .references(() => styles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("style_version_unique").on(table.styleId, table.version),
    unique("style_version_workspace_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.styleId],
      foreignColumns: [styles.workspaceId, styles.id],
      name: "style_versions_workspace_style_fk",
    }).onDelete("cascade"),
    index("style_version_style_idx").on(table.styleId),
    check("style_version_positive", sql`${table.version} > 0`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("document_workspace_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: "documents_workspace_company_fk",
    }).onDelete("restrict"),
    index("document_workspace_company_idx").on(
      table.workspaceId,
      table.companyId,
    ),
  ],
);
export const mcpCredentials = pgTable(
  "mcp_credentials",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lookupPrefix: text("lookup_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    actions: text("actions").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("mcp_credential_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("mcp_credential_prefix_unique").on(table.lookupPrefix),
    index("mcp_credential_workspace_idx").on(table.workspaceId),
    check(
      "mcp_credential_actions_nonempty",
      sql`cardinality(${table.actions}) > 0`,
    ),
  ],
);
export const mcpCompanyScopes = pgTable(
  "mcp_company_scopes",
  {
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => mcpCredentials.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.credentialId, table.companyId] }),
    foreignKey({
      columns: [table.workspaceId, table.credentialId],
      foreignColumns: [mcpCredentials.workspaceId, mcpCredentials.id],
      name: "mcp_company_scopes_workspace_credential_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
      name: "mcp_company_scopes_workspace_company_fk",
    }).onDelete("cascade"),
    index("mcp_company_scope_workspace_company_idx").on(
      table.workspaceId,
      table.companyId,
    ),
  ],
);

export const deletionJobs = pgTable(
  "deletion_jobs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: deletionStatus("status").notNull().default("pending"),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    safeError: text("safe_error"),
    createdAt: createdAt(),
  },
  (table) => [
    index("deletion_job_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id").notNull(),
    outcome: text("outcome").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_event_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("audit_event_request_idx").on(table.requestId),
  ],
);

export const betterAuthSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
};
