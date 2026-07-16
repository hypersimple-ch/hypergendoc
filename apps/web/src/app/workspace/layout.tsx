import type { ReactNode } from "react";
import {
  SessionBoundary,
  WorkspaceShell,
} from "../../components/workspace-shell";
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <SessionBoundary>
      <WorkspaceShell>{children}</WorkspaceShell>
    </SessionBoundary>
  );
}
