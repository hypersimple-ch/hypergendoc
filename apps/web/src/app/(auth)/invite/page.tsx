import { Suspense } from "react";
import { InvitationForm } from "../../../components/auth-forms";
export default function InvitePage() {
  return (
    <>
      <header className="auth-card__header">
        <p className="eyebrow">Workspace invitation</p>
        <h1>Join the document desk.</h1>
        <p>
          Accept to access the company brands and document history shared with
          you.
        </p>
      </header>
      <Suspense>
        <InvitationForm />
      </Suspense>
    </>
  );
}
