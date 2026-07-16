import { normalizeLatexBody, wrapLatexDocument } from "@hypergendoc/latex";
import type { StyleDefinition } from "@hypergendoc/contracts";
import type {
  DocumentSourceBuilder,
  ResolvedDocumentSource,
} from "./service.js";

/** Canonical server-owned wrapper shared by persistence hashing and rendering. */
export function createLatexDocumentSourceBuilder(): DocumentSourceBuilder {
  return {
    resolve(body: string, style: StyleDefinition): ResolvedDocumentSource {
      const normalizedBody = normalizeLatexBody(body);
      // wrapLatexDocument validates/canonicalizes too; pass canonical input so the
      // bytes persisted for evidence are precisely the bytes rendered.
      return {
        normalizedBody,
        source: wrapLatexDocument(normalizedBody, style),
      };
    },
  };
}
