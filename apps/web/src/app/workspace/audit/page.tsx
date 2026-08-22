import type { Metadata } from "next";
import { AuditDashboard } from "../../../components/audit-dashboard";

export const metadata: Metadata = { title: "Audit log" };
export default function Page() {
  return <AuditDashboard />;
}
