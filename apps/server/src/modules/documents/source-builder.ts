import {
  renderDocumentHtml,
  validateDocumentInput,
} from "@hypergendoc/document";
import type { DocumentFormat, StyleDefinition } from "@hypergendoc/contracts";
import type {
  DocumentSourceBuilder,
  ResolvedDocumentSource,
} from "./service.js";

/** Canonical server-owned resolved HTML shared by evidence hashing and rendering. */
export function createHtmlDocumentSourceBuilder(): DocumentSourceBuilder {
  return {
    resolve(
      format: DocumentFormat,
      body: string,
      style: StyleDefinition,
    ): ResolvedDocumentSource {
      const exactBody = validateDocumentInput(format, body);
      return {
        body: exactBody,
        source: renderDocumentHtml(exactBody, format, style),
      };
    },
  };
}
