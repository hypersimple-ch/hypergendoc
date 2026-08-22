import type { Metadata } from "next";
import { DocumentsDashboard } from "../../../components/documents-dashboard";

export const metadata: Metadata = { title: "Documents" };
export default function Page() {
  return <DocumentsDashboard />;
}
