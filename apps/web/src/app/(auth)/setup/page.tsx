import { WorkspaceForm } from "../../../components/auth-forms";
export default function WorkspaceBootstrapPage() {
  return (
    <>
      <header className="auth-card__header">
        <p className="eyebrow">Your first workspace</p>
        <h1>Name the room.</h1>
        <p>
          Workspace access is always determined by your signed-in membership.
        </p>
      </header>
      <WorkspaceForm />
    </>
  );
}
