"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Copy, FileStack, Plus } from "lucide-react";
import type {
  Company,
  Style,
  Template,
  TemplateDefinition,
} from "@hypergendoc/contracts";
import {
  dashboardApi,
  type StarterTemplateSummary,
} from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import {
  Button,
  Dialog,
  FormField,
  Input,
  PageHeader,
  Status,
} from "./primitives";
import { createdInactiveVersionFlag } from "./template-studio";

type TemplateApi = typeof dashboardApi & {
  templates: (companyId: string) => Promise<Template[]>;
  createTemplate: (input: {
    companyId: string;
    name: string;
    definition: TemplateDefinition;
  }) => Promise<Template>;
};
const templateApi = dashboardApi as TemplateApi;

export function starterTemplateDefinition(
  styleVersionId: string,
): TemplateDefinition {
  return {
    schemaVersion: 1,
    styleVersionId,
    description:
      "A clear, reusable document with a title, date, and rich-text body.",
    fields: {
      title: {
        type: "text",
        label: "Document heading",
        description: "The main heading shown at the top of the document.",
        required: true,
      },
      date: { type: "date", label: "Document date", required: true },
      body: {
        type: "richText",
        label: "Document body",
        description:
          "Add the document content. Accepts sanitized HTML fragments only (paragraphs, lists, links). CSS and JavaScript are not supported.",
        required: true,
      },
    },
    pageMasters: { standard: {} },
    document: [
      {
        type: "page",
        master: "standard",
        children: [
          {
            type: "stack",
            gapMm: 5,
            children: [
              {
                type: "heading",
                level: 1,
                content: [{ type: "binding", path: "title" }],
              },
              {
                type: "paragraph",
                content: [
                  { type: "text", value: "Prepared " },
                  { type: "binding", path: "date", format: "date" },
                ],
              },
              { type: "richText", source: "body" },
            ],
          },
        ],
      },
    ],
  };
}

export function TemplatesDashboard() {
  const {
    activeCompany,
    companies,
    loading,
    error: companyError,
    noActiveCompany,
    reload,
  } = useActiveCompany();
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [duplicatingId, setDuplicatingId] = useState<string>();
  const data = useLoaded(async () => {
    if (!activeCompany) return { templates: [], styles: [] };
    const [templates, styles] = await Promise.all([
      templateApi.templates(activeCompany.id),
      dashboardApi.styles(activeCompany.id),
    ]);
    return { templates, styles };
  }, [activeCompany?.id]);

  async function duplicateTemplate(template: Template) {
    if (duplicatingId) return;
    setDuplicatingId(template.id);
    setNotice(undefined);
    try {
      await templateApi.duplicateTemplate(template.id);
      data.reload();
      setNotice({ text: "Template duplicated as inactive copy", error: false });
    } catch (reason) {
      setNotice({ text: safeError(reason), error: true });
    } finally {
      setDuplicatingId(undefined);
    }
  }

  return (
    <div className="space-y-5 text-foreground">
      <PageHeader
        eyebrow="Content"
        title="Templates"
        description="Create governed, versioned templates that turn validated form data into consistent documents."
        aside={
          <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex">
            <FileStack className="size-4 text-primary" aria-hidden="true" />
            Typed data and immutable versions
          </div>
        }
      />
      {!activeCompany ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <LoadState loading={loading} error={companyError} reload={reload} />
          {noActiveCompany && (
            <Empty>
              <strong>Choose a company to manage templates</strong>
              <p>
                Templates and their styles are scoped to the active company.
              </p>
              <Link
                className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/workspace/companies"
              >
                Manage companies
              </Link>
            </Empty>
          )}
        </section>
      ) : (
        <>
          <LoadState {...data} />
          {data.value && (
            <>
              <section
                className="rounded-lg border border-border bg-card p-5 shadow-sm"
                aria-labelledby="new-template-title"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">New template</p>
                    <h2
                      id="new-template-title"
                      className="mt-1 text-lg font-semibold"
                    >
                      Start with an active style
                    </h2>
                  </div>
                  <Plus className="size-5 text-primary" aria-hidden="true" />
                </div>
                <TemplateCreate
                  companyId={activeCompany.id}
                  styles={data.value.styles}
                  existingNames={data.value.templates.map(
                    (template) => template.name,
                  )}
                />
              </section>
              <StarterGallery
                companies={companies.filter((company) => !company.archivedAt)}
                activeCompanyId={activeCompany.id}
              />
              <section
                className="rounded-lg border border-border bg-card shadow-sm"
                aria-labelledby="template-library-title"
              >
                <div className="flex items-center justify-between border-b border-border p-5">
                  <div>
                    <p className="eyebrow">Library</p>
                    <h2
                      id="template-library-title"
                      className="mt-1 text-lg font-semibold"
                    >
                      Templates for {activeCompany.name}
                    </h2>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {data.value.templates.length} total
                  </span>
                </div>
                {notice && (
                  <div
                    className="border-b border-border px-5 pt-4"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <Status kind={notice.error ? "error" : "success"}>
                      {notice.text}
                    </Status>
                  </div>
                )}
                <div className="p-5">
                  {data.value.templates.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {data.value.templates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          duplicating={duplicatingId === template.id}
                          onDuplicate={() => void duplicateTemplate(template)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty>
                      <strong>No templates for {activeCompany.name}</strong>
                      {data.value.styles.some(
                        (style) => style.activeVersionId,
                      ) ? (
                        <p>
                          Create a template above, then configure its fields and
                          layout in the studio.
                        </p>
                      ) : (
                        <>
                          <p>
                            Create and activate a style before creating the
                            first template.
                          </p>
                          <Link
                            className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                            href="/workspace/styles"
                          >
                            Open style library
                          </Link>
                        </>
                      )}
                    </Empty>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TemplateCreate({
  companyId,
  styles,
  existingNames,
}: {
  companyId: string;
  styles: Style[];
  existingNames: string[];
}) {
  const router = useRouter();
  const activeStyles = useMemo(
    () => styles.filter((style) => style.activeVersionId),
    [styles],
  );
  const [name, setName] = useState("");
  const [styleVersionId, setStyleVersionId] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const normalizedName = name.trim();
    if (
      existingNames.some(
        (existing) =>
          existing.trim().toLowerCase() === normalizedName.toLowerCase(),
      )
    ) {
      setError("A template with this name already exists for this company.");
      return;
    }
    if (!styleVersionId) {
      setError("Choose an active style before creating the template.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const template = await templateApi.createTemplate({
        companyId,
        name: normalizedName,
        definition: starterTemplateDefinition(styleVersionId),
      });
      router.push(`/workspace/templates/${template.id}`);
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!activeStyles.length) {
    return (
      <Empty>
        <strong>An active style is required</strong>
        <p>Create and activate a style version before building a template.</p>
        <Link
          className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/workspace/styles"
        >
          Open style library
        </Link>
      </Empty>
    );
  }

  return (
    <form
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
      onSubmit={(event) => void submit(event)}
    >
      <FormField label="Template name">
        <Input
          value={name}
          required
          maxLength={120}
          disabled={busy}
          placeholder="e.g. Client proposal"
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField label="Active style">
        <select
          className="input"
          required
          value={styleVersionId}
          disabled={busy}
          onChange={(event) => setStyleVersionId(event.target.value)}
        >
          <option value="">Choose a style</option>
          {activeStyles.map((style) => (
            <option key={style.id} value={style.activeVersionId ?? ""}>
              {style.name}
            </option>
          ))}
        </select>
      </FormField>
      <Button className="lg:min-w-40" type="submit" disabled={busy}>
        <Plus className="size-4" aria-hidden="true" />
        {busy ? "Creating…" : "Create template"}
      </Button>
      {error && (
        <div className="lg:col-span-3">
          <Status kind="error">{error}</Status>
        </div>
      )}
    </form>
  );
}

function TemplateCard({
  template,
  duplicating,
  onDuplicate,
}: {
  template: Template;
  duplicating: boolean;
  onDuplicate: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-lg border border-border p-4 transition hover:border-primary hover:shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span
          className={template.activeVersionId ? "badge" : "badge badge--quiet"}
        >
          {template.activeVersionId ? "Active" : "Inactive"}
        </span>
        <time dateTime={template.createdAt}>
          {new Date(template.createdAt).toLocaleDateString()}
        </time>
      </div>
      <div>
        <h3 className="font-semibold tracking-tight">{template.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {template.activeVersionId
            ? "Ready to create documents"
            : "Activate a version to use this template"}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          className="button button--quiet inline-flex items-center justify-between gap-2"
          href={`/workspace/templates/${template.id}`}
        >
          Open studio <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Button
          tone="quiet"
          disabled={duplicating}
          onClick={onDuplicate}
        >
          <Copy className="size-4" aria-hidden="true" />
          {duplicating ? "Duplicating…" : "Duplicate"}
        </Button>
      </div>
    </article>
  );
}

function StarterGallery({
  companies,
  activeCompanyId,
}: {
  companies: Company[];
  activeCompanyId: string;
}) {
  const router = useRouter();
  const starters = useLoaded(() => dashboardApi.starterTemplates(), []);
  const [selected, setSelected] = useState<StarterTemplateSummary>();

  if (!starters.value?.length && !starters.loading && !starters.error)
    return null;

  return (
    <section
      className="rounded-lg border border-border bg-card shadow-sm"
      aria-labelledby="starter-gallery-title"
    >
      <div className="border-b border-border p-5">
        <p className="eyebrow">Starters</p>
        <h2 id="starter-gallery-title" className="mt-1 text-lg font-semibold">
          Start from a template starter
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a ready-made template, then adjust it in the studio. New
          versions stay inactive until you review and activate them.
        </p>
      </div>
      <div className="p-5">
        <LoadState {...starters} />
        {starters.value && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {starters.value.map((starter) => (
              <article
                key={starter.id}
                className="grid content-start gap-3 rounded-lg border border-border p-4 transition hover:border-primary hover:shadow-sm"
              >
                <div>
                  <h3 className="font-semibold tracking-tight">
                    {starter.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {starter.description}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {starter.fieldCount}{" "}
                  {starter.fieldCount === 1 ? "field" : "fields"} ·{" "}
                  {starter.fieldKinds.join(", ")}
                </p>
                <Button
                  tone="quiet"
                  className="justify-self-start"
                  onClick={() => setSelected(starter)}
                >
                  Use starter
                </Button>
              </article>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <StarterCreateDialog
          starter={selected}
          companies={companies}
          initialCompanyId={activeCompanyId}
          onClose={() => setSelected(undefined)}
          onCreated={(template) => {
            setSelected(undefined);
            sessionStorage.setItem(
              createdInactiveVersionFlag(template.id),
              "1",
            );
            router.push(`/workspace/templates/${template.id}`);
          }}
        />
      )}
    </section>
  );
}

function StarterCreateDialog({
  starter,
  companies,
  initialCompanyId,
  onClose,
  onCreated,
}: {
  starter: StarterTemplateSummary;
  companies: Company[];
  initialCompanyId: string;
  onClose: () => void;
  onCreated: (template: Template) => void;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [name, setName] = useState(starter.name);
  const [styleVersionId, setStyleVersionId] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const styles = useLoaded(
    () =>
      companyId
        ? dashboardApi.styles(companyId)
        : Promise.resolve([] as Style[]),
    [companyId],
  );
  const activeStyles = useMemo(
    () => (styles.value ?? []).filter((style) => style.activeVersionId),
    [styles.value],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!companyId) {
      setError("Choose a company for the new template.");
      return;
    }
    if (!styleVersionId) {
      setError("Choose an active style before creating the template.");
      return;
    }
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Enter a template name.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const template = await dashboardApi.createTemplateFromStarter({
        companyId,
        starterId: starter.id,
        name: normalizedName,
        styleVersionId,
      });
      onCreated(template);
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={`New template from ${starter.name}`}
      description={starter.description}
      initialFocusRef={nameInput}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="grid gap-4 p-5 pt-0" onSubmit={(event) => void submit(event)}>
        <FormField label="Company">
          <select
            className="input"
            value={companyId}
            disabled={busy || !companies.length}
            onChange={(event) => {
              setCompanyId(event.target.value);
              setStyleVersionId("");
            }}
          >
            {!companies.length && <option value="">No active company</option>}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Active style">
          <select
            className="input"
            required
            value={styleVersionId}
            disabled={busy || styles.loading}
            onChange={(event) => setStyleVersionId(event.target.value)}
          >
            <option value="">Choose a style</option>
            {activeStyles.map((style) => (
              <option key={style.id} value={style.activeVersionId ?? ""}>
                {style.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Template name">
          <Input
            ref={nameInput}
            value={name}
            required
            maxLength={120}
            disabled={busy}
            placeholder="e.g. Client proposal"
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        {!styles.loading && companyId && !activeStyles.length && (
          <Status kind="warning">
            This company has no active style. Activate a style first.
          </Status>
        )}
        {error && <Status kind="error">{error}</Status>}
        <div className="dialog__actions">
          <Button tone="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !activeStyles.length}>
            {busy ? "Creating…" : "Create template"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
