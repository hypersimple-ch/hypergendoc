import { Suspense } from "react";
import { InvitationForm } from "../../../components/auth-forms";
export default function InvitePage() {
  return (
    <>
      <p className="eyebrow">Workspace invitation</p>
      <h1>Join the document desk.</h1>
      <Suspense>
        <InvitationForm />
      </Suspense>
    </>
  );
}
