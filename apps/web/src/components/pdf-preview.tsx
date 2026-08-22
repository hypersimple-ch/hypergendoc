"use client";
import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button, Dialog } from "./primitives";

/** A display-only boundary: documents are never editable in the browser. */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  return (
    <>
      <Button
        tone="quiet"
        onClick={() => {
          setStatus("loading");
          setOpen(true);
        }}
      >
        <FileText className="size-4" aria-hidden="true" />
        Preview PDF
      </Button>
      <Dialog open={open} title={title} onClose={() => setOpen(false)}>
        <div className="rounded-lg border border-border bg-muted p-2">
          <iframe
            className="pdf-preview !rounded-md !border-border !bg-card"
            title={`${title} PDF preview`}
            src={src}
            sandbox="allow-downloads"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {status === "loading"
            ? "Loading PDF preview…"
            : status === "error"
              ? "The inline preview is unavailable. Open or download the PDF instead."
              : "PDF preview loaded."}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <ExternalLink className="size-4 text-primary" aria-hidden="true" />
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href={src}
            target="_blank"
            rel="noreferrer"
          >
            Open PDF in a new tab
          </a>
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href={src}
            download
          >
            Download PDF file
          </a>
        </div>
      </Dialog>
    </>
  );
}
