import { sql } from "drizzle-orm";
import {
  boolean,
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

/**
 * Better Auth's Drizzle adapter maps its core fields to `user`, `session`,
 * `account`, and `verification`. Keep these names and camelCase properties:
 * they are the adapter's documented PostgreSQL schema, not application copies.
 */
const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const workspaceRole = pgEnum("workspace_role", ["owner", "member"]);
export const renderStatus = pgEnum("render_status", [
  "pending",
  "ready",
  "failed",
]);
export const deletionStatus = pgEnum("deletion_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);
export const storedObjectPurpose = pgEnum("stored_object_purpose", [
  "logo",
  "source",
  "pdf",
  "other",
]);

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("membership_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("membership_user_id_idx").on(table.userId),
    index("membership_workspace_role_idx").on(table.workspaceId, table.role),
  ],
);

export const companies = pgTable(
  "companies",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("company_workspace_id_unique").on(table.workspaceId, table.id),
    unique("company_workspace_name_unique").on(table.workspaceId, table.name),
    index("company_workspace_idx").on(table.workspaceId),
  ],
);

export const storedObjects = pgTable(
  "stored_objects",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    /** Logo lineage is mandatory; source/PDF objects may also be company-bound. */
    companyId: uuid("company_id"),
    purpose: storedObjectPurpose("purpose").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("stored_object_workspace_id_unique").on(table.workspaceId, table.id),
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
    check(
      "stored_object_logo_requires_company",
      sql`${table.purpose} <> 'logo' OR ${table.companyId} IS NOT NULL`,
    ),
    check("stored_object_size_positive", sql`${table.byteSize} > 0`),
    check("stored_object_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
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
    currentVersionId: uuid("current_version_id"),
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
    index("document_current_version_idx").on(table.currentVersionId),
  ],
);
export const documentVersions = pgTable(
  "document_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    styleVersionId: uuid("style_version_id")
      .notNull()
      .references(() => styleVersions.id, { onDelete: "restrict" }),
    normalizedBody: text("normalized_body").notNull(),
    normalizedInputHash: text("normalized_input_hash").notNull(),
    sourceHash: text("source_hash"),
    outputHash: text("output_hash"),
    sourceObjectId: uuid("source_object_id").references(
      () => storedObjects.id,
      { onDelete: "restrict" },
    ),
    pdfObjectId: uuid("pdf_object_id").references(() => storedObjects.id, {
      onDelete: "restrict",
    }),
    rendererVersion: text("renderer_version"),
    status: renderStatus("status").notNull().default("pending"),
    safeDiagnostics: jsonb("safe_diagnostics"),
    createdByActorType: text("created_by_actor_type").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("document_version_unique").on(table.documentId, table.version),
    unique("document_version_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("document_version_workspace_document_id_unique").on(
      table.workspaceId,
      table.documentId,
      table.id,
    ),
    foreignKey({
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
      name: "document_versions_workspace_document_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.styleVersionId],
      foreignColumns: [styleVersions.workspaceId, styleVersions.id],
      name: "document_versions_workspace_style_version_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.sourceObjectId],
      foreignColumns: [storedObjects.workspaceId, storedObjects.id],
      name: "document_versions_workspace_source_object_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.pdfObjectId],
      foreignColumns: [storedObjects.workspaceId, storedObjects.id],
      name: "document_versions_workspace_pdf_object_fk",
    }).onDelete("restrict"),
    index("document_version_document_idx").on(table.documentId),
    check("document_version_positive", sql`${table.version} > 0`),
    check(
      "document_version_hash_hex",
      sql`${table.normalizedInputHash} ~ '^[0-9a-f]{64}$' AND (${table.sourceHash} IS NULL OR ${table.sourceHash} ~ '^[0-9a-f]{64}$') AND (${table.outputHash} IS NULL OR ${table.outputHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "document_version_lifecycle_fields",
      sql`(${table.status} = 'pending' AND ${table.sourceHash} IS NULL AND ${table.outputHash} IS NULL AND ${table.sourceObjectId} IS NULL AND ${table.pdfObjectId} IS NULL AND ${table.rendererVersion} IS NULL AND ${table.safeDiagnostics} IS NULL) OR (${table.status} = 'ready' AND ${table.sourceHash} IS NOT NULL AND ${table.outputHash} IS NOT NULL AND ${table.sourceObjectId} IS NOT NULL AND ${table.pdfObjectId} IS NOT NULL AND ${table.rendererVersion} IS NOT NULL AND ${table.rendererVersion} <> '' AND ${table.safeDiagnostics} IS NULL) OR (${table.status} = 'failed' AND ${table.sourceHash} IS NULL AND ${table.outputHash} IS NULL AND ${table.sourceObjectId} IS NULL AND ${table.pdfObjectId} IS NULL AND ${table.rendererVersion} IS NOT NULL AND ${table.rendererVersion} <> '' AND ${table.safeDiagnostics} IS NOT NULL)`,
    ),
    check(
      "document_version_creator_actor",
      sql`${table.createdByActorType} IN ('user', 'credential') AND ${table.createdByActorId} <> ''`,
    ),
  ],
);

export const renderRecords = pgTable(
  "render_records",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    status: renderStatus("status").notNull().default("pending"),
    rendererVersion: text("renderer_version"),
    normalizedInputHash: text("normalized_input_hash").notNull(),
    sourceHash: text("source_hash"),
    outputHash: text("output_hash"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    safeDiagnostics: jsonb("safe_diagnostics"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("render_record_version_unique").on(table.documentVersionId),
    foreignKey({
      columns: [table.workspaceId, table.documentVersionId],
      foreignColumns: [documentVersions.workspaceId, documentVersions.id],
      name: "render_records_workspace_document_version_fk",
    }).onDelete("cascade"),
    index("render_record_workspace_idx").on(table.workspaceId),
    check(
      "render_record_hash_hex",
      sql`${table.normalizedInputHash} ~ '^[0-9a-f]{64}$' AND (${table.sourceHash} IS NULL OR ${table.sourceHash} ~ '^[0-9a-f]{64}$') AND (${table.outputHash} IS NULL OR ${table.outputHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "render_record_lifecycle_fields",
      sql`(${table.status} = 'pending' AND ${table.sourceHash} IS NULL AND ${table.outputHash} IS NULL AND ${table.rendererVersion} IS NULL AND ${table.safeDiagnostics} IS NULL) OR (${table.status} = 'ready' AND ${table.sourceHash} IS NOT NULL AND ${table.outputHash} IS NOT NULL AND ${table.rendererVersion} IS NOT NULL AND ${table.rendererVersion} <> '' AND ${table.safeDiagnostics} IS NULL) OR (${table.status} = 'failed' AND ${table.sourceHash} IS NULL AND ${table.outputHash} IS NULL AND ${table.rendererVersion} IS NOT NULL AND ${table.rendererVersion} <> '' AND ${table.safeDiagnostics} IS NOT NULL)`,
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
