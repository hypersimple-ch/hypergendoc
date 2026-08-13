"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Document,
  DocumentCurrentSource,
  TemplateData,
} from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { safeError, useLoaded, LoadState } from "./dashboard-state";
import { Button, Status } from "./primitives";
import {
  requiredTemplateFieldError,
  TemplateDataForm,
} from "./template-data-form";

export function TemplateDocumentEditor({
  document,
  current,
  onSaved,
}: {
  document: Document;
  current: DocumentCurrentSource;
  onSaved: () => void;
}) {
  const stored = useMemo(() => {
    try {
      return JSON.parse(current.snapshot.body) as {
        schemaVersion: 1;
        templateVersionId: string;
        data: TemplateData;
      };
    } catch {
      return undefined;
    }
  }, [current.snapshot.body]);
  const detail = useLoaded(
    () =>
      document.templateId
        ? dashboardApi.template(document.templateId)
        : Promise.resolve(undefined),
    [document.templateId],
  );
  const version = detail.value?.versions.find(
    (candidate) => candidate.id === stored?.templateVersionId,
  );
  const [data, setData] = useState<TemplateData>(stored?.data ?? {});
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(
    () => setData(stored?.data ?? {}),
    [current.snapshot.commitSha, stored],
  );
  const dirty = Boolean(
    stored && JSON.stringify(stored.data) !== JSON.stringify(data),
  );

  async function save() {
    if (!stored || !version || pending.current) return;
    const dataError = requiredTemplateFieldError(
      version.definition.fields,
      data,
    );
    if (dataError) {
      setMessage({ text: dataError, error: true });
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.updateTemplateDocument(document.id, {
        templateVersionId: stored.templateVersionId,
        data,
      });
      setMessage({
        text: "Template data committed as a new revision.",
        error: false,
      });
      onSaved();
    } catch (error) {
      setMessage({ text: safeError(error), error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!stored || stored.schemaVersion !== 1)
    return (
      <Status kind="error">
        This template revision cannot be edited safely.
      </Status>
    );
  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4"
      aria-labelledby="template-document-editor-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="template-document-editor-heading" className="font-semibold">
            Template data
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit typed values and create an explicit immutable revision.
          </p>
        </div>
        <span className={dirty ? "badge" : "badge badge--muted"}>
          {dirty ? "Unsaved changes" : "Current revision"}
        </span>
      </div>
      <LoadState {...detail} />
      {version ? (
        <TemplateDataForm
          fields={version.definition.fields}
          data={data}
          companyId={document.companyId}
          disabled={busy}
          onChange={setData}
        />
      ) : detail.value ? (
        <Status kind="error">
          The pinned immutable template version was not found.
        </Status>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || !dirty || !version}
          onClick={() => void save()}
        >
          {busy ? "Committing…" : "Commit revision"}
        </Button>
        {message && (
          <Status kind={message.error ? "error" : "success"}>
            {message.text}
          </Status>
        )}
      </div>
    </section>
  );
}
