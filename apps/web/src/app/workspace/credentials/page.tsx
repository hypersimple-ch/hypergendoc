import type { Metadata } from "next";
import { CredentialsDashboard } from "../../../components/credentials-dashboard";

export const metadata: Metadata = { title: "MCP credentials" };
export default function Page() {
  return <CredentialsDashboard />;
}
