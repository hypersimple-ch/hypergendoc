"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Braces, Eye, FileInput, History, Save } from "lucide-react";
import type {
  Template,
  TemplateData,
  TemplateDefinition,
  TemplateVersion,
} from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, ConfirmDialog, PageHeader, Status } from "./primitives";
import {
  initialTemplateData,
  requiredTemplateFieldError,
  TemplateDataForm,
} from "./template-data-form";

type TemplateDetail = { template: Template; versions: TemplateVersion[] };
type TemplateApi = typeof dashboardApi & {
  template: (id: string) => Promise<TemplateDetail>;
  createTemplateVersion: (
    id: string,
    definition: TemplateDefinition,
    activate: boolean,
  ) => Promise<TemplateVersion>;
  activateTemplate: (id: string, versionId: string) => Promise<Template>;
  previewTemplate: (
    id: string,
    input: { definition: TemplateDefinition; data: TemplateData },
  ) => Promise<{ url: string }>;
};
const templateApi = dashboardApi as TemplateApi;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isTemplateDefinitionShape(
  value: unknown,
): value is TemplateDefinition {
  if (!isObjectRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.styleVersionId === "string" &&
    isObjectRecord(value.fields) &&
    isObjectRecord(value.pageMasters) &&
    Array.isArray(value.document)
  );
}

export function TemplateStudio({ templateId }: { templateId: string }) {
  const detail = useLoaded(
    () => templateApi.template(templateId),
    [templateId],
  );
  const [definition, setDefinition] = useState<TemplateDefinition>();
  const [savedDefinition, setSavedDefinition] = useState<TemplateDefinition>();
  const [source, setSource] = useState("");
  const [sampleData, setSampleData] = useState<TemplateData>({});
  const [mode, setMode] = useState<"definition" | "sample">("definition");
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"activate" | "leave">();
  const actionPending = useRef(false);

  useEffect(() => {
    if (!detail.value) return;
    const latest = detail.value.versions.at(-1)?.definition;
    if (!latest) return;
    setDefinition(latest);
    setSavedDefinition(latest);
    setSource(JSON.stringify(latest, null, 2));
    setSampleData(initialTemplateData(latest.fields));
  }, [detail.value]);

  const isDirty = useMemo(() => {
    if (!savedDefinition) return false;
    return source.trim() !== JSON.stringify(savedDefinition, null, 2).trim();
  }, [savedDefinition, source]);

  function parseDefinition(): TemplateDefinition | undefined {
    try {
      const parsed: unknown = JSON.parse(source);
      if (!isTemplateDefinitionShape(parsed)) {
        setMessage({
          text: "Definition must use schemaVersion 1 and include styleVersionId, fields, pageMasters, and document.",
          error: true,
        });
        return undefined;
      }
      const next = parsed;
      setDefinition(next);
      setSampleData((current) => dataForFields(next, current));
      setMessage({
        text: "Definition applied locally. Preview or save runs authoritative validation.",
        error: false,
      });
      return next;
    } catch {
      setMessage({ text: "Definition must be valid JSON.", error: true });
      return undefined;
    }
  }

  async function save(activate: boolean) {
    if (actionPending.current) return false;
    const next = parseDefinition();
    if (!next) return false;
    actionPending.current = true;
    setBusy(true);
    try {
      await templateApi.createTemplateVersion(templateId, next, activate);
      setSavedDefinition(next);
      setSource(JSON.stringify(next, null, 2));
      setMessage({
        text: activate
          ? "New version saved and activated."
          : "New inactive version saved.",
        error: false,
      });
      detail.reload();
      return true;
    } catch (reason) {
      setMessage({ text: safeError(reason), error: true });
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  async function activate(versionId: string) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await templateApi.activateTemplate(templateId, versionId);
      setMessage({ text: "Template version activated.", error: false });
      detail.reload();
    } catch (reason) {
      setMessage({ text: safeError(reason), error: true });
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  async function preview() {
    if (actionPending.current) return;
    const next = parseDefinition();
    if (!next) return;
    const dataError = requiredTemplateFieldError(next.fields, sampleData);
    if (dataError) {
      setMessage({ text: dataError, error: true });
      setMode("sample");
      return;
    }
    actionPending.current = true;
    const previewWindow = window.open("", "_blank");
    if (previewWindow?.document.body) {
      previewWindow.document.title = "Preparing template preview";
      const status = previewWindow.document.createElement("p");
      status.textContent = "Preparing your PDF preview…";
      status.setAttribute("role", "status");
      previewWindow.document.body.replaceChildren(status);
    }
    setBusy(true);
    setMessage({ text: "Preparing PDF preview…", error: false });
    try {
      const result = await templateApi.previewTemplate(templateId, {
        definition: next,
        data: sampleData,
      });
      if (!result.url || !previewWindow) {
        previewWindow?.close();
        setMessage({
          text: result.url
            ? "Your browser blocked the preview window. Allow pop-ups and try again."
            : "The preview is still being prepared. Try again shortly.",
          error: true,
        });
        return;
      }
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("Preview download failed");
      const objectUrl = URL.createObjectURL(
        new Blob([await response.arrayBuffer()], { type: "application/pdf" }),
      );
      previewWindow.opener = null;
      previewWindow.location.replace(objectUrl);
      setMessage({ text: "PDF preview opened in a new tab.", error: false });
    } catch (reason) {
      previewWindow?.close();
      setMessage({ text: safeError(reason), error: true });
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 text-foreground">
      <PageHeader
        eyebrow="Template studio"
        title={detail.value?.template.name ?? "Template"}
        description="Edit the typed definition, test it with representative data, and save immutable versions."
        aside={
          <Link
            className="button button--quiet inline-flex items-center gap-2"
            href="/workspace/templates"
            onClick={(event) => {
              if (
                isDirty &&
                !window.confirm("Leave without saving this template version?")
              ) {
                event.preventDefault();
              }
            }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Template library
          </Link>
        }
      />
      <LoadState {...detail} />
      {detail.value && definition && (
        <>
          <section
            className="rounded-lg border border-border bg-card shadow-sm"
            aria-labelledby="template-editor-heading"
          >
            <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="eyebrow">Workspace</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2
                    id="template-editor-heading"
                    className="text-lg font-semibold"
                  >
                    Definition and sample data
                  </h2>
                  <span
                    className={
                      isDirty
                        ? "rounded-md bg-warning-soft px-2 py-1 font-mono text-[11px] text-warning"
                        : "rounded-md bg-accent px-2 py-1 font-mono text-[11px] text-accent-foreground"
                    }
                  >
                    {isDirty ? "Unsaved changes" : "All changes saved"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  tone="quiet"
                  disabled={busy}
                  onClick={() => void preview()}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  Preview PDF
                </Button>
                <Button
                  tone="quiet"
                  disabled={busy}
                  onClick={() => void save(false)}
                >
                  Save inactive
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setConfirmation("activate")}
                >
                  <Save className="size-4" aria-hidden="true" />
                  Review & activate
                </Button>
              </div>
            </div>
            <div className="border-b border-border p-3">
              <div
                className="inline-flex rounded-md border border-border bg-muted p-1"
                role="group"
                aria-label="Template editor view"
              >
                <button
                  type="button"
                  aria-pressed={mode === "definition"}
                  className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium ${mode === "definition" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("definition")}
                >
                  <Braces className="size-4" aria-hidden="true" /> Definition
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "sample"}
                  className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium ${mode === "sample" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("sample")}
                >
                  <FileInput className="size-4" aria-hidden="true" /> Sample
                  data
                </button>
              </div>
            </div>
            <div className="p-5">
              {mode === "definition" ? (
                <div className="grid gap-3">
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="template-definition-source"
                    >
                      Template definition (JSON)
                    </label>
                    <p
                      id="template-definition-hint"
                      className="mt-1 text-sm text-muted-foreground"
                    >
                      Define fields, page masters, reusable components, and
                      document nodes. Basic JSON structure is checked here; the
                      complete path, type, reference, and safety contract is
                      enforced by the server before preview or save.
                    </p>
                  </div>
                  <textarea
                    id="template-definition-source"
                    aria-describedby="template-definition-hint"
                    className="min-h-[34rem] w-full resize-y rounded-md border border-border bg-background p-4 font-mono text-xs leading-5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={source}
                    disabled={busy}
                    spellCheck={false}
                    onChange={(event) => setSource(event.target.value)}
                  />
                  <Button
                    className="justify-self-start"
                    tone="quiet"
                    disabled={busy}
                    onClick={() => void parseDefinition()}
                  >
                    Apply fields locally
                  </Button>
                </div>
              ) : (
                <div className="mx-auto grid max-w-3xl gap-4">
                  <div>
                    <h3 className="font-semibold">
                      Representative preview data
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use safe sample values to confirm bindings, conditions,
                      lists, and image placement before activation.
                    </p>
                  </div>
                  <TemplateDataForm
                    fields={definition.fields}
                    data={sampleData}
                    companyId={detail.value.template.companyId}
                    disabled={busy}
                    onChange={setSampleData}
                  />
                </div>
              )}
              {message && (
                <div className="mt-4" aria-live="polite" aria-atomic="true">
                  <Status kind={message.error ? "error" : "success"}>
                    {message.text}
                  </Status>
                </div>
              )}
            </div>
          </section>
          <VersionHistory
            versions={detail.value.versions}
            activeVersionId={detail.value.template.activeVersionId}
            busy={busy}
            onActivate={(versionId) => void activate(versionId)}
          />
        </>
      )}
      <ConfirmDialog
        open={confirmation === "activate"}
        title="Save and activate this template version?"
        description="The definition and its style reference become an immutable version used for future documents. Existing documents remain unchanged."
        confirmLabel="Save and activate"
        tone="primary"
        pending={busy}
        onClose={() => setConfirmation(undefined)}
        onConfirm={() => {
          void save(true).then((saved) => {
            if (saved) setConfirmation(undefined);
          });
        }}
      />
    </div>
  );
}

function VersionHistory({
  versions,
  activeVersionId,
  busy,
  onActivate,
}: {
  versions: TemplateVersion[];
  activeVersionId: string | null;
  busy: boolean;
  onActivate: (versionId: string) => void;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-5 shadow-sm"
      aria-labelledby="template-version-history"
    >
      <h2
        id="template-version-history"
        className="flex items-center gap-2 text-lg font-semibold"
      >
        <History className="size-5 text-primary" aria-hidden="true" /> Version
        history
      </h2>
      <ol className="mt-4 grid gap-3">
        {[...versions].reverse().map((version) => {
          const active = version.id === activeVersionId;
          return (
            <li
              className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              key={version.id}
            >
              <div>
                <strong>Version {version.version}</strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {new Date(version.createdAt).toLocaleString()} ·
                  immutable
                </p>
              </div>
              {active ? (
                <span className="badge self-start sm:self-auto">Active</span>
              ) : (
                <Button
                  tone="quiet"
                  disabled={busy}
                  onClick={() => onActivate(version.id)}
                >
                  Activate version {version.version}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function dataForFields(
  definition: TemplateDefinition,
  current: TemplateData,
): TemplateData {
  const next: Record<string, TemplateData[string]> = {
    ...initialTemplateData(definition.fields),
  };
  for (const key of Object.keys(definition.fields)) {
    if (current[key] !== undefined) next[key] = current[key];
  }
  return next;
}
