"use client";
import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button, Dialog } from "./primitives";

/** A display-only boundary: documents are never editable in the browser. */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button tone="quiet" onClick={() => setOpen(true)}>
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
          />
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ExternalLink className="size-4 text-primary" aria-hidden="true" />
          This is a read-only rendered artifact.
        </p>
      </Dialog>
    </>
  );
}
