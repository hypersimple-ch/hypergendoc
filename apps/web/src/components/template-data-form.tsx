"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { FilePlus2, ImagePlus, Plus, Trash2 } from "lucide-react";
import type {
  CompanyImageAsset,
  Document,
  Template,
  TemplateData,
  TemplateFieldDefinition,
  TemplateValue,
  TemplateVersion,
} from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, PageHeader, Status } from "./primitives";

type TemplateApi = typeof dashboardApi & {
  uploadImage: (companyId: string, file: File) => Promise<CompanyImageAsset>;
};
const templateApi = dashboardApi as TemplateApi;

type Fields = Readonly<Record<string, TemplateFieldDefinition>>;

export function initialTemplateData(fields: Fields): TemplateData {
  const data: Record<string, TemplateValue> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.default !== undefined) data[key] = field.default;
    else if (field.type === "object")
      data[key] = initialTemplateData(field.fields ?? {});
    else if (field.type === "list") data[key] = [];
    else if (field.type === "boolean") data[key] = false;
  }
  return data;
}

export function requiredTemplateFieldError(
  fields: Fields,
  data: TemplateData,
  parent = "",
): string | undefined {
  for (const [key, field] of Object.entries(fields)) {
    const value = data[key];
    const label = parent ? `${parent} → ${field.label}` : field.label;
    if (value === undefined || value === null || value === "") {
      if (field.required) return `${label} is required.`;
      continue;
    }
    if (field.type === "object" && field.fields && isRecord(value)) {
      const error = requiredTemplateFieldError(field.fields, value, label);
      if (error) return error;
    }
    if (field.type === "list" && field.item && Array.isArray(value)) {
      for (const [index, item] of (
        value as readonly TemplateValue[]
      ).entries()) {
        const itemData: TemplateData = { item };
        const error = requiredTemplateFieldError(
          { item: field.item },
          itemData,
          `${label} item ${index + 1}`,
        );
        if (error) return error;
      }
    }
  }
  return undefined;
}

export function TemplateDataForm({
  fields,
  data,
  companyId,
  disabled = false,
  onChange,
}: {
  fields: Fields;
  data: TemplateData;
  companyId: string;
  disabled?: boolean;
  onChange: (data: TemplateData) => void;
}) {
  function update(key: string, value: TemplateValue | undefined) {
    const next: Record<string, TemplateValue> = { ...data };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  if (!Object.keys(fields).length) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        This template does not require any document data.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {Object.entries(fields).map(([key, field]) => (
        <TemplateField
          key={key}
          name={key}
          field={field}
          value={data[key]}
          companyId={companyId}
          disabled={disabled}
          onChange={(value) => update(key, value)}
        />
      ))}
    </div>
  );
}

function TemplateField({
  name,
  field,
  value,
  companyId,
  disabled,
  onChange,
}: {
  name: string;
  field: TemplateFieldDefinition;
  value: TemplateValue | undefined;
  companyId: string;
  disabled: boolean;
  onChange: (value: TemplateValue | undefined) => void;
}) {
  const inputId = `template-field-${useId().replaceAll(":", "")}`;
  const [uploadError, setUploadError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const uploadPending = useRef(false);
  const label = `${field.label}${field.required ? " (required)" : ""}`;

  if (field.type === "object") {
    const objectValue = isRecord(value) ? value : {};
    return (
      <fieldset className="grid gap-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        {field.description && (
          <p className="text-sm text-muted-foreground">{field.description}</p>
        )}
        {Object.entries(field.fields ?? {}).map(([childName, child]) => (
          <TemplateField
            key={childName}
            name={`${name}.${childName}`}
            field={child}
            value={objectValue[childName]}
            companyId={companyId}
            disabled={disabled}
            onChange={(nextValue) => {
              const next: Record<string, TemplateValue> = { ...objectValue };
              if (nextValue === undefined) delete next[childName];
              else next[childName] = nextValue;
              onChange(next);
            }}
          />
        ))}
      </fieldset>
    );
  }

  if (field.type === "list") {
    const list: readonly TemplateValue[] = Array.isArray(value)
      ? (value as readonly TemplateValue[])
      : [];
    return (
      <fieldset className="grid gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        {field.description && (
          <p className="text-sm text-muted-foreground">{field.description}</p>
        )}
        {!list.length && (
          <p className="text-sm text-muted-foreground">No items added yet.</p>
        )}
        {list.map((item, index) => (
          <div
            className="grid gap-3 rounded-md border border-border bg-muted/30 p-3"
            key={`${name}-${index}`}
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">Item {index + 1}</strong>
              <Button
                tone="quiet"
                aria-label={`Remove ${field.label} item ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onChange(list.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Remove
              </Button>
            </div>
            {field.item && (
              <TemplateField
                name={`${name}.${index}`}
                field={{
                  ...field.item,
                  label: `${field.item.label} ${index + 1}`,
                }}
                value={item}
                companyId={companyId}
                disabled={disabled}
                onChange={(nextValue) => {
                  const next = [...list];
                  next[index] = nextValue ?? defaultValue(field.item!);
                  onChange(next);
                }}
              />
            )}
          </div>
        ))}
        <Button
          className="justify-self-start"
          tone="quiet"
          disabled={disabled || list.length >= 500 || !field.item}
          onClick={() =>
            field.item && onChange([...list, defaultValue(field.item)])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Add {field.label.toLowerCase()} item
        </Button>
      </fieldset>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="field">
        <label className="flex items-start gap-3" htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            className="mt-1 size-4 rounded border-border accent-primary"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">{label}</span>
            {field.description && (
              <small className="block text-muted-foreground">
                {field.description}
              </small>
            )}
          </span>
        </label>
      </div>
    );
  }

  if (field.type === "image") {
    async function upload(file: File | undefined) {
      if (!file || uploadPending.current) return;
      uploadPending.current = true;
      setUploading(true);
      setUploadError(undefined);
      try {
        const image = await templateApi.uploadImage(companyId, file);
        onChange(image.id);
      } catch (reason) {
        setUploadError(safeError(reason));
      } finally {
        uploadPending.current = false;
        setUploading(false);
      }
    }
    return (
      <div className="grid gap-2">
        <FormField
          label={label}
          {...(field.description ? { hint: field.description } : {})}
          {...(uploadError ? { error: uploadError } : {})}
        >
          <Input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required={field.required && typeof value !== "string"}
            disabled={disabled || uploading}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ImagePlus className="size-4" aria-hidden="true" />
          {uploading
            ? "Uploading image…"
            : typeof value === "string"
              ? "Image ready for this document."
              : "PNG, JPEG, or WebP; maximum 10 MiB."}
          {typeof value === "string" && (
            <Button
              tone="quiet"
              disabled={disabled}
              onClick={() => onChange(undefined)}
            >
              Remove image
            </Button>
          )}
        </div>
        {uploading && <Status>Uploading image…</Status>}
      </div>
    );
  }

  if (field.options?.length) {
    return (
      <FormField
        label={label}
        {...(field.description ? { hint: field.description } : {})}
      >
        <select
          id={inputId}
          className="input"
          value={typeof value === "string" ? value : ""}
          required={field.required}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </FormField>
    );
  }

  if (field.type === "richText") {
    return (
      <FormField
        label={label}
        {...(field.description ? { hint: field.description } : {})}
      >
        <textarea
          id={inputId}
          className="input min-h-32 resize-y"
          value={typeof value === "string" ? value : ""}
          required={field.required}
          disabled={disabled}
          maxLength={100_000}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      </FormField>
    );
  }

  const numeric = field.type === "number" || field.type === "money";
  return (
    <FormField
      label={label}
      {...(field.description
        ? { hint: field.description }
        : field.type === "money"
          ? { hint: `Currency: ${field.currency ?? "USD"}` }
          : {})}
    >
      <Input
        id={inputId}
        type={numeric ? "number" : field.type === "date" ? "date" : "text"}
        value={
          numeric
            ? typeof value === "number"
              ? value
              : ""
            : typeof value === "string"
              ? value
              : ""
        }
        required={field.required}
        disabled={disabled}
        step={numeric ? "any" : undefined}
        maxLength={numeric ? undefined : 100_000}
        onChange={(event) => {
          if (!event.target.value) onChange(undefined);
          else
            onChange(numeric ? event.target.valueAsNumber : event.target.value);
        }}
      />
    </FormField>
  );
}

function isRecord(
  value: TemplateValue | undefined,
): value is Readonly<Record<string, TemplateValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultValue(field: TemplateFieldDefinition): TemplateValue {
  if (field.default !== undefined) return field.default;
  if (field.type === "object") return initialTemplateData(field.fields ?? {});
  if (field.type === "list") return [];
  if (field.type === "boolean") return false;
  if (field.type === "number" || field.type === "money") return 0;
  return "";
}

type TemplateDocumentApi = typeof dashboardApi & {
  templates: (companyId: string) => Promise<Template[]>;
  template: (
    id: string,
  ) => Promise<{ template: Template; versions: TemplateVersion[] }>;
  createTemplateDocument: (input: {
    companyId: string;
    templateId: string;
    title: string;
    data: TemplateData;
  }) => Promise<Document>;
};
const templateDocumentApi = dashboardApi as TemplateDocumentApi;

export function TemplateDocumentCreate() {
  const {
    activeCompany,
    loading: companyLoading,
    error: companyError,
    noActiveCompany,
    reload,
  } = useActiveCompany();
  const templates = useLoaded(
    () =>
      activeCompany
        ? templateDocumentApi.templates(activeCompany.id)
        : Promise.resolve([]),
    [activeCompany?.id],
  );
  const [templateId, setTemplateId] = useState("");
  const detail = useLoaded(
    () =>
      templateId
        ? templateDocumentApi.template(templateId)
        : Promise.resolve(undefined),
    [templateId],
  );
  const [title, setTitle] = useState("");
  const [data, setData] = useState<TemplateData>({});
  const [created, setCreated] = useState<Document>();
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    setTemplateId("");
    setTitle("");
    setData({});
    setCreated(undefined);
    setMessage(undefined);
  }, [activeCompany?.id]);

  const activeVersion = detail.value?.versions.find(
    (version) => version.id === detail.value?.template.activeVersionId,
  );

  useEffect(() => {
    if (activeVersion)
      setData(initialTemplateData(activeVersion.definition.fields));
  }, [activeVersion?.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCompany || !activeVersion || pending.current) return;
    pending.current = true;
    setBusy(true);
    setCreated(undefined);
    setMessage(undefined);
    try {
      const document = await templateDocumentApi.createTemplateDocument({
        companyId: activeCompany.id,
        templateId,
        title: title.trim(),
        data,
      });
      setCreated(document);
      setMessage({
        text: `“${document.title}” was created successfully.`,
        error: false,
      });
    } catch (reason) {
      setMessage({ text: safeError(reason), error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 text-foreground">
      <PageHeader
        eyebrow="Document creation"
        title="Create from a template."
        description="Choose an active template, complete its validated fields, and create a governed document revision."
        aside={
          <Link
            className="button button--quiet inline-flex items-center gap-2"
            href="/workspace/documents"
          >
            Back to documents
          </Link>
        }
      />
      {!activeCompany ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <LoadState
            loading={companyLoading}
            error={companyError}
            reload={reload}
          />
          {noActiveCompany && (
            <Empty>
              <strong>Choose a company to create a document</strong>
              <p>Templates are available within the active company.</p>
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
        <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <section
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
            aria-labelledby="document-setup-heading"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Step 1</p>
                <h2
                  id="document-setup-heading"
                  className="mt-1 text-lg font-semibold"
                >
                  Document setup
                </h2>
              </div>
              <FilePlus2 className="size-5 text-primary" aria-hidden="true" />
            </div>
            <LoadState {...templates} />
            {templates.value &&
              (templates.value.some((template) => template.activeVersionId) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Template">
                    <select
                      className="input"
                      required
                      value={templateId}
                      disabled={busy}
                      onChange={(event) => {
                        setTemplateId(event.target.value);
                        setCreated(undefined);
                        setMessage(undefined);
                      }}
                    >
                      <option value="">Choose an active template</option>
                      {templates.value
                        .filter((template) => template.activeVersionId)
                        .map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  <FormField label="Document title">
                    <Input
                      value={title}
                      required
                      maxLength={200}
                      disabled={busy}
                      placeholder="A clear internal title"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </FormField>
                </div>
              ) : (
                <Empty>
                  <strong>No active templates for {activeCompany.name}</strong>
                  <p>
                    Create and activate a template before creating a document.
                  </p>
                  <Link
                    className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href="/workspace/templates"
                  >
                    Open template library
                  </Link>
                </Empty>
              ))}
          </section>
          {templateId && (
            <section
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              aria-labelledby="document-data-heading"
            >
              <p className="eyebrow">Step 2</p>
              <h2
                id="document-data-heading"
                className="mt-1 text-lg font-semibold"
              >
                Document data
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fields are defined by the template’s active immutable version.
              </p>
              <div className="mt-5">
                <LoadState {...detail} />
                {detail.value && !activeVersion && (
                  <Status kind="warning">
                    This template no longer has an active version. Choose
                    another template.
                  </Status>
                )}
                {activeVersion && (
                  <TemplateDataForm
                    fields={activeVersion.definition.fields}
                    data={data}
                    companyId={activeCompany.id}
                    disabled={busy}
                    onChange={setData}
                  />
                )}
              </div>
            </section>
          )}
          {activeVersion && (
            <section
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              aria-label="Create document"
            >
              <div>
                <strong className="text-sm">Ready to create</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creation records the active template and style versions.
                </p>
              </div>
              <Button type="submit" disabled={busy}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                {busy ? "Creating…" : "Create document"}
              </Button>
            </section>
          )}
          {message && (
            <div aria-live="polite" aria-atomic="true">
              <Status kind={message.error ? "error" : "success"}>
                {message.text}
              </Status>
              {created && activeVersion && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    className="button button--quiet inline-flex items-center"
                    href="/workspace/documents"
                  >
                    View document library
                  </Link>
                  <Button
                    tone="quiet"
                    onClick={() => {
                      setTitle("");
                      setData(
                        initialTemplateData(activeVersion.definition.fields),
                      );
                      setCreated(undefined);
                      setMessage(undefined);
                    }}
                  >
                    Create another
                  </Button>
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
