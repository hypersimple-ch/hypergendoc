import type { Metadata } from "next";
import { TemplatesDashboard } from "../../../components/templates-dashboard";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return <TemplatesDashboard />;
}
