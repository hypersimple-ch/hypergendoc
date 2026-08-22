import type { Metadata } from "next";
import { TemplateStudio } from "../../../../components/template-studio";

export const metadata: Metadata = { title: "Template studio" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TemplateStudio templateId={id} />;
}
