import { Suspense } from "react";
import { InvitationForm } from "../../../components/auth-forms";

export default function InvitePage() {
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Workspace invitation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Join the document desk.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
