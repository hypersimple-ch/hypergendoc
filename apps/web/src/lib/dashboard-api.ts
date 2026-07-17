import type {
  Company,
  CreateCompanyInput,
  Document,
  DocumentVersion,
  McpAction,
  McpCredential,
  Style,
  StyleDefinition,
  StyleVersion,
  WorkspaceRole,
} from "@hypergendoc/contracts";
import { ApiError, api } from "./api-client";

export type Member = {
  id: string;
  email: string;
  name?: string;
  role: WorkspaceRole;
  createdAt: string;
};
export type WorkspaceContext = { name?: string; role: WorkspaceRole };
export type CredentialCreation = { credential: McpCredential; token: string };
export type StyleDetail = { style: Style; versions: StyleVersion[] };
export type StyleCreation = { style: Style; version: StyleVersion };
export type DocumentDetail = {
  document: Document;
  versions: DocumentVersion[];
};

type Collection<T> = { items?: T[]; data?: T[] } | T[];
const items = <T>(value: Collection<T>): T[] =>
  Array.isArray(value) ? value : (value.items ?? value.data ?? []);

/** Dashboard adapters deliberately have no workspaceId argument. */
export const dashboardApi = {
  context: async (): Promise<WorkspaceContext> => {
    const value = (await api<unknown>("/api/workspaces/current")) as Record<
      string,
      unknown
    >;
    const membership = (value.membership ?? value) as Record<string, unknown>;
    return typeof value.name === "string"
      ? {
          name: value.name,
          role: membership.role === "owner" ? "owner" : "member",
        }
      : { role: membership.role === "owner" ? "owner" : "member" };
  },
  members: async () =>
    items<Member>(
      await api<Collection<Member>>("/api/workspaces/current/members"),
    ),
  invite: (email: string, role: WorkspaceRole) =>
    api<Member>("/api/workspaces/current/members", {
      method: "POST",
      body: { email, role },
    }),
  companies: async () =>
    items<Company>(await api<Collection<Company>>("/api/companies")),
  createCompany: (input: CreateCompanyInput) =>
    api<Company>("/api/companies", { method: "POST", body: input }),
  updateCompany: (id: string, input: Partial<CreateCompanyInput>) =>
    api<Company>(`/api/companies/${id}`, { method: "PATCH", body: input }),
  archiveCompany: (id: string) =>
    api<void>(`/api/companies/${id}`, { method: "DELETE" }),
  uploadLogo: async (id: string, file: File) => {
    if (file.size > 10 * 1024 * 1024)
      throw new ApiError(
        "validation_failed",
        "Choose an image smaller than 10 MiB.",
      );
    const form = new FormData();
    form.set("logo", file);
    const response = await fetch(`/api/companies/${id}/logo`, {
      method: "POST",
      credentials: "include",
      body: form,
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new ApiError(
        "network_error",
        "Logo upload could not be completed.",
      );
    return (await response.json().catch(() => undefined)) as unknown;
  },
  styles: async (companyId: string) =>
    items<Style>(
      await api<Collection<Style>>(`/api/companies/${companyId}/styles`),
    ),
  createStyle: async (input: {
    companyId: string;
    name: string;
    definition: StyleDefinition;
  }) => {
    const { style } = await api<StyleCreation>(
      `/api/companies/${input.companyId}/styles`,
      {
        method: "POST",
        body: input,
      },
    );
    return style;
  },
  style: async (id: string): Promise<StyleDetail> => {
    const style = await api<Style>(`/api/styles/${id}`);
    const versions = await api<StyleVersion[]>(`/api/styles/${id}/versions`);
    return { style, versions };
  },
  createStyleVersion: (
    id: string,
    definition: StyleDefinition,
    activate: boolean,
  ) =>
    api<StyleVersion>(`/api/styles/${id}/versions`, {
      method: "POST",
      body: { definition, activate },
    }),
  activateStyle: (id: string, versionId: string) =>
    api<Style>(`/api/styles/${id}/activate`, {
      method: "POST",
      body: { versionId },
    }),
  previewStyle: (id: string, definition: StyleDefinition) =>
    api<{ url: string }>(`/api/styles/${id}/preview`, {
      method: "POST",
      body: { definition },
    }),
  credentials: async () =>
    items<McpCredential>(
      await api<Collection<McpCredential>>("/api/mcp-credentials"),
    ),
  createCredential: (input: {
    name: string;
    companyIds: string[];
    actions: McpAction[];
    expiresAt?: string;
  }) =>
    api<CredentialCreation>("/api/mcp-credentials", {
      method: "POST",
      body: input,
    }),
  revokeCredential: (id: string) =>
    api<void>(`/api/mcp-credentials/${id}`, { method: "DELETE" }),
  documents: async () =>
    items<Document>(await api<Collection<Document>>("/api/documents")),
  document: (id: string): Promise<DocumentDetail> =>
    api<DocumentDetail>(`/api/documents/${id}`),
  documentVersion: (id: string, version: number) =>
    api<DocumentVersion>(`/api/documents/${id}/versions/${version}`),
  pdfUrl: (id: string, version: number) =>
    `/api/documents/${id}/versions/${version}/pdf`,
  sourceUrl: (id: string, version: number) =>
    `/api/documents/${id}/versions/${version}/source`,
};
