import type { ReactNode } from "react";
import { ActiveCompanyProvider } from "../../components/active-company";
import {
  SessionBoundary,
  WorkspaceShell,
} from "../../components/workspace-shell";
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <ActiveCompanyProvider>
      <SessionBoundary>
        <WorkspaceShell>{children}</WorkspaceShell>
      </SessionBoundary>
    </ActiveCompanyProvider>
  );
}
