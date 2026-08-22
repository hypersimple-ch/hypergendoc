import type { Metadata } from "next";
import { WorkspaceOverview } from "../../components/workspace-overview";

export const metadata: Metadata = { title: "Overview" };
export default function WorkspacePage() {
  return <WorkspaceOverview />;
}
