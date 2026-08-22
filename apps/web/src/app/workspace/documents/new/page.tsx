import type { Metadata } from "next";
import { TemplateDocumentCreate } from "../../../../components/template-data-form";

export const metadata: Metadata = { title: "Create document" };

export default function Page() {
  return <TemplateDocumentCreate />;
}
