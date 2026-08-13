import { TemplateStudio } from "../../../../components/template-studio";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TemplateStudio templateId={id} />;
}
