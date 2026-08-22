import type { Metadata } from "next";
import { CompaniesDashboard } from "../../../components/companies-dashboard";

export const metadata: Metadata = { title: "Companies" };
export default function Page() {
  return <CompaniesDashboard />;
}
