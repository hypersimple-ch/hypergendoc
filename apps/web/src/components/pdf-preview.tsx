"use client";
import { useState } from "react";
import { Button, Dialog } from "./primitives";

/** A display-only boundary: documents are never editable in the browser. */
export function PdfPreview({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button tone="quiet" onClick={() => setOpen(true)}>
        Preview PDF
      </Button>
      <Dialog open={open} title={title} onClose={() => setOpen(false)}>
        <iframe
          className="pdf-preview"
          title={`${title} PDF preview`}
          src={src}
          sandbox="allow-downloads"
        />
        <p>This is a read-only rendered artifact.</p>
      </Dialog>
    </>
  );
}
