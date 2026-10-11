"use client";
import { useEffect, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { renderRequestTimeoutMs } from "../lib/api-client";
import { Button, Dialog } from "./primitives";

/** A display-only boundary: documents are never editable in the browser. */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{
    src: string;
    status: "loading" | "ready" | "error";
    url?: string;
  }>();
  useEffect(() => {
    if (!open) return;
    let active = true;
    let url: string | undefined;
    const controller = new AbortController();
    setResult({ src, status: "loading" });
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) setResult({ src, status: "error" });
    }, renderRequestTimeoutMs);
    void (async () => {
      try {
        const response = await fetch(src, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (
          !response.ok ||
          response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/pdf"
        )
          throw new Error("PDF unavailable");
        const blob = await response.blob();
        if (!active || controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setResult({ src, status: "ready", url });
      } catch {
        if (active) setResult({ src, status: "error" });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, src]);
  const current = result?.src === src ? result : undefined;
  const status = current?.status ?? "loading";
  const pdfUrl = current?.url ?? src;
  return (
    <>
      <Button
        tone="quiet"
        onClick={() => {
          setResult(undefined);
          setOpen(true);
        }}
      >
        <FileText className="size-4" aria-hidden="true" />
        Preview PDF
      </Button>
      <Dialog open={open} title={title} onClose={() => setOpen(false)}>
        {current?.url && (
          <div className="rounded-lg border border-border bg-muted p-2">
            <iframe
              className="pdf-preview !rounded-md !border-border !bg-card"
              title={`${title} PDF preview`}
              src={current.url}
            />
          </div>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {status === "loading"
            ? "Loading PDF preview…"
            : status === "error"
              ? "The inline preview is unavailable. Open or download the PDF instead."
              : "PDF ready. If the inline viewer is unavailable, open or download it."}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ExternalLink className="size-4 text-primary" aria-hidden="true" />
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open PDF in a new tab
          </a>
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href={pdfUrl}
            download
          >
            Download PDF file
          </a>
        </div>
      </Dialog>
    </>
  );
}
