import { WorkspaceForm } from "../../../components/auth-forms";
import { WorkspaceSetupBoundary } from "../../../components/workspace-shell";

export default function WorkspaceBootstrapPage() {
  return (
    <WorkspaceSetupBoundary>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Your first workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Name the room.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Workspace access is always determined by your signed-in membership.
        </p>
      </header>
      <WorkspaceForm />
    </WorkspaceSetupBoundary>
  );
}
